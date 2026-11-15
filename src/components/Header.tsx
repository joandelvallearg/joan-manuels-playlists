import { QrCode } from 'lucide-react';
import type { UiStringKey } from '../data/translations';

interface HeaderProps {
  t: (key: UiStringKey) => string;
  onOpenQr: () => void;
}

export function Header({ t, onOpenQr }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
        <a
          href="#top"
          className="font-display text-lg font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
        >
          Joan Manuel
        </a>

        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
          <a
            href="#playlists"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {t('navByCountry')}
          </a>
          <a
            href="#playlists-language"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {t('navByLanguage')}
          </a>
          <a
            href="#gallery"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {t('navGallery')}
          </a>
          <a
            href="#photos"
            className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            {t('navPhotos')}
          </a>
        </nav>

        <div className="flex items-center shrink-0">
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
