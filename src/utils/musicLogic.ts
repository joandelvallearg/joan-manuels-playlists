import type { GeneratedProfileDraft, PlaylistGroup, PlaylistMode, Track } from '../types';

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts an 11-character YouTube video ID from standard watch, short, embed,
 * YouTube Music, or Shorts URLs, or from a raw 11-character ID string.
 */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const vParam = parsed.searchParams.get('v');
    if (vParam && YOUTUBE_ID_REGEX.test(vParam)) {
      return vParam;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v')
    ) {
      const candidate = parts[1];
      return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
    }
  }

  return null;
}

export function getYouTubeEmbedUrl(youtubeId: string, autoplay = true): string {
  const safeId = encodeURIComponent(youtubeId);
  const auto = autoplay ? '1' : '0';
  return `https://www.youtube-nocookie.com/embed/${safeId}?autoplay=${auto}&rel=0&modestbranding=1`;
}

export function getYouTubeThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;
}

export function normalizeCountryCodesList(rawCode: string, fallback = 'AR'): string {
  const parts = rawCode
    .split(/[,/;&\s]+/)
    .map((p) => p.trim().toUpperCase().replace(/[^A-Z]/g, ''))
    .filter((p) => p.length === 2 || p.length === 3);
  const unique = Array.from(new Set(parts)).slice(0, 2);
  return unique.length > 0 ? unique.join(',') : fallback;
}

export function normalizeLanguageCodesList(rawCode: string, fallback = 'es'): string {
  const parts = rawCode
    .split(/[,/;&\s]+/)
    .map((p) => p.trim().toLowerCase().replace(/[^a-z-]/g, ''))
    .filter((p) => p.length >= 2 && p.length <= 10);
  const unique = Array.from(new Set(parts)).slice(0, 2);
  return unique.length > 0 ? unique.join(',') : fallback;
}

