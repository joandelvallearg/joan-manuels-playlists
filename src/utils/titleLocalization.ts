import type { Track } from '../types';
import { mapToPublicTranslateLang, parseGoogleTranslateResponse } from './profileTranslation';

export type ScriptFamily =
  | 'latin'
  | 'cyrillic'
  | 'japanese'
  | 'korean'
  | 'arabic'
  | 'chinese'
  | 'devanagari'
  | 'greek'
  | 'hebrew'
  | 'thai';

export type TitleAnnotationKind = 'translation' | 'transliteration' | 'none';

export interface TitleAnnotation {
  kind: TitleAnnotationKind;
  text: string;
}

const SCRIPT_PATTERNS: Array<{ family: ScriptFamily; regex: RegExp }> = [
  { family: 'cyrillic', regex: /[\u0400-\u04FF]/ },
  { family: 'arabic', regex: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/ },
  { family: 'korean', regex: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/ },
  { family: 'japanese', regex: /[\u3040-\u309F\u30A0-\u30FF]/ },
  { family: 'chinese', regex: /[\u4E00-\u9FFF\u3400-\u4DBF]/ },
  { family: 'devanagari', regex: /[\u0900-\u097F]/ },
  { family: 'greek', regex: /[\u0370-\u03FF]/ },
  { family: 'hebrew', regex: /[\u0590-\u05FF]/ },
  { family: 'thai', regex: /[\u0E00-\u0E7F]/ },
  { family: 'latin', regex: /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/ },
];

const LANG_TO_SCRIPT: Record<string, ScriptFamily> = {
  es: 'latin',
  en: 'latin',
  fr: 'latin',
  pt: 'latin',
  de: 'latin',
  it: 'latin',
  tr: 'latin',
  nl: 'latin',
  pl: 'latin',
  sv: 'latin',
  no: 'latin',
  fi: 'latin',
  ro: 'latin',
  cs: 'latin',
  vi: 'latin',
  id: 'latin',
  ru: 'cyrillic',
  uk: 'cyrillic',
  bg: 'cyrillic',
  sr: 'cyrillic',
  be: 'cyrillic',
  mk: 'cyrillic',
  ja: 'japanese',
  ko: 'korean',
  ar: 'arabic',
  fa: 'arabic',
  ur: 'arabic',
  zh: 'chinese',
  hi: 'devanagari',
  mr: 'devanagari',
  ne: 'devanagari',
  el: 'greek',
  he: 'hebrew',
  iw: 'hebrew',
  th: 'thai',
};

export function getTargetScript(langCode: string): ScriptFamily {
  const base = (langCode || 'es').trim().toLowerCase().split('-')[0];
  return LANG_TO_SCRIPT[base] ?? 'latin';
}

/**
 * Strips common parenthetical/bracketed video metadata suffixes (e.g. "(Official Video)",
 * "(LIVE @ Авторадио)", "(Alt. Version)") so script & redundancy checks inspect the core title.
 */
export function stripTitleMetadataSuffix(rawTitle: string): string {
  return rawTitle
    .replace(
      /\s*[\(\[]\s*(?:official(?:\s+music)?\s+video|clip\s+officiel|video\s+oficial|audio\s+oficial|lyric\s+video|lyrics|live(?:\s*@[^)\]]*)?|alt\.?\s*version|version\s+oficial|en\s+vivo|en\s+español|hd|4k|remastered|feat\.?[^)\]]*|ft\.?[^)\]]*|[^)\]]*\bremix\b[^)\]]*)\s*[\)\]]/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectTitleScripts(title: string): ScriptFamily[] {
  const core = stripTitleMetadataSuffix(title) || title;
  const found: ScriptFamily[] = [];
  for (const entry of SCRIPT_PATTERNS) {
    if (entry.regex.test(core)) {
      found.push(entry.family);
    }
  }
  return found;
}

function isScriptCompatibleWithTarget(script: ScriptFamily, targetScript: ScriptFamily): boolean {
  if (script === targetScript) return true;
  // Kanji (Han / CJK ideographs) are native to Japanese alongside Hiragana & Katakana
  if (targetScript === 'japanese' && script === 'chinese') return true;
  return false;
}

