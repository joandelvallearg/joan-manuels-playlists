import { Globe, Lock, UserCheck } from 'lucide-react';
import { LANGUAGE_OPTIONS, type UiStringKey } from '../data/translations';
import { OWNER_SPANISH_NAME, type TransliterationInfo } from '../types';

interface HeroPhotoSectionProps {
  t: (key: UiStringKey) => string;
  currentLang: string;
  onChangeLang: (langCode: string) => void;
  isTranslating: boolean;
  transliteration: TransliterationInfo;
  totalTracks: number;
  isOwner: boolean;
  onOpenOwnerStudio: (initialTab?: 'video' | 'photo') => void;
}

export function HeroPhotoSection({
  t,
  currentLang,
  onChangeLang,
  isTranslating,
  transliteration,
  totalTracks,
  isOwner,
  onOpenOwnerStudio,
}: HeroPhotoSectionProps) {
  return (
    <section id="top" className="scroll-mt-20 border-b border-zinc-200 bg-[#F6F7F9] transition-colors dark:border-zinc-800 dark:bg-zinc-900/70">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        <div className="flex flex-col gap-6 max-w-3xl">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{t('greetingPrefix')}</p>
              <p
                data-testid="hero-total-tracks"
                className="font-mono text-xs sm:text-sm font-semibold text-zinc-700 tabular-nums dark:text-zinc-300"
              >
                {t('totalLabel')}: {totalTracks}{' '}
                {totalTracks === 1 ? t('songsCountSingle') : t('songsCountPlural')}
              </p>
            </div>

            <div className="space-y-2">
              <h1
                lang="es"
                className="font-display text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl leading-[1.05] text-balance dark:text-zinc-50"
              >
                {OWNER_SPANISH_NAME}
              </h1>

              <div className="pt-1">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {t('transliterationLabel')} · {transliteration.scriptLabel}
                </p>
                <p
                  data-testid="transliterated-name"
                  className="mt-0.5 font-display text-lg font-semibold text-blue-700 sm:text-2xl leading-snug text-balance dark:text-blue-400"
                >
                  {transliteration.transliteratedName}
                </p>
              </div>
            </div>

            <p className="max-w-2xl text-lg font-medium text-zinc-900 leading-relaxed text-balance dark:text-zinc-100">
              {t('heroSubtitle')}
            </p>

            <p className="max-w-2xl text-sm text-zinc-600 leading-relaxed dark:text-zinc-400">
              {t('heroDescription')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-zinc-200/80 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
              <label htmlFor="visitor-language-select" className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 whitespace-nowrap dark:text-zinc-400">
                <Globe className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                <span>{t('languageLabel')}</span>
              </label>
              <select
                id="visitor-language-select"
                value={currentLang}
                onChange={(e) => onChangeLang(e.target.value)}
                className="max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nativeName} ({lang.englishName})
                  </option>
                ))}
              </select>
              {isTranslating && (
                <span className="text-xs text-blue-700 font-medium dark:text-blue-400">{t('translatingNotice')}</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => onOpenOwnerStudio('video')}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {isOwner ? (
                <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
              )}
              <span>{isOwner ? t('ownerStudioButton') : t('ownerSignInButton')}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
