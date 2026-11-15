import type { ProfileTranslation, PsychologicalProfile } from '../types';

export function mapToPublicTranslateLang(langCode: string): string {
  const clean = langCode.trim().toLowerCase();
  if (clean === 'zh' || clean === 'zh-cn' || clean === 'zh-hans') return 'zh-CN';
  if (clean === 'zh-tw' || clean === 'zh-hant') return 'zh-TW';
  return clean.split('-')[0] || 'en';
}

export function parseGoogleTranslateResponse(payload: unknown): string {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return '';
  return (payload[0] as unknown[])
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
    .join('')
    .trim();
}

export async function translateSingleViaPublicFallback(
  text: string,
  targetLang: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const cleanText = text.trim();
  if (!cleanText || targetLang === 'es') return cleanText || null;

  const tl = mapToPublicTranslateLang(targetLang);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=${encodeURIComponent(
    tl
  )}&dt=t&q=${encodeURIComponent(cleanText)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    const translated = parseGoogleTranslateResponse(data);
    return translated || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function translateTermsPublicFallback(
  terms: string[],
  targetLang: string,
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean))).slice(0, 30);
  if (unique.length === 0 || targetLang === 'es') return {};

  const out: Record<string, string> = {};
  const results = await Promise.allSettled(
    unique.map(async (term) => {
      const translated = await translateSingleViaPublicFallback(term, targetLang, fetchImpl);
      return { term, translated };
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.translated) {
      out[r.value.term] = r.value.translated;
    }
  }
  return out;
}

export function getLocalizedProfileContent(
  profile: PsychologicalProfile,
  currentLang: string,
  translateTerm: (term: string) => string
): ProfileTranslation {
  if (currentLang === 'es') {
    return {
      personalitySummary: profile.personalitySummary,
      musicalTasteSummary: profile.musicalTasteSummary,
      keyTraits: profile.keyTraits,
    };
  }

  const preTranslated = profile.translations?.[currentLang];
  if (
    preTranslated &&
    preTranslated.personalitySummary?.trim() &&
    preTranslated.musicalTasteSummary?.trim()
  ) {
    return {
      personalitySummary: preTranslated.personalitySummary,
      musicalTasteSummary: preTranslated.musicalTasteSummary,
      keyTraits:
        Array.isArray(preTranslated.keyTraits) && preTranslated.keyTraits.length > 0
          ? preTranslated.keyTraits
          : profile.keyTraits.map((trait) => translateTerm(trait)),
    };
  }

  return {
    personalitySummary: translateTerm(profile.personalitySummary),
    musicalTasteSummary: translateTerm(profile.musicalTasteSummary),
    keyTraits: profile.keyTraits.map((trait) => translateTerm(trait)),
  };
}
