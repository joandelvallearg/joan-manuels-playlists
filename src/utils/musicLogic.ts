import type { PlaylistGroup, PlaylistMode, Track } from '../types';

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

export function getCountryFlagEmoji(countryCode: string): string {
  const clean = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '';
  const first = clean.codePointAt(0)! - 65 + 0x1f1e6;
  const second = clean.codePointAt(1)! - 65 + 0x1f1e6;
  return String.fromCodePoint(first, second);
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
      const haystack = `${track.title} ${track.artist} ${track.country} ${track.language} ${track.genre}`.toLowerCase();
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
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  try {
    const dn = new Intl.DisplayNames([targetLang], { type: 'region' });
    const label = dn.of(code);
    return label && label !== code ? label : null;
  } catch {
    return null;
  }
}

export function translateLanguageByCode(languageCode: string, targetLang: string): string | null {
  const code = languageCode.trim().toLowerCase();
  if (!code || code === 'zxx') return null;
  try {
    const dn = new Intl.DisplayNames([targetLang], { type: 'language' });
    const label = dn.of(code);
    if (!label || label === code) return null;
    return label.charAt(0).toUpperCase() + label.slice(1);
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
};

export function resolveCountryCode(countryName: string, fallback = 'UN'): string {
  const key = countryName.trim().toLowerCase();
  if (!key) return fallback;
  if (COUNTRY_NAME_TO_CODE[key]) return COUNTRY_NAME_TO_CODE[key];
  return fallback;
}

export function resolveLanguageCode(languageName: string, fallback = 'und'): string {
  const key = languageName.trim().toLowerCase();
  if (!key) return fallback;
  if (LANGUAGE_NAME_TO_CODE[key]) return LANGUAGE_NAME_TO_CODE[key];
  return fallback;
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
  currentHref: string,
  serverPublicUrl?: string,
  customUrl?: string
): string {
  const custom = (customUrl ?? '').trim();
  if (custom) {
    try {
      const parsedCustom = new URL(custom.startsWith('http') ? custom : `https://${custom}`);
      return toPublicShareUrl(`${parsedCustom.origin}${parsedCustom.pathname || '/'}`);
    } catch {
      // Ignore invalid custom URL and fall through to automatic detection
    }
  }

  if (currentHref) {
    try {
      const parsed = new URL(currentHref);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        if (serverPublicUrl) {
          return toPublicShareUrl(serverPublicUrl);
        }
      }
      return toPublicShareUrl(`${parsed.origin}${parsed.pathname || '/'}`);
    } catch {
      // Ignore invalid currentHref
    }
  }

  return serverPublicUrl ? toPublicShareUrl(serverPublicUrl) : '';
}