/**
 * Returns true if the core song title uses writing characters/script different
 * from the visitor's target language script.
 */
export function titleDiffersFromUserScript(title: string, targetLang: string): boolean {
  const scripts = detectTitleScripts(title);
  if (scripts.length === 0) return false;
  const targetScript = getTargetScript(targetLang);
  return scripts.some((s) => !isScriptCompatibleWithTarget(s, targetScript));
}

function normalizeForComparison(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function isTrackAlreadyInTargetLanguage(
  track: Pick<Track, 'title' | 'languageCode'>,
  targetLang: string
): boolean {
  const targetBase = (targetLang || 'es').trim().toLowerCase().split('-')[0];
  const codes = (track.languageCode || '')
    .split(/[,/;&\s]+/)
    .map((c) => c.trim().toLowerCase().split('-')[0])
    .filter(Boolean);

  if (codes.length === 1 && codes[0] === targetBase && codes[0] !== 'zxx') {
    // Only consider it already localized if its title isn't written in a foreign script
    // (e.g., Russian track titled "Life" still needs translation for Russian visitors).
    if (!titleDiffersFromUserScript(track.title, targetLang)) {
      return true;
    }
  }
  return false;
}

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  А: 'A', а: 'a',
  Б: 'B', б: 'b',
  В: 'V', в: 'v',
  Г: 'G', г: 'g',
  Д: 'D', д: 'd',
  Е: 'E', е: 'e',
  Ё: 'Yo', ё: 'yo',
  Ж: 'Zh', ж: 'zh',
  З: 'Z', з: 'z',
  И: 'I', и: 'i',
  Й: 'Y', й: 'y',
  К: 'K', к: 'k',
  Л: 'L', л: 'l',
  М: 'M', м: 'm',
  Н: 'N', н: 'n',
  О: 'O', о: 'o',
  П: 'P', п: 'p',
  Р: 'R', р: 'r',
  С: 'S', с: 's',
  Т: 'T', т: 't',
  У: 'U', у: 'u',
  Ф: 'F', ф: 'f',
  Х: 'Kh', х: 'kh',
  Ц: 'Ts', ц: 'ts',
  Ч: 'Ch', ч: 'ch',
  Ш: 'Sh', ш: 'sh',
  Щ: 'Shch', щ: 'shch',
  Ъ: '', ъ: '',
  Ы: 'Y', ы: 'y',
  Ь: '', ь: '',
  Э: 'E', э: 'e',
  Ю: 'Yu', ю: 'yu',
  Я: 'Ya', я: 'ya',
  І: 'I', і: 'i',
  Ї: 'Yi', ї: 'yi',
  Є: 'Ye', є: 'ye',
  Ґ: 'G', ґ: 'g',
};

const CYRILLIC_VOWELS_AND_SIGNS = new Set([
  'А', 'а', 'Е', 'е', 'Ё', 'ё', 'И', 'и', 'Й', 'й', 'О', 'о', 'У', 'у', 'Ы', 'ы', 'Э', 'э', 'Ю', 'ю', 'Я', 'я', 'Ъ', 'ъ', 'Ь', 'ь',
]);

/**
 * Deterministic BGN/PCGN-style Cyrillic -> Latin phonetic transliterator used as an
 * offline/fallback safety net when a Cyrillic title has no semantic translation.
 */
