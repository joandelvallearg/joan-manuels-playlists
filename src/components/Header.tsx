import { Moon, QrCode, Sun } from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import type { ThemeMode } from '../utils/musicLogic';

interface HeaderProps {
  t: (key: UiStringKey) => string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenQr: () => void;
}

export function Header({ t, theme, onToggleTheme, onOpenQr }: HeaderProps) {
  const isDark = theme === 'dark';
  const toggleLabel = isDark ? t('themeToggleLight') : t('themeToggleDark');

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-sm transition-colors dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 sm:gap-8 px-6 py-4">
        <a
          href="#top"
          className="font-display text-lg font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded dark:text-zinc-50"
        >
          Joan Manuel
        </a>

        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          <a
            href="#playlists"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-zinc-50"
          >
            {t('navByCountry')}
          </a>
          <a
            href="#playlists-language"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-zinc-50"
          >
            {t('navByLanguage')}
          </a>
          <a
            href="#my-playlists"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-zinc-50"
          >
            {t('navMyPlaylists')}
          </a>
          <a
            href="#gallery"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-zinc-50"
          >
            {t('navGallery')}
          </a>
          <a
            href="#photos"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-zinc-50"
          >
            {t('navPhotos')}
          </a>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="theme-toggle"
            onClick={onToggleTheme}
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-pressed={isDark}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            {isDark ? (
              <Sun className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenQr}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <QrCode className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('navQr')}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
