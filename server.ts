import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface TranslationResponsePayload {
  transliteratedName: string;
  scriptLabel: string;
  translatedUi: Record<string, string>;
  translatedTerms: Record<string, string>;
  quotaFallback?: boolean;
}

const serverTranslationCache = new Map<string, TranslationResponsePayload>();

function isQuotaError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  const lower = text.toLowerCase();
  return (
    text.includes('429') ||
    text.includes('503') ||
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('UNAVAILABLE') ||
    lower.includes('high demand') ||
    lower.includes('quota') ||
    lower.includes('timed out')
  );
}

function extractYouTubeIdServer(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const vParam = parsed.searchParams.get('v');
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v')
    ) {
      const candidate = parts[1];
      return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
    }
  }
  return null;
}

function splitArtistAndTitle(rawTitle?: string, rawAuthor?: string): { title: string; artist: string } {
  const cleanTitle = (rawTitle || '').trim();
  const cleanAuthor = (rawAuthor || '').replace(/\s*-\s*Topic$/i, '').trim();

  if (cleanTitle.includes(' - ')) {
    const [left, ...rest] = cleanTitle.split(' - ');
    const right = rest.join(' - ').replace(/\s*\(Official.*?\)\s*/gi, '').trim();
    if (left.trim() && right) {
      return { artist: left.trim(), title: right };
    }
  }

  return {
    title: cleanTitle.replace(/\s*\(Official.*?\)\s*/gi, '').trim() || 'Canción sin título',
    artist: cleanAuthor || 'Artista',
  };
}