export function transliterateCyrillicToLatin(input: string): string {
  const core = stripTitleMetadataSuffix(input) || input;
  let result = '';
  for (let i = 0; i < core.length; i++) {
    const ch = core[i];
    const prev = i > 0 ? core[i - 1] : '';
    let mapped = CYRILLIC_TO_LATIN_MAP[ch];
    if ((ch === 'е' || ch === 'Е') && (i === 0 || !/[\u0400-\u04FF]/.test(prev) || CYRILLIC_VOWELS_AND_SIGNS.has(prev))) {
      mapped = ch === 'Е' ? 'Ye' : 'ye';
    }
    if (mapped !== undefined) {
      // Preserve ALL-CAPS digraphs if next char is also uppercase Cyrillic
      const next = core[i + 1] ?? '';
      if (
        mapped.length > 1 &&
        ch === ch.toUpperCase() &&
        ch !== ch.toLowerCase() &&
        next &&
        next === next.toUpperCase() &&
        next !== next.toLowerCase()
      ) {
        result += mapped.toUpperCase();
      } else {
        result += mapped;
      }
    } else {
      result += ch;
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}

function cleanCandidateText(raw: string): string {
  let text = raw.trim();
  // Strip accidental outer parentheses returned by an LLM
  if (text.startsWith('(') && text.endsWith(')') && !text.slice(1, -1).includes('(')) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/\s+/g, ' ').trim();
}

function isRedundantGloss(title: string, candidate: string): boolean {
  const normCandidate = normalizeForComparison(candidate);
  if (!normCandidate) return true;

  const normFull = normalizeForComparison(title);
  const core = stripTitleMetadataSuffix(title) || title;
  const normCore = normalizeForComparison(core);

  if (normCandidate === normFull || normCandidate === normCore) {
    return true;
  }

  // If the original bilingual title already contains the exact translation after "/"
  // (e.g., "Boa Sorte / Good Luck" when target is English -> "Good Luck"), suppress redundancy.
  if (core.includes('/')) {
    const segments = core
      .split('/')
      .map((s) => normalizeForComparison(s))
      .filter(Boolean);
    if (segments.includes(normCandidate)) {
      return true;
    }
  }

  return false;
}

/**
 * Enforces the user's exact rule:
 * 1. Always show original title; append "(gloss)" ONLY when:
 *    - A genuine translation exists in the visitor's language (and differs from original), OR
 *    - No translation exists AND the title's characters/script differ from the visitor's script,
 *      in which case show the most accurate phonetic transliteration.
 * 2. Never show parentheses when the song is already in the visitor's language (same script),
 *    or when no translation exists and the scripts are the same.
 */
export function resolveTitleGloss(
  title: string,
  targetLang: string,
  annotation: TitleAnnotation | null | undefined,
  trackLanguageCode?: string
): string | null {
  const cleanTitle = title.trim();
  if (!cleanTitle) return null;

  if (
    trackLanguageCode &&
    isTrackAlreadyInTargetLanguage({ title: cleanTitle, languageCode: trackLanguageCode }, targetLang)
  ) {
    return null;
  }

  const scriptsDiffer = titleDiffersFromUserScript(cleanTitle, targetLang);

  if (annotation && annotation.kind !== 'none' && annotation.text?.trim()) {
    const candidate = cleanCandidateText(annotation.text);
    if (!candidate) return null;

    if (annotation.kind === 'translation') {
      if (isRedundantGloss(cleanTitle, candidate)) {
        // Translation matched original (e.g., proper name), only fall back to transliteration if scripts differ
        if (scriptsDiffer && getTargetScript(targetLang) === 'latin' && detectTitleScripts(cleanTitle).includes('cyrillic')) {
          const fallback = transliterateCyrillicToLatin(cleanTitle);
          return fallback && !isRedundantGloss(cleanTitle, fallback) ? fallback : null;
        }
        return null;
      }
      return candidate;
    }

    if (annotation.kind === 'transliteration') {
      if (!scriptsDiffer) return null;
      if (isRedundantGloss(cleanTitle, candidate)) return null;
      return candidate;
    }
  }

  // Deterministic safety fallback: if title is Cyrillic and user reads Latin script, always transliterate
  if (
    scriptsDiffer &&
    getTargetScript(targetLang) === 'latin' &&
    detectTitleScripts(cleanTitle).includes('cyrillic')
  ) {
    const fallback = transliterateCyrillicToLatin(cleanTitle);
    if (fallback && !isRedundantGloss(cleanTitle, fallback)) {
      return fallback;
    }
  }

  return null;
}

export function formatTrackTitlePlain(title: string, gloss: string | null): string {
  const clean = title.trim();
  return gloss ? `${clean} (${gloss})` : clean;
}

export interface TitleLocalizationItem {
  title: string;
  artist?: string;
  language?: string;
  languageCode?: string;
}

/**
 * Extracts romanization/transliteration from Google Translate `dt=t&dt=rm` payload when present.
 */
export function parseGoogleTransliterationResponse(payload: unknown): string {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return '';
  const rows = payload[0] as unknown[];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (Array.isArray(row) && row[0] == null && row[1] == null) {
      const targetTranslit = typeof row[2] === 'string' ? row[2].trim() : '';
      const sourceTranslit = typeof row[3] === 'string' ? row[3].trim() : '';
      if (targetTranslit) return targetTranslit;
      if (sourceTranslit) return sourceTranslit;
    }
  }
  return '';
}

