import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import net from 'node:net';
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

interface ServerTitleAnnotation {
  kind: 'translation' | 'transliteration' | 'none';
  text: string;
}

const serverTranslationCache = new Map<string, TranslationResponsePayload>();
const serverTitleCache = new Map<string, ServerTitleAnnotation>();

interface ServerGeoPayload {
  countryCode?: string;
  countryName?: string;
  region?: string;
  city?: string;
  continent?: string;
  geoSource: 'server-header' | 'ip-geo' | 'none';
}

const serverGeoCache = new Map<string, { expiresAt: number; payload: ServerGeoPayload }>();

function normalizeCandidateIp(raw: string): string {
  const trimmed = raw.trim().replace(/^::ffff:/i, '');
  if (!trimmed) return '';
  return net.isIP(trimmed) ? trimmed : '';
}

function isPublicRoutableIp(ip: string): boolean {
  if (!ip || !net.isIP(ip)) return false;
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return false;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return false;

  if (net.isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return false;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }

  return true;
}

function extractClientPublicIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const candidates: string[] = [];
  if (typeof forwarded === 'string') {
    for (const part of forwarded.split(',')) {
      const normalized = normalizeCandidateIp(part);
      if (normalized) candidates.push(normalized);
    }
  } else if (Array.isArray(forwarded)) {
    for (const entry of forwarded) {
      for (const part of entry.split(',')) {
        const normalized = normalizeCandidateIp(part);
        if (normalized) candidates.push(normalized);
      }
    }
  }
  if (req.socket?.remoteAddress) {
    const normalized = normalizeCandidateIp(req.socket.remoteAddress);
    if (normalized) candidates.push(normalized);
  }
  return candidates.find((ip) => isPublicRoutableIp(ip)) ?? '';
}

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

  app.get('/api/visitor-geo', async (req, res) => {
    try {
      const vercelCountry =
        typeof req.headers['x-vercel-ip-country'] === 'string'
          ? req.headers['x-vercel-ip-country'].trim().toUpperCase()
          : '';
      const cfCountry =
        typeof req.headers['cf-ipcountry'] === 'string'
          ? req.headers['cf-ipcountry'].trim().toUpperCase()
          : '';
      const headerCountry = /^[A-Z]{2}$/.test(vercelCountry)
        ? vercelCountry
        : /^[A-Z]{2}$/.test(cfCountry) && cfCountry !== 'XX' && cfCountry !== 'T1'
          ? cfCountry
          : '';

      if (headerCountry) {
        const rawCity =
          typeof req.headers['x-vercel-ip-city'] === 'string'
            ? req.headers['x-vercel-ip-city']
            : '';
        const rawRegion =
          typeof req.headers['x-vercel-ip-country-region'] === 'string'
            ? req.headers['x-vercel-ip-country-region']
            : '';
        let decodedCity = rawCity;
        try {
          decodedCity = rawCity ? decodeURIComponent(rawCity) : '';
        } catch {
          decodedCity = rawCity;
        }
        res.json({
          countryCode: headerCountry,
          region: rawRegion.slice(0, 80),
          city: decodedCity.slice(0, 80),
          geoSource: 'server-header',
        } satisfies ServerGeoPayload);
        return;
      }

      const publicIp = extractClientPublicIp(req);
      if (!publicIp) {
        res.json({ geoSource: 'none' } satisfies ServerGeoPayload);
        return;
      }

      const now = Date.now();
      const cached = serverGeoCache.get(publicIp);
      if (cached && cached.expiresAt > now) {
        res.json(cached.payload);
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const geoRes = await fetch(
          `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(publicIp)}.json`,
          { signal: controller.signal }
        );
        if (!geoRes.ok) {
          res.json({ geoSource: 'none' } satisfies ServerGeoPayload);
          return;
        }
        const geoData = (await geoRes.json()) as {
          country_code?: string;
          country?: string;
          region?: string;
          city?: string;
          continent_code?: string;
        };
        const code = (geoData.country_code || '').trim().toUpperCase();
        if (!/^[A-Z]{2,3}$/.test(code)) {
          res.json({ geoSource: 'none' } satisfies ServerGeoPayload);
          return;
        }
        const payload: ServerGeoPayload = {
          countryCode: code,
          countryName: (geoData.country || '').trim().slice(0, 80),
          region: (geoData.region || '').trim().slice(0, 80),
          city: (geoData.city || '').trim().slice(0, 80),
          continent: (geoData.continent_code || '').trim().slice(0, 40),
          geoSource: 'ip-geo',
        };
        if (serverGeoCache.size > 500) {
          serverGeoCache.clear();
        }
        serverGeoCache.set(publicIp, { expiresAt: now + 3600_000, payload });
        res.json(payload);
      } finally {
        clearTimeout(timer);
      }
    } catch {
      res.json({ geoSource: 'none' } satisfies ServerGeoPayload);
    }
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
        '- IMPORTANT FOR INSTRUMENTAL TRACKS (no singing / no lyrics, such as piano, classical, soundtrack, guitar, jazz, or electronic instrumental):',
        '  1) Set language = "Instrumental" and languageCode = "zxx".',
        '  2) Classify "country" and "countryCode" by the performer or composer\'s country of origin (e.g. "Corea del Sur" / "KR" for Yiruma, "Italia" / "IT" for Ludovico Einaudi).',
        '  3) Do NOT mark isRemix = true solely because there are no lyrics; only set isRemix = true if it is genuinely a remix or a collaboration between 2 countries.',
        '- For single-country, single-language songs: set isRemix = false (unless the track itself is clearly a remix), and put 1 country, 1 countryCode ("AR"), 1 language, and 1 languageCode ("es").',
        '- country: Country name(s) in Spanish (e.g. "Argentina", "Japón", or "España / Estados Unidos" for two countries).',
        '- countryCode: 1 or 2 uppercase 2-letter ISO 3166-1 alpha-2 codes separated by "," (e.g. "AR" or "ES,US").',
        '- language: Singing language(s) in Spanish (e.g. "Español", "Japonés", or "Español / Inglés" for two languages, or "Instrumental" when there is no singing).',
        '- languageCode: 1 or 2 lowercase ISO 639-1 codes separated by "," (e.g. "es", "ja", "es,en", or "zxx" for instrumental).',
        '- genre: Concise music genre in Spanish (e.g. "Rock Nacional", "City Pop", "Piano Contemporáneo", "Pop Urbano (Remix)").',
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
            'You are a musicologist and ethnomusicology archivist. Identify the song title, artist, country (or two countries for collaborations/remixes), singing language (or "Instrumental" with code "zxx" when there are no vocals/lyrics), remix status, and musical genre accurately. Return valid JSON only.',
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

        const looksInstrumental = /\b(instrumental|sin letra|sin voz|no lyrics|no vocals|zxx)\b/i.test(
          `${parsed.language || ''} ${parsed.languageCode || ''}`
        );

        const langCodes = looksInstrumental
          ? ['zxx']
          : Array.from(
              new Set(
                (parsed.languageCode || 'es')
                  .split(/[,/;&\s]+/)
                  .map((c) => c.trim().toLowerCase().replace(/[^a-z-]/g, ''))
                  .filter((c) => c.length >= 2 && c.length <= 10)
              )
            ).slice(0, 2);
        const cleanLangCode = langCodes.length > 0 ? langCodes.join(',') : 'es';
        const finalLanguage = looksInstrumental
          ? 'Instrumental'
          : (parsed.language || 'Español').slice(0, 70);

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
          language: finalLanguage,
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
      const terms: string[] = Array.isArray(req.body?.terms)
        ? (req.body.terms as unknown[]).filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
        : [];

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
      const uniqueTerms: string[] = Array.from(new Set<string>(terms)).slice(0, 120);

      const prompt = [
        `Target visitor language code/name: "${targetLanguage}".`,
        `Owner Spanish full name: "${ownerName}".`,
        'Task 1: Transliterate the owner\'s Spanish full name phonetically into the natural writing script of the target language.',
        'Task 2: Translate every UI string from Spanish into the target language naturally and concisely (keep navigation labels 1-3 words).',
        'Task 3: Translate EVERY indexed item in TERMS (including video curator notes/comments, music genres, country/language descriptions, photo captions, personality traits, and full psychological profile paragraphs) completely and naturally from its original language (typically Spanish) into the target language without summarizing or omitting sentences. Preserve each numeric "id" verbatim.',
        '',
        'UI_STRINGS:',
        JSON.stringify(entries.map(([key, value]) => ({ key, value }))),
        '',
        'TERMS:',
        JSON.stringify(uniqueTerms.map((text, id) => ({ id, text }))),
      ].join('\n');

      try {
        const rawJson = await callGeminiWithFallback({
          models: [
            { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
            { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          ],
          contents: prompt,
          systemInstruction:
            'You are a precision literary translator and phonetic transliteration specialist. Translate every indexed item completely and accurately, preserving each numeric id. Return valid JSON only.',
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
                    id: { type: Type.INTEGER },
                    target: { type: Type.STRING },
                  },
                  required: ['id', 'target'],
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
          translatedTerms?: Array<{ id: number; target: string }>;
        };

        const uiMap: Record<string, string> = {};
        for (const item of parsed.translatedUi ?? []) {
          if (item.key && item.value) uiMap[item.key] = item.value;
        }

        const termsMap: Record<string, string> = {};
        for (const item of parsed.translatedTerms ?? []) {
          if (typeof item.id === 'number' && item.id >= 0 && item.id < uniqueTerms.length && item.target?.trim()) {
            termsMap[uniqueTerms[item.id]] = item.target.trim();
          }
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
        console.warn('[Translate fallback]', err instanceof Error ? err.message : String(err));
        res.json({
          transliteratedName: ownerName,
          scriptLabel: targetLanguage,
          translatedUi: {},
          translatedTerms: {},
          quotaFallback: true,
        });
      }
    } catch (err) {
      console.warn('[Translate route error]', err instanceof Error ? err.message : String(err));
      res.json({
        transliteratedName: 'Joan Manuel Sebastian Del Valle',
        scriptLabel: 'es',
        translatedUi: {},
        translatedTerms: {},
        quotaFallback: true,
      });
    }
  });

  app.post('/api/translate-titles', async (req, res) => {
    try {
      const targetLanguage =
        typeof req.body?.targetLanguage === 'string' ? req.body.targetLanguage.trim() : '';
      const targetLangCode =
        typeof req.body?.targetLangCode === 'string'
          ? req.body.targetLangCode.trim().toLowerCase()
          : '';
      const rawItems: unknown[] = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!targetLanguage || !targetLangCode) {
        res.status(400).json({ error: 'targetLanguage and targetLangCode are required.' });
        return;
      }

      const deduped = new Map<
        string,
        { title: string; artist: string; language: string; languageCode: string }
      >();
      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as Record<string, unknown>;
        const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, 180) : '';
        if (!title || deduped.has(title)) continue;
        deduped.set(title, {
          title,
          artist: typeof entry.artist === 'string' ? entry.artist.trim().slice(0, 120) : '',
          language: typeof entry.language === 'string' ? entry.language.trim().slice(0, 60) : '',
          languageCode:
            typeof entry.languageCode === 'string' ? entry.languageCode.trim().slice(0, 20) : '',
        });
      }

      const items = Array.from(deduped.values()).slice(0, 120);
      const annotations: Record<string, ServerTitleAnnotation> = {};
      const uncached: typeof items = [];

      for (const item of items) {
        const key = `${targetLangCode}::${item.title}`;
        const hit = serverTitleCache.get(key);
        if (hit) {
          annotations[item.title] = hit;
        } else {
          uncached.push(item);
        }
      }

      if (uncached.length === 0) {
        res.json({ annotations });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.json({ annotations, quotaFallback: true });
        return;
      }

      const batchSize = 35;
      let hadQuotaFallback = false;
      const batches: Array<typeof uncached> = [];
      for (let offset = 0; offset < uncached.length; offset += batchSize) {
        batches.push(uncached.slice(offset, offset + batchSize));
      }

      await Promise.all(
        batches.map(async (batch) => {
          const indexed = batch.map((item, idx) => ({
            id: idx,
            title: item.title,
            artist: item.artist,
            songLanguage: item.language || item.languageCode || 'auto',
          }));

          const prompt = [
            `Visitor target language: "${targetLanguage}" (code: "${targetLangCode}").`,
            'For EACH indexed song title below, produce an exact parenthetical annotation according to these strict rules:',
            '1. ALREADY IN TARGET LANGUAGE: If the song title is already written in the visitor\'s target language AND uses the same writing script, return kind = "none", text = "".',
            '2. MEANINGFUL TRANSLATION EXISTS: If the song title is in another language and has a genuine, meaningful translation into the visitor\'s target language, return kind = "translation" and text = the natural, concise translation of the core title (omit redundant video tags like "Official Video", "Clip Officiel", "Remix", "Alt. Version", "LIVE @ ..." unless essential to meaning).',
            '   - Examples (target Spanish): "Глубина" -> kind="translation", text="Profundidad"; "Bohemian Rhapsody" -> kind="translation", text="Rapsodia bohemia"; "Alors on danse" -> kind="translation", text="Entonces bailamos"; "Life" -> kind="translation", text="Vida"; "Падает Звезда" -> kind="translation", text="Cae una estrella"; "Dernière Danse (Clip Officiel)" -> kind="translation", text="Último baile"; "Inta Eyh (Remix)" -> kind="translation", text="¿Qué eres tú?".',
            '   - Examples (target English): "Crimen" -> kind="translation", text="Crime"; "Senderito de amor" -> kind="translation", text="Little Path of Love"; "Пластинки" -> kind="translation", text="Vinyl Records".',
            '3. NO TRANSLATION EXISTS (proper names, untranslatable place names, codes, or invented words like "Лали", "PROVENZA", "Cairo", "S91", "Waka Waka"):',
            '   - IF the title\'s writing characters/script DIFFER from the visitor\'s target language script (e.g., Cyrillic vs Latin, Latin vs Japanese/Korean/Russian/Arabic/Chinese/Devanagari), return kind = "transliteration" and text = the most accurate phonetic transliteration into the visitor\'s native writing script.',
            '     * Examples: "Лали" -> Spanish/English: kind="transliteration", text="Lali"; "PROVENZA" -> Japanese: kind="transliteration", text="プロベンサ"; "PROVENZA" -> Russian: kind="transliteration", text="Провенса"; "Cairo" -> Japanese: kind="transliteration", text="カイロ".',
            '   - IF the title uses the SAME writing script as the visitor\'s language (e.g., "PROVENZA", "Cairo", "S91" for Spanish/English/French/Portuguese), return kind = "none", text = "".',
            '4. NEVER repeat the exact original title. If a bilingual title already contains the target-language translation (e.g., "Boa Sorte / Good Luck" when target is English), return kind = "none", text = "".',
            '5. Do NOT wrap text in parentheses.',
            '',
            'SONGS:',
            JSON.stringify(indexed),
          ].join('\n');

          try {
            const rawJson = await callGeminiWithFallback({
              models: [
                { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
                { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
              ],
              contents: prompt,
              systemInstruction:
                'You are a precision music translator and phonetic transliteration linguist. Strictly distinguish genuine semantic translations from cross-script phonetic transliterations. Return valid JSON only.',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  annotations: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.INTEGER },
                        kind: {
                          type: Type.STRING,
                          enum: ['translation', 'transliteration', 'none'],
                        },
                        text: { type: Type.STRING },
                      },
                      required: ['id', 'kind', 'text'],
                    },
                  },
                },
                required: ['annotations'],
              },
            });

            const parsed = JSON.parse(rawJson) as {
              annotations?: Array<{ id?: number; kind?: string; text?: string }>;
            };

            for (const entry of parsed.annotations ?? []) {
              if (typeof entry.id !== 'number' || entry.id < 0 || entry.id >= batch.length) continue;
              const item = batch[entry.id];
              const kind: ServerTitleAnnotation['kind'] =
                entry.kind === 'translation' || entry.kind === 'transliteration'
                  ? entry.kind
                  : 'none';
              const text = typeof entry.text === 'string' ? entry.text.trim().slice(0, 180) : '';
              const normalized: ServerTitleAnnotation =
                kind !== 'none' && text ? { kind, text } : { kind: 'none', text: '' };
              annotations[item.title] = normalized;
              serverTitleCache.set(`${targetLangCode}::${item.title}`, normalized);
            }
          } catch (err) {
            console.warn(
              '[Translate titles fallback]',
              err instanceof Error ? err.message : String(err)
            );
            hadQuotaFallback = true;
          }
        })
      );

      res.json({ annotations, ...(hadQuotaFallback ? { quotaFallback: true } : {}) });
    } catch (err) {
      console.warn('[Translate titles route error]', err instanceof Error ? err.message : String(err));
      res.json({ annotations: {}, quotaFallback: true });
    }
  });

  app.post('/api/translate-profile', async (req, res) => {
    try {
      const personalitySummary =
        typeof req.body?.personalitySummary === 'string' ? req.body.personalitySummary.trim().slice(0, 1500) : '';
      const musicalTasteSummary =
        typeof req.body?.musicalTasteSummary === 'string' ? req.body.musicalTasteSummary.trim().slice(0, 1500) : '';
      const keyTraits = Array.isArray(req.body?.keyTraits)
        ? req.body.keyTraits
            .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item: string) => item.trim().slice(0, 120))
            .slice(0, 6)
        : [];

      if (!personalitySummary || !musicalTasteSummary || !process.env.GEMINI_API_KEY) {
        res.json({ translations: {} });
        return;
      }

      const targetLanguages = [
        { code: 'en', name: 'English' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'fr', name: 'French' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ko', name: 'Korean' },
        { code: 'ar', name: 'Arabic' },
        { code: 'ru', name: 'Russian' },
        { code: 'zh', name: 'Simplified Chinese' },
        { code: 'hi', name: 'Hindi' },
        { code: 'de', name: 'German' },
        { code: 'it', name: 'Italian' },
      ];

      const prompt = [
        'Translate the following Spanish psychological and musical profile completely and naturally into EVERY target language listed below.',
        'Do not summarize or omit any sentence. Keep the warm, respectful third-person tone.',
        '',
        'TARGET_LANGUAGES:',
        JSON.stringify(targetLanguages),
        '',
        'SOURCE_SPANISH_PROFILE:',
        JSON.stringify({ personalitySummary, musicalTasteSummary, keyTraits }),
      ].join('\n');

      try {
        const rawJson = await callGeminiWithFallback({
          models: [
            { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
            { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          ],
          contents: prompt,
          systemInstruction:
            'You are a precision literary translator. Translate the full Spanish psychological and musical profile into every requested language code faithfully. Return valid JSON only.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    code: { type: Type.STRING },
                    personalitySummary: { type: Type.STRING },
                    musicalTasteSummary: { type: Type.STRING },
                    keyTraits: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['code', 'personalitySummary', 'musicalTasteSummary', 'keyTraits'],
                },
              },
            },
            required: ['translations'],
          },
        });

        const parsed = JSON.parse(rawJson) as {
          translations?: Array<{
            code?: string;
            personalitySummary?: string;
            musicalTasteSummary?: string;
            keyTraits?: string[];
          }>;
        };

        const allowed = new Set(targetLanguages.map((l) => l.code));
        const map: Record<string, { personalitySummary: string; musicalTasteSummary: string; keyTraits: string[] }> = {};

        for (const entry of parsed.translations ?? []) {
          const code = typeof entry.code === 'string' ? entry.code.trim().toLowerCase() : '';
          if (!allowed.has(code)) continue;
          const p = typeof entry.personalitySummary === 'string' ? entry.personalitySummary.trim().slice(0, 1500) : '';
          const m = typeof entry.musicalTasteSummary === 'string' ? entry.musicalTasteSummary.trim().slice(0, 1500) : '';
          const t = Array.isArray(entry.keyTraits)
            ? entry.keyTraits.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim().slice(0, 120)).slice(0, 6)
            : [];
          if (p && m) {
            map[code] = { personalitySummary: p, musicalTasteSummary: m, keyTraits: t };
          }
        }

        res.json({ translations: map });
      } catch (err) {
        console.warn('[Translate profile fallback]', err instanceof Error ? err.message : String(err));
        res.json({ translations: {} });
      }
    } catch {
      res.json({ translations: {} });
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
        personalitySummary: `Joan Manuel se perfila como un hombre curioso, sensible a los matices culturales y atento a las emociones que transmite la música de ${countries.slice(0, 4).join(', ') || 'distintos lugares'}. Esa misma sensibilidad sugiere a alguien que disfruta de caminatas tranquilas o cafés con buena conversación, aprecia artes visuales como el cine o la fotografía con atmósfera propia, valora rutinas equilibradas entre el silencio creativo y la energía compartida, y se rodea de compañías auténticas, curiosas y sin poses.`,
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
        'Actúa como el mejor psicólogo de la personalidad y musicólogo cultural del mundo. Analiza la lista actual de canciones favoritas de Joan Manuel Sebastian Del Valle y elabora en español un perfil psicológico profundo, cálido, perspicaz y realista para que los visitantes de su página web lo conozcan mejor.',
        '',
        `Total de canciones actuales: ${tracks.length}`,
        'Canciones en su página:',
        ...trackSummaryLines,
        '',
        'Reglas:',
        '- personalitySummary (Qué tipo de hombre refleja su música): Redacta 3 a 4 oraciones fluidas en tercera persona ("Joan Manuel..."), máximo 1350 caracteres:',
        '  1) En las primeras 2 oraciones, describe qué tipo de hombre refleja esta selección (su mundo interior, sensibilidad emocional, equilibrio entre introspección y vitalidad, apertura cultural).',
        '  2) En las siguientes 1 a 2 oraciones, infiere con agudeza psicológica y naturalidad —a partir de los climas, idiomas, ritmos y contrastes de su música— qué otras facetas probablemente disfruta en su vida: otras actividades o pasatiempos, expresiones artísticas (por ejemplo cine, fotografía, lectura, arquitectura o gastronomía), rutinas cotidianas (momentos de calma, recorridos urbanos o nocturnos, viajes) y qué tipo de compañías, vínculos o conversaciones valora.',
        '- musicalTasteSummary (Sus gustos y sensibilidad musical): 2 a 3 oraciones analizando sus gustos musicales (géneros, idiomas, países, energía/atmósfera, contrastes). Máximo 900 caracteres.',
        '- keyTraits (Rasgos destacados): Lista de 3 a 5 rasgos cortos y claros en español (máximo 7 palabras cada uno, sin hashtags ni emojis).',
      ].join('\n');

      try {
        const rawJson = await callGeminiWithFallback({
          models: [
            { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.LOW },
            { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          ],
          contents: prompt,
          systemInstruction:
            'Eres el mejor psicólogo cultural y analista de personalidad a través de la música en el mundo. Conectas con precisión y calidez las elecciones musicales reales de una persona con su carácter, su mundo interior y las actividades, artes, rutinas y compañías humanas con las que naturalmente sintoniza. Evita estereotipos huecos y clichés; escribe con elegancia, profundidad humana y realismo. Devuelve únicamente JSON válido.',
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