async function fetchYouTubeOEmbed(youtubeId: string): Promise<{ title?: string; author_name?: string }> {
  const controller = new AbortController();
  const target = `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fetchEndpoint = async (endpoint: string): Promise<{ title?: string; author_name?: string }> => {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { title?: string; author_name?: string };
    if (!data?.title && !data?.author_name) throw new Error('Empty metadata');
    return data;
  };

  try {
    const raceMetadata = Promise.any([
      fetchEndpoint(`https://noembed.com/embed?url=${encodeURIComponent(target)}`),
      fetchEndpoint(`https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`),
    ]).catch(() => ({}));

    const timeoutPromise = new Promise<{ title?: string; author_name?: string }>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({});
      }, 2500);
    });

    return await Promise.race([raceMetadata, timeoutPromise]);
  } catch {
    return {};
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callGeminiWithFallback(params: {
  models: Array<{ model: string; thinkingLevel: ThinkingLevel }>;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
}): Promise<string> {
  let lastError: unknown = null;
  for (const entry of params.models) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const requestPromise = ai.models.generateContent({
        model: entry.model,
        contents: params.contents,
        config: {
          abortSignal: controller.signal,
          thinkingConfig: { thinkingLevel: entry.thinkingLevel },
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Gemini request timed out on ${entry.model}`));
        }, 12000);
      });
      const response = await Promise.race([requestPromise, timeoutPromise]);
      return (response.text ?? '{}').trim();
    } catch (err) {
      lastError = err;
      console.warn('[Gemini fallback]', entry.model, err instanceof Error ? err.message : String(err));
      if (!isQuotaError(err)) {
        throw err;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('Gemini request failed.');
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const publicUrl = (process.env.SHARED_APP_URL || 'https://joan-manuels-playlists.vercel.app/').trim();
    res.json({ ok: true, publicUrl });
  });

  app.post('/api/analyze-video', async (req, res) => {
    try {
      const youtubeUrl = typeof req.body?.youtubeUrl === 'string' ? req.body.youtubeUrl.trim() : '';
      const youtubeId = extractYouTubeIdServer(youtubeUrl);

      if (!youtubeId) {
        res.status(400).json({ error: 'Invalid YouTube URL or video ID.' });
        return;
      }

      const oembed = await fetchYouTubeOEmbed(youtubeId);
      const canonicalUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
      const fallbackSplit = splitArtistAndTitle(oembed.title, oembed.author_name);
      const thumbnailUrl = `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;

      if (!process.env.GEMINI_API_KEY) {
        const isRemixFallback = /\bremix\b/i.test(fallbackSplit.title);
        res.json({
          youtubeId,
          youtubeUrl: canonicalUrl,
          title: fallbackSplit.title,
          artist: fallbackSplit.artist,
          country: 'Argentina',
          countryCode: 'AR',
          language: 'Español',
          languageCode: 'es',
          genre: isRemixFallback ? 'Pop / Rock (Remix)' : 'Pop / Rock',
          isRemix: isRemixFallback,
          curatorNote: '',
          thumbnailUrl,
          aiQuotaExceeded: true,
        });
        return;
      }

      const prompt = [
        'Analyze this YouTube music video and determine the song details, country of origin of the artist/song, singing language(s), whether it is a remix or bilingual/international collaboration, and musical genre.',
        `YouTube URL: ${canonicalUrl}`,
        `YouTube ID: ${youtubeId}`,
        oembed.title ? `YouTube oEmbed Title: ${oembed.title}` : 'YouTube oEmbed Title: (not available)',
        oembed.author_name ? `YouTube Channel: ${oembed.author_name}` : 'YouTube Channel: (not available)',
        'Rules:',
        '- IMPORTANT FOR COLLABORATIONS / REMIXES / BILINGUAL TRACKS: If the song features singers from TWO different countries OR is sung in TWO different languages (e.g. a remix, duet, or feat. mixing English + Spanish, Russian + French, Puerto Rico + Colombia, etc.), DO NOT force a single country or single language. Instead:',
        '  1) Set isRemix = true.',
        '  2) List BOTH countries in "country" separated by " / " in Spanish (e.g. "Puerto Rico / Estados Unidos", "Colombia / Francia").',
        '  3) List BOTH 2-letter uppercase ISO 3166-1 alpha-2 codes in "countryCode" separated by a comma without spaces (e.g. "PR,US", "CO,FR").',
        '  4) List BOTH singing languages in "language" separated by " / " in Spanish (e.g. "Español / Inglés", "Español / Francés").',
        '  5) List BOTH 2-letter lowercase ISO 639-1 codes in "languageCode" separated by a comma without spaces (e.g. "es,en", "es,fr").',
        '  6) Mention "Remix" in "genre" if appropriate (e.g. "Reggaetón Remix", "Pop Urbano (Remix)").',
        '- For single-country, single-language songs: set isRemix = false (unless the track itself is clearly a remix), and put 1 country, 1 countryCode ("AR"), 1 language, and 1 languageCode ("es").',
        '- country: Country name(s) in Spanish (e.g. "Argentina", "Japón", or "España / Estados Unidos" for two countries).',
        '- countryCode: 1 or 2 uppercase 2-letter ISO 3166-1 alpha-2 codes separated by "," (e.g. "AR" or "ES,US").',
        '- language: Singing language(s) in Spanish (e.g. "Español", "Japonés", or "Español / Inglés" for two languages, or "Instrumental").',
        '- languageCode: 1 or 2 lowercase ISO 639-1 codes separated by "," (e.g. "es", "ja", "es,en", or "zxx" for instrumental).',
        '- genre: Concise music genre in Spanish (e.g. "Rock Nacional", "City Pop", "Chanson", "Pop Urbano (Remix)").',
        '- curatorNote: A warm 1-sentence editorial note in Spanish about the song or its sound (max 180 chars).',
      ].join('\n');

      try {
        const rawJson = await callGeminiWithFallback({
          models: [
            { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
            { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          ],
          contents: prompt,
          systemInstruction:
            'You are a musicologist and ethnomusicology archivist. Identify the song title, artist, country (or two countries for collaborations/remixes), singing language (or two languages for bilingual tracks), remix status, and musical genre accurately. Return valid JSON only.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              artist: { type: Type.STRING },
              country: { type: Type.STRING },
              countryCode: { type: Type.STRING },
              language: { type: Type.STRING },
              languageCode: { type: Type.STRING },
              genre: { type: Type.STRING },
              isRemix: { type: Type.BOOLEAN },
              curatorNote: { type: Type.STRING },
            },
            required: ['title', 'artist', 'country', 'countryCode', 'language', 'languageCode', 'genre', 'isRemix', 'curatorNote'],
          },
        });

        const parsed = JSON.parse(rawJson) as {
          title?: string;
          artist?: string;
          country?: string;
          countryCode?: string;
          language?: string;
          languageCode?: string;
          genre?: string;
          isRemix?: boolean;
          curatorNote?: string;
        };

        const countryCodes = Array.from(
          new Set(
            (parsed.countryCode || 'AR')
              .split(/[,/;&\s]+/)
              .map((c) => c.trim().toUpperCase().replace(/[^A-Z]/g, ''))
              .filter((c) => c.length === 2 || c.length === 3)
          )
        ).slice(0, 2);
        const cleanCountryCode = countryCodes.length > 0 ? countryCodes.join(',') : 'AR';

        const langCodes = Array.from(
          new Set(
            (parsed.languageCode || 'es')
              .split(/[,/;&\s]+/)
              .map((c) => c.trim().toLowerCase().replace(/[^a-z-]/g, ''))
              .filter((c) => c.length >= 2 && c.length <= 10)
          )
        ).slice(0, 2);
        const cleanLangCode = langCodes.length > 0 ? langCodes.join(',') : 'es';

        const finalTitle = (parsed.title || fallbackSplit.title).slice(0, 180);
        const finalGenre = (parsed.genre || 'Música del Mundo').slice(0, 70);
        const isRemixDetected = Boolean(
          parsed.isRemix ||
            countryCodes.length >= 2 ||
            langCodes.length >= 2 ||
            /\bremix\b/i.test(finalTitle) ||
            /\bremix\b/i.test(finalGenre)
        );

        res.json({
          youtubeId,
          youtubeUrl: canonicalUrl,
          title: finalTitle,
          artist: (parsed.artist || fallbackSplit.artist).slice(0, 140),
          country: (parsed.country || 'Internacional').slice(0, 90),
          countryCode: cleanCountryCode,
          language: (parsed.language || 'Español').slice(0, 70),
          languageCode: cleanLangCode,
          genre: finalGenre,
          isRemix: isRemixDetected,
          curatorNote: (parsed.curatorNote || '').slice(0, 350),
          thumbnailUrl,
        });
      } catch (err) {
        if (isQuotaError(err)) {
          const isRemixFallback = /\bremix\b/i.test(fallbackSplit.title);
          res.json({
            youtubeId,
            youtubeUrl: canonicalUrl,
            title: fallbackSplit.title,
            artist: fallbackSplit.artist,
            country: 'Argentina',
            countryCode: 'AR',
            language: 'Español',
            languageCode: 'es',
            genre: isRemixFallback ? 'Pop / Rock (Remix)' : 'Pop / Rock',
            isRemix: isRemixFallback,
            curatorNote: '',
            thumbnailUrl,
            aiQuotaExceeded: true,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze YouTube video.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/translate', async (req, res) => {
    try {
      const targetLanguage = typeof req.body?.targetLanguage === 'string' ? req.body.targetLanguage.trim() : '';
      const ownerName = typeof req.body?.ownerName === 'string' ? req.body.ownerName.trim() : 'Joan Manuel Sebastian Del Valle';
      const uiStrings = (req.body?.uiStrings && typeof req.body.uiStrings === 'object' ? req.body.uiStrings : {}) as Record<string, string>;
      const terms = Array.isArray(req.body?.terms) ? req.body.terms.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0) : [];

      if (!targetLanguage) {
        res.status(400).json({ error: 'targetLanguage is required.' });
        return;
      }

      const cacheKey = JSON.stringify({ targetLanguage, ownerName, uiKeys: Object.keys(uiStrings), terms });
      const cached = serverTranslationCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.json({
          transliteratedName: ownerName,
          scriptLabel: targetLanguage,
          translatedUi: {},
          translatedTerms: {},
          quotaFallback: true,
        });
        return;
      }

      const entries = Object.entries(uiStrings).slice(0, 80);
      const uniqueTerms = Array.from(new Set(terms)).slice(0, 80);

      const prompt = [
        `Target visitor language code/name: "${targetLanguage}".`,
        `Owner Spanish full name: "${ownerName}".`,
        'Task 1: Transliterate the owner\'s Spanish full name phonetically into the natural writing script of the target language.',
        'Task 2: Translate every UI string from Spanish into the target language naturally and concisely (keep navigation labels 1-3 words).',
        'Task 3: Translate every music metadata term (genres, captions, notes) from Spanish into the target language.',
        '',
        'UI_STRINGS:',
        JSON.stringify(entries.map(([key, value]) => ({ key, value }))),
        '',
        'TERMS:',
        JSON.stringify(uniqueTerms),
      ].join('\n');

      try {
        const rawJson = await callGeminiWithFallback({
          models: [
            { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
            { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          ],
          contents: prompt,
          systemInstruction:
            'You are a precision literary translator and phonetic transliteration specialist. Preserve exact keys and source terms. Return valid JSON only.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transliteratedName: { type: Type.STRING },
              scriptLabel: { type: Type.STRING },
              translatedUi: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING },
                    value: { type: Type.STRING },
                  },
                  required: ['key', 'value'],
                },
              },
              translatedTerms: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source: { type: Type.STRING },
                    target: { type: Type.STRING },
                  },
                  required: ['source', 'target'],
                },
              },
            },
            required: ['transliteratedName', 'scriptLabel', 'translatedUi', 'translatedTerms'],
          },
        });

        const parsed = JSON.parse(rawJson) as {
          transliteratedName?: string;
          scriptLabel?: string;
          translatedUi?: Array<{ key: string; value: string }>;
          translatedTerms?: Array<{ source: string; target: string }>;
        };

        const uiMap: Record<string, string> = {};
        for (const item of parsed.translatedUi ?? []) {
          if (item.key && item.value) uiMap[item.key] = item.value;
        }

        const termsMap: Record<string, string> = {};
        for (const item of parsed.translatedTerms ?? []) {
          if (item.source && item.target) termsMap[item.source] = item.target;
        }

        const result: TranslationResponsePayload = {
          transliteratedName: parsed.transliteratedName || ownerName,
          scriptLabel: parsed.scriptLabel || targetLanguage,
          translatedUi: uiMap,
          translatedTerms: termsMap,
        };
        serverTranslationCache.set(cacheKey, result);
        res.json(result);
      } catch (err) {
        if (isQuotaError(err)) {
          res.json({
            transliteratedName: ownerName,
            scriptLabel: targetLanguage,
            translatedUi: {},
            translatedTerms: {},
            quotaFallback: true,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Translation failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/analyze-profile', async (req, res) => {
    try {
      interface ProfileTrackInput {
        title: string;
        artist: string;
        country: string;
        language: string;
        genre: string;
        curatorNote: string;
      }

      const rawTracks: unknown[] = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
      const tracks: ProfileTrackInput[] = rawTracks
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 60)
        .map((item) => ({
          title: String(item.title ?? '').slice(0, 140),
          artist: String(item.artist ?? '').slice(0, 120),
          country: String(item.country ?? '').slice(0, 80),
          language: String(item.language ?? '').slice(0, 60),
          genre: String(item.genre ?? '').slice(0, 60),
          curatorNote: String(item.curatorNote ?? '').slice(0, 200),
        }))
        .filter((t) => Boolean(t.title || t.artist));

      if (tracks.length === 0) {
        res.status(400).json({ error: 'Agrega al menos una canción antes de generar tu análisis.' });
        return;
      }

      const countries = Array.from(new Set(tracks.map((t) => t.country).filter(Boolean)));
      const languages = Array.from(new Set(tracks.map((t) => t.language).filter(Boolean)));
      const genres = Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean)));
      const fallbackDraft = {
        personalitySummary: `Joan Manuel se perfila como un hombre curioso, sensible a los matices culturales y atento a las emociones que transmite la música de ${countries.slice(0, 4).join(', ') || 'distintos lugares'}. Su selección sugiere apertura mental y una forma introspectiva pero cálida de conectar con el mundo.`,
        musicalTasteSummary: `Sus ${tracks.length} canciones actuales recorren ${genres.slice(0, 5).join(', ') || 'diversos estilos'} en ${languages.slice(0, 4).join(', ') || 'varios idiomas'}, mostrando un gusto personal por piezas con identidad y carácter propio.`,
        keyTraits: [
          countries.length >= 2 ? 'Mente abierta y curiosa' : 'Identidad cultural definida',
          languages.length >= 2 ? 'Sensibilidad multilingüe' : 'Conexión profunda con las letras',
          genres.length >= 2 ? 'Gusto musical ecléctico' : 'Preferencia por un sello sonoro propio',
          'Atento a la atmósfera emocional',
        ],
        trackCount: tracks.length,
        aiQuotaExceeded: true,
      };

      if (!process.env.GEMINI_API_KEY) {
        res.json(fallbackDraft);
        return;
      }

      const trackSummaryLines = tracks.map(
        (t, idx) =>
          `${idx + 1}. "${t.title}" — ${t.artist} | País: ${t.country} | Idioma: ${t.language} | Género: ${t.genre}${
            t.curatorNote ? ` | Nota: ${t.curatorNote}` : ''
          }`
      );

      const prompt = [
        'Analiza la lista actual de canciones favoritas de Joan Manuel Sebastian Del Valle y elabora en español un perfil psicológico respetuoso, cálido, perspicaz y realista sobre qué tipo de hombre es y qué tipo de gustos musicales tiene, para que los visitantes de su página web lo conozcan mejor.',
        '',
        `Total de canciones actuales: ${tracks.length}`,
        'Canciones en su página:',
        ...trackSummaryLines,
        '',
        'Reglas:',
        '- personalitySummary: 2 a 3 oraciones en tercera persona ("Joan Manuel...") explicando qué tipo de hombre refleja esta selección (sensibilidad, apertura cultural, carácter, mundo interior). Máximo 900 caracteres.',
        '- musicalTasteSummary: 2 a 3 oraciones analizando sus gustos musicales (géneros, idiomas, países, energía/atmósfera, contrastes). Máximo 900 caracteres.',
        '- keyTraits: Lista de 3 a 5 rasgos cortos y claros en español (máximo 7 palabras cada uno, sin hashtags ni emojis).',
      ].join('\n');

      try {
        const rawJson = await callGeminiWithFallback({
          models: [
            { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.LOW },
            { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          ],
          contents: prompt,
          systemInstruction:
            'Eres un psicólogo cultural y crítico musical empático. Analizas gustos musicales reales para describir con calidez, agudeza y claridad la personalidad y preferencias estéticas de una persona. Devuelve únicamente JSON válido.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              personalitySummary: { type: Type.STRING },
              musicalTasteSummary: { type: Type.STRING },
              keyTraits: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['personalitySummary', 'musicalTasteSummary', 'keyTraits'],
          },
        });

        const parsed = JSON.parse(rawJson) as {
          personalitySummary?: string;
          musicalTasteSummary?: string;
          keyTraits?: string[];
        };

        const traits = Array.isArray(parsed.keyTraits)
          ? parsed.keyTraits
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              .map((s) => s.trim().slice(0, 110))
              .slice(0, 5)
          : fallbackDraft.keyTraits;

        res.json({
          personalitySummary: (parsed.personalitySummary || fallbackDraft.personalitySummary).slice(0, 1450),
          musicalTasteSummary: (parsed.musicalTasteSummary || fallbackDraft.musicalTasteSummary).slice(0, 1450),
          keyTraits: traits.length > 0 ? traits : fallbackDraft.keyTraits,
          trackCount: tracks.length,
        });
      } catch (err) {
        if (isQuotaError(err)) {
          res.json(fallbackDraft);
          return;
        }
        throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze musical profile.';
      res.status(500).json({ error: message });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