async function localizeSingleTitlePublicFallback(
  item: TitleLocalizationItem,
  targetLang: string,
  fetchImpl: typeof fetch
): Promise<TitleAnnotation> {
  const coreTitle = stripTitleMetadataSuffix(item.title) || item.title.trim();
  if (!coreTitle) return { kind: 'none', text: '' };

  if (
    item.languageCode &&
    isTrackAlreadyInTargetLanguage({ title: item.title, languageCode: item.languageCode }, targetLang)
  ) {
    return { kind: 'none', text: '' };
  }

  const tl = mapToPublicTranslateLang(targetLang);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    tl
  )}&dt=t&dt=rm&q=${encodeURIComponent(coreTitle)}`;

  const scriptsDiffer = titleDiffersFromUserScript(item.title, targetLang);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (res.ok) {
      const data = (await res.json()) as unknown;
      const translated = cleanCandidateText(parseGoogleTranslateResponse(data));
      const translit = cleanCandidateText(parseGoogleTransliterationResponse(data));

      if (translated && !isRedundantGloss(item.title, translated)) {
        // Distinguish real translation from unchanged script when scripts differ
        return { kind: 'translation', text: translated };
      }

      if (scriptsDiffer) {
        if (translit && !isRedundantGloss(item.title, translit)) {
          return { kind: 'transliteration', text: translit };
        }
        if (getTargetScript(targetLang) === 'latin' && detectTitleScripts(item.title).includes('cyrillic')) {
          const cyr = transliterateCyrillicToLatin(item.title);
          if (cyr && !isRedundantGloss(item.title, cyr)) {
            return { kind: 'transliteration', text: cyr };
          }
        }
      }
      return { kind: 'none', text: '' };
    }
  } catch {
    // Fall through to deterministic script transliterator
  } finally {
    clearTimeout(timer);
  }

  if (
    scriptsDiffer &&
    getTargetScript(targetLang) === 'latin' &&
    detectTitleScripts(item.title).includes('cyrillic')
  ) {
    const cyr = transliterateCyrillicToLatin(item.title);
    if (cyr && !isRedundantGloss(item.title, cyr)) {
      return { kind: 'transliteration', text: cyr };
    }
  }

  return { kind: 'none', text: '' };
}

/**
 * Client-side resilient fallback for static hosting / offline / quota situations.
 * Works for ALL target languages including 'es' (e.g., translating Russian/English/French
 * song titles into Spanish or transliterating Cyrillic proper names).
 */
export async function localizeSongTitlesPublicFallback(
  items: TitleLocalizationItem[],
  targetLang: string,
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, TitleAnnotation>> {
  if (!targetLang || items.length === 0) return {};

  const uniqueByTitle = new Map<string, TitleLocalizationItem>();
  for (const item of items) {
    const key = item.title.trim();
    if (!key || uniqueByTitle.has(key)) continue;
    uniqueByTitle.set(key, item);
  }

  const list = Array.from(uniqueByTitle.entries()).slice(0, 120);
  const out: Record<string, TitleAnnotation> = {};
  const batchSize = 8;

  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async ([key, item]) => ({
        key,
        annotation: await localizeSingleTitlePublicFallback(item, targetLang, fetchImpl),
      }))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        out[r.value.key] = r.value.annotation;
      }
    }
  }

  return out;
}