export function formatCodesDisplay(rawCode: string): string {
  return rawCode
    .split(/[,/]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');
}

function singleCountryFlagEmoji(code: string): string {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '';
  const first = clean.codePointAt(0)! - 65 + 0x1f1e6;
  const second = clean.codePointAt(1)! - 65 + 0x1f1e6;
  return String.fromCodePoint(first, second);
}

export function getCountryFlagEmoji(countryCode: string): string {
  const flags = countryCode
    .split(/[,/;&\s]+/)
    .map(singleCountryFlagEmoji)
    .filter(Boolean)
    .slice(0, 2);
  return flags.join(' ');
}

export function groupTracksByCountry(tracks: Track[]): PlaylistGroup[] {
  const map = new Map<string, PlaylistGroup>();

  for (const track of tracks) {
    const code = (track.countryCode || 'UN').toUpperCase();
    const key = code !== 'UN' ? code : track.country.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.tracks.push(track);
      if (track.genre && !existing.genres.includes(track.genre)) {
        existing.genres.push(track.genre);
      }
    } else {
      map.set(key, {
        key,
        label: track.country,
        code,
        tracks: [track],
        genres: track.genre ? [track.genre] : [],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.tracks.length - a.tracks.length || a.label.localeCompare(b.label));
}

export function groupTracksByLanguage(tracks: Track[]): PlaylistGroup[] {
  const map = new Map<string, PlaylistGroup>();

  for (const track of tracks) {
    const code = (track.languageCode || 'und').toLowerCase();
    const key = code !== 'und' ? code : track.language.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.tracks.push(track);
      if (track.genre && !existing.genres.includes(track.genre)) {
        existing.genres.push(track.genre);
      }
    } else {
      map.set(key, {
        key,
        label: track.language,
        code: code.toUpperCase(),
        tracks: [track],
        genres: track.genre ? [track.genre] : [],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.tracks.length - a.tracks.length || a.label.localeCompare(b.label));
}

export function filterTracks(
  tracks: Track[],
  opts: {
    mode: PlaylistMode;
    selectedKey: string | null;
    genre: string | null;
    query: string;
  }
): Track[] {
  const q = opts.query.trim().toLowerCase();

  return tracks.filter((track) => {
    if (opts.mode === 'country' && opts.selectedKey) {
      const code = (track.countryCode || 'UN').toUpperCase();
      const key = code !== 'UN' ? code : track.country.toLowerCase();
      if (key !== opts.selectedKey) return false;
    }

    if (opts.mode === 'language' && opts.selectedKey) {
      const code = (track.languageCode || 'und').toLowerCase();
      const key = code !== 'und' ? code : track.language.toLowerCase();
      if (key !== opts.selectedKey) return false;
    }

    if (opts.genre && track.genre.toLowerCase() !== opts.genre.toLowerCase()) {
      return false;
    }

    if (q) {
      const remixToken = track.isRemix ? 'remix' : '';
      const haystack = `${track.title} ${track.artist} ${track.country} ${track.language} ${track.genre} ${remixToken}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

const SUPPORTED_EXACT = new Set(['zh-tw', 'zh-cn', 'zh-hk']);

export function normalizeLanguageCode(rawLang: string | undefined | null): string {
  if (!rawLang) return 'es';
  const lower = rawLang.trim().toLowerCase().replace(/_/g, '-');
  if (!lower) return 'es';
  if (SUPPORTED_EXACT.has(lower)) {
    if (lower === 'zh-tw' || lower === 'zh-hk') return 'zh-TW';
    return 'zh';
  }
  const base = lower.split('-')[0];
  return base || 'es';
}

export function translateCountryByCode(countryCode: string, targetLang: string): string | null {
  const codes = countryCode
    .split(/[,/;&\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 2);
  if (codes.length === 0) return null;
  try {
    const dn = new Intl.DisplayNames([targetLang], { type: 'region' });
    const labels = codes.map((code) => {
      const label = dn.of(code);
      return label && label !== code ? label : null;
    });
    if (labels.some((l) => !l)) return null;
    return labels.join(' / ');
  } catch {
    return null;
  }
}

const INSTRUMENTAL_LABELS: Record<string, string> = {
  es: 'Instrumental',
  en: 'Instrumental',
  fr: 'Instrumental',
  pt: 'Instrumental',
  de: 'Instrumental',
  it: 'Strumentale',
  ja: 'インストゥルメンタル',
  ko: '연주곡',
  ru: 'Инструментал',
  ar: 'موسيقى آلية',
  zh: '纯音乐',
  'zh-tw': '純音樂',
  hi: 'वाद्य संगीत',
};

export function translateLanguageByCode(languageCode: string, targetLang: string): string | null {
  const rawCodes = languageCode
    .split(/[,/;&\s]+/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 2);
  if (rawCodes.length === 0) return null;

  const langKey = targetLang.trim().toLowerCase();
  const baseLang = langKey.split('-')[0];
  if (rawCodes.length === 1 && rawCodes[0] === 'zxx') {
    return INSTRUMENTAL_LABELS[langKey] || INSTRUMENTAL_LABELS[baseLang] || 'Instrumental';
  }

  const codes = rawCodes.filter((c) => c !== 'zxx');
  if (codes.length === 0) return null;
  try {
    const dn = new Intl.DisplayNames([targetLang], { type: 'language' });
    const labels = codes.map((code) => {
      const label = dn.of(code);
      if (!label || label === code) return null;
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
    if (labels.some((l) => !l)) return null;
    return labels.join(' / ');
  } catch {
    return null;
  }
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  argentina: 'AR',
  brasil: 'BR',
  brazil: 'BR',
  chile: 'CL',
  colombia: 'CO',
  españa: 'ES',
  spain: 'ES',
  méxico: 'MX',
  mexico: 'MX',
  perú: 'PE',
  peru: 'PE',
  uruguay: 'UY',
  venezuela: 'VE',
  cuba: 'CU',
  'puerto rico': 'PR',
  'república dominicana': 'DO',
  francia: 'FR',
  france: 'FR',
  bélgica: 'BE',
  belgica: 'BE',
  belgium: 'BE',
  italia: 'IT',
  italy: 'IT',
  alemania: 'DE',
  germany: 'DE',
  'reino unido': 'GB',
  inglaterra: 'GB',
  'united kingdom': 'GB',
  'estados unidos': 'US',
  'united states': 'US',
  usa: 'US',
  canadá: 'CA',
  canada: 'CA',
  portugal: 'PT',
  rusia: 'RU',
  russia: 'RU',
  ucrania: 'UA',
  ukraine: 'UA',
  japón: 'JP',
  japon: 'JP',
  japan: 'JP',
  'corea del sur': 'KR',
  corea: 'KR',
  'south korea': 'KR',
  korea: 'KR',
  china: 'CN',
  india: 'IN',
  turquía: 'TR',
  turkey: 'TR',
  grecia: 'GR',
  greece: 'GR',
  suecia: 'SE',
  sweden: 'SE',
  noruega: 'NO',
  norway: 'NO',
  irlanda: 'IE',
  ireland: 'IE',
  australia: 'AU',
};

const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  español: 'es',
  spanish: 'es',
  castellano: 'es',
  inglés: 'en',
  ingles: 'en',
  english: 'en',
  francés: 'fr',
  frances: 'fr',
  french: 'fr',
  portugués: 'pt',
  portugues: 'pt',
  portuguese: 'pt',
  italiano: 'it',
  italian: 'it',
  alemán: 'de',
  aleman: 'de',
  german: 'de',
  ruso: 'ru',
  russian: 'ru',
  japonés: 'ja',
  japones: 'ja',
  japanese: 'ja',
  coreano: 'ko',
  korean: 'ko',
  árabe: 'ar',
  arabe: 'ar',
  arabic: 'ar',
  chino: 'zh',
  mandarín: 'zh',
  chinese: 'zh',
  hindi: 'hi',
  turco: 'tr',
  turkish: 'tr',
  instrumental: 'zxx',
  'música instrumental': 'zxx',
  'musica instrumental': 'zxx',
  'instrumental music': 'zxx',
  'sin letra': 'zxx',
  'sin voz': 'zxx',
  'no lyrics': 'zxx',
  strumentale: 'zxx',
  zxx: 'zxx',
};

export function resolveCountryCode(countryName: string, fallback = 'UN'): string {
  const parts = countryName
    .split(/\s*[,\/&]\s*|\s+y\s+/i)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return fallback;
  const resolved = parts
    .map((key) => COUNTRY_NAME_TO_CODE[key])
    .filter((code): code is string => Boolean(code));
  const unique = Array.from(new Set(resolved));
  if (unique.length === parts.length && unique.length > 0) {
    return unique.join(',');
  }
  return unique[0] || fallback;
}

export function resolveLanguageCode(languageName: string, fallback = 'und'): string {
  const parts = languageName
    .split(/\s*[,\/&]\s*|\s+y\s+/i)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return fallback;
  const resolved = parts
    .map((key) => LANGUAGE_NAME_TO_CODE[key])
    .filter((code): code is string => Boolean(code));
  const unique = Array.from(new Set(resolved));
  if (unique.length === parts.length && unique.length > 0) {
    return unique.join(',');
  }
  return unique[0] || fallback;
}

export function isPrivateDevUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.hostname.startsWith('ais-dev-') ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

export function toPublicShareUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.startsWith('ais-dev-')) {
      parsed.hostname = `ais-pre-${parsed.hostname.slice('ais-dev-'.length)}`;
    }
    return `${parsed.origin}${parsed.pathname || '/'}`;
  } catch {
    return trimmed;
  }
}

export function resolvePublicShareUrl(
  _currentHref: string,
  serverPublicUrl?: string,
  customUrl?: string
): string {
  const custom = (customUrl ?? '').trim();
  if (custom) {
    try {
      const parsedCustom = new URL(custom.startsWith('http') ? custom : `https://${custom}`);
      return toPublicShareUrl(`${parsedCustom.origin}${parsedCustom.pathname || '/'}`);
    } catch {
      // Ignore invalid custom URL and fall through to published public URL
    }
  }

  return serverPublicUrl || 'https://joan-manuels-playlists.vercel.app/';
}

export function formatProfileDate(timestampMs: number | undefined, langCode: string): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return '';
  try {
    return new Intl.DateTimeFormat(langCode || 'es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestampMs));
  } catch {
    return new Date(timestampMs).toLocaleDateString();
  }
}

export function buildFallbackPsychologicalProfile(tracks: Track[]): GeneratedProfileDraft {
  const count = tracks.length;
  if (count === 0) {
    return {
      personalitySummary:
        'Un oyente reflexivo y curioso que valora la autenticidad emocional por encima de las modas pasajeras.',
      musicalTasteSummary:
        'Colección en construcción abierta a sonidos de distintas culturas, idiomas y matices melódicos.',
      keyTraits: [
        'Curiosidad cultural abierta',
        'Sensibilidad por lo auténtico',
        'Gusto ecléctico en evolución',
      ],
      trackCount: 0,
      aiQuotaExceeded: true,
    };
  }

  const countries = Array.from(new Set(tracks.map((t) => t.country).filter(Boolean)));
  const languages = Array.from(new Set(tracks.map((t) => t.language).filter(Boolean)));
  const sungLanguages = languages.filter(
    (l) => !/\b(instrumental|sin letra|sin voz)\b/i.test(l)
  );
  const hasInstrumental = tracks.some(
    (t) => t.languageCode === 'zxx' || /\binstrumental\b/i.test(t.language)
  );
  const genres = Array.from(new Set(tracks.map((t) => t.genre).filter(Boolean)));
  const sampleArtists = Array.from(new Set(tracks.map((t) => t.artist).filter(Boolean))).slice(0, 4);

  const multiCountry = countries.length >= 2;
  const multiLang = sungLanguages.length >= 2;

  const languageSentence =
    sungLanguages.length === 0 && hasInstrumental
      ? 'Su afinidad por piezas puramente instrumentales revela a alguien introspectivo y sensible a los matices sonoros, capaz de conectar con la emoción de una melodía sin necesidad de palabras.'
      : multiLang
        ? `Escuchar voces en ${sungLanguages.slice(0, 4).join(', ')}${hasInstrumental ? ' junto a obras instrumentales' : ''} sugiere a alguien empático que presta atención a la atmósfera, la cadencia y el sentimiento detrás de cada canción más allá del idioma.`
        : `Su elección refleja intensidad emocional y gusto por las letras y melodías${hasInstrumental ? ' —incluida la expresión instrumental sin palabras—' : ''} que acompañan momentos de introspección y disfrute genuino.`;

  const personalitySummary = [
    multiCountry
      ? `Joan Manuel se perfila como un hombre de mente abierta, observador y con una notable curiosidad por mundos emocionales distintos al propio, conectando referencias de ${countries.slice(0, 4).join(', ')}.`
      : `Joan Manuel muestra una personalidad definida, fiel a sus convicciones y con un vínculo muy personal con la identidad cultural de ${countries[0] || 'su entorno'}.`,
    languageSentence,
    `A partir de esa sensibilidad estética, resulta natural imaginarlo disfrutando de artes narrativas y visuales como el cine o la fotografía con carácter propio, rutinas que combinan caminatas tranquilas o pausas con café con momentos de energía social, y compañías auténticas con quienes compartir conversaciones honestas sin superficialidad.`,
  ].join(' ');

  const musicalTasteSummary = `A partir de sus ${count} canciones actuales (con artistas como ${sampleArtists.join(', ')}), sus gustos combinan ${genres.slice(0, 5).join(', ')}. Predomina una curaduría con carácter propio: piezas con personalidad marcada, energía rítmica o melancolía elegante pensadas para escucharse con atención y compartirse.`;

  const keyTraits: string[] = [
    multiCountry ? 'Espíritu cosmopolita y curioso' : 'Identidad musical bien definida',
    sungLanguages.length === 0 && hasInstrumental
      ? 'Sensibilidad hacia la música instrumental y atmosférica'
      : multiLang
        ? `Sensibilidad multilingüe (${sungLanguages.slice(0, 3).join(', ')})`
        : `Apego a la expresión en ${sungLanguages[0] || 'su idioma'}`,
    genres.length >= 2 ? `Paladar ecléctico (${genres.slice(0, 2).join(' y ')})` : `Afinidad por ${genres[0] || 'sonidos con carácter'}`,
    'Curador atento al clima emocional de cada tema',
  ];

  return {
    personalitySummary: personalitySummary.slice(0, 1450),
    musicalTasteSummary: musicalTasteSummary.slice(0, 1450),
    keyTraits: keyTraits.slice(0, 5),
    trackCount: count,
    aiQuotaExceeded: true,
  };
}

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'jm_theme';

export function resolveInitialTheme(
  savedTheme: string | null | undefined,
  systemPrefersDark: boolean
): ThemeMode {
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }
  return systemPrefersDark ? 'dark' : 'light';
}

export function toggleThemeMode(current: ThemeMode): ThemeMode {
  return current === 'dark' ? 'light' : 'dark';
}

function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeGenreKey(rawGenre: string): string {
  return stripDiacritics(rawGenre)
    .replace(/\(\s*remix\s*\)/g, '')
    .replace(/\bremix\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENRE_FAMILIES: Array<{ family: string; keywords: string[] }> = [
  {
    family: 'pop',
    keywords: [
      'pop',
      'synth-pop',
      'synthpop',
      'electropop',
      'indie pop',
      'city pop',
      'dream pop',
      'dance-pop',
      'latin pop',
      'pop latino',
      'pop frances',
      'pop alternativo',
      'pop acustico',
      'pop arabe',
      'pop rock',
      'orquestal',
    ],
  },
  {
    family: 'electronic-dance',
    keywords: [
      'electro',
      'electronic',
      'electronico',
      'electronica',
      'electropop',
      'dance',
      'eurodance',
      'guaracha',
      'aleteo',
      'synth-pop',
      'synthpop',
      'cumbia electronica',
      'house',
      'club',
    ],
  },
  {
    family: 'latin-urban-tropical',
    keywords: [
      'latino',
      'latin',
      'guaracha',
      'aleteo',
      'afrobeat',
      'dancehall',
      'regueton',
      'reggaeton',
      'cumbia',
      'tropical',
      'forro',
    ],
  },
  {
    family: 'brazilian',
    keywords: ['mpb', 'musica popular brasileira', 'bossa nova', 'forro', 'samba'],
  },
  {
    family: 'rock-indie',
    keywords: ['rock', 'indie', 'alternativo', 'alternative', 'clasico', 'classic rock', 'pop rock'],
  },
  {
    family: 'ballad-acoustic',
    keywords: [
      'balada',
      'ballad',
      'chanson',
      'acustico',
      'acoustic',
      'soul',
      'r&b',
      'melancolico',
      'cantautor',
      'folk',
      'mpb',
    ],
  },
  {
    family: 'instrumental-piano',
    keywords: [
      'instrumental',
      'piano',
      'contemporaneo',
      'clasica',
      'classical',
      'banda sonora',
      'soundtrack',
      'ambient',
    ],
  },
];

function extractGenreFamilies(rawGenre: string): Set<string> {
  const normalized = stripDiacritics(rawGenre);
  const families = new Set<string>();
  if (!normalized) return families;

  for (const entry of GENRE_FAMILIES) {
    if (entry.keywords.some((kw) => normalized.includes(kw))) {
      families.add(entry.family);
    }
  }
  return families;
}

function extractGenreTokens(rawGenre: string): Set<string> {
  const stopWords = new Set(['de', 'del', 'la', 'el', 'y', 'con', 'and', 'with', 'of', 'remix']);
  return new Set(
    stripDiacritics(rawGenre)
      .split(/[^a-z0-9]+/)
      .filter((tok) => tok.length >= 3 && !stopWords.has(tok))
  );
}

export function computeGenreSimilarityScore(genreA: string, genreB: string): number {
  const normA = normalizeGenreKey(genreA);
  const normB = normalizeGenreKey(genreB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 100;

  let score = 0;
  const familiesA = extractGenreFamilies(genreA);
  const familiesB = extractGenreFamilies(genreB);
  for (const fam of familiesA) {
    if (familiesB.has(fam)) score += 30;
  }

  const tokensA = extractGenreTokens(genreA);
  const tokensB = extractGenreTokens(genreB);
  for (const tok of tokensA) {
    if (tokensB.has(tok)) score += 20;
  }

  return score;
}

function splitCodesSet(rawCode: string): Set<string> {
  return new Set(
    rawCode
      .split(/[,/;&\s]+/)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function deterministicShuffleTracks(tracks: Track[], seed: number): Track[] {
  const copy = [...tracks];
  let state = (Math.abs(Math.floor(seed)) || 1) % 2147483647;
  if (state <= 0) state = 1;
  const nextRand = () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function buildAudioQueue(
  tracks: Track[],
  anchorTrack: Track | null,
  playMode: import('../types').AudioPlayMode,
  radioSeed = 1
): Track[] {
  if (tracks.length === 0) return [];
  const anchor = anchorTrack && tracks.some((tr) => tr.id === anchorTrack.id) ? anchorTrack : tracks[0];

  if (playMode === 'ordered') {
    return [...tracks];
  }

  if (playMode === 'radio') {
    const rest = tracks.filter((tr) => tr.id !== anchor.id);
    return [anchor, ...deterministicShuffleTracks(rest, radioSeed)];
  }

  if (playMode === 'same-language') {
    const anchorCodes = splitCodesSet(anchor.languageCode);
    const matches = tracks.filter((tr) => {
      if (tr.id === anchor.id) return false;
      const codes = splitCodesSet(tr.languageCode);
      for (const code of anchorCodes) {
        if (codes.has(code)) return true;
      }
      return stripDiacritics(tr.language) === stripDiacritics(anchor.language);
    });
    return [anchor, ...matches];
  }

  if (playMode === 'same-genre') {
    const anchorGenre = normalizeGenreKey(anchor.genre);
    const matches = tracks.filter(
      (tr) => tr.id !== anchor.id && normalizeGenreKey(tr.genre) === anchorGenre
    );
    return [anchor, ...matches];
  }

  // similar-genre
  const scored = tracks
    .filter((tr) => tr.id !== anchor.id)
    .map((tr) => ({
      track: tr,
      score: computeGenreSimilarityScore(anchor.genre, tr.genre),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return [anchor, ...scored.map((entry) => entry.track)];
}

export function getAdjacentAudioTrack(
  queue: Track[],
  currentTrackId: string | null,
  direction: 1 | -1,
  wrapAround = true
): Track | null {
  if (queue.length === 0) return null;
  if (!currentTrackId) return queue[0];
  const currentIndex = queue.findIndex((tr) => tr.id === currentTrackId);
  if (currentIndex === -1) return queue[0];

  const targetIndex = currentIndex + direction;
  if (targetIndex >= 0 && targetIndex < queue.length) {
    return queue[targetIndex];
  }
  if (!wrapAround) return null;
  return direction === 1 ? queue[0] : queue[queue.length - 1];
}

export function formatAudioTime(rawSeconds: number): string {
  if (!Number.isFinite(rawSeconds) || rawSeconds <= 0) return '0:00';
  const totalSeconds = Math.floor(rawSeconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function shouldShowVideoGallery(opts: {
  mode: PlaylistMode;
  selectedKey: string | null;
  genre: string | null;
  query: string;
}): boolean {
  return Boolean(
    opts.selectedKey ||
      opts.mode === 'all' ||
      (opts.genre && opts.genre.trim()) ||
      opts.query.trim()
  );
}




