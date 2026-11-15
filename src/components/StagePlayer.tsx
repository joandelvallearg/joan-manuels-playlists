import { SkipBack, SkipForward, X } from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import type { Track } from '../types';
import { getCountryFlagEmoji, getYouTubeEmbedUrl } from '../utils/musicLogic';

interface StagePlayerProps {
  t: (key: UiStringKey) => string;
  activeTrack: Track | null;
  autoplay: boolean;
  activePlaylistLabel: string | null;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClosePlayer: () => void;
  translateTerm: (term: string) => string;
}

export function StagePlayer({
  t,
  activeTrack,
  autoplay,
  activePlaylistLabel,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onClosePlayer,
  translateTerm,
}: StagePlayerProps) {
  if (!activeTrack) {
    return null;
  }

  return (
    <section id="player" data-testid="stage-player" className="scroll-mt-20 bg-[#0A0A0B] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8 lg:py-10">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          {/* Embedded YouTube Theater */}
          <div className="lg:col-span-8">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <iframe
                key={`${activeTrack.youtubeId}-${autoplay ? 'auto' : 'idle'}`}
                src={getYouTubeEmbedUrl(activeTrack.youtubeId, autoplay)}
                title={`${activeTrack.title} - ${activeTrack.artist}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </div>

          {/* Track Metadata & Queue Controls */}
          <div className="flex flex-col justify-between gap-6 lg:col-span-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-blue-400">
                  <span>{t('nowPlaying')}</span>
                  {activePlaylistLabel && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-zinc-300">{activePlaylistLabel}</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onClosePlayer}
                  aria-label={t('close')}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-1.5">
                <h2
                  data-testid="stage-track-title"
                  className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl leading-tight"
                >
                  {activeTrack.title}
                </h2>
                <p className="text-base font-medium text-zinc-300">{activeTrack.artist}</p>
              </div>

              <dl className="grid grid-cols-1 gap-2.5 border-y border-zinc-800 py-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-400">{t('countryLabel')}</dt>
                  <dd className="font-medium text-white text-right">
                    <span aria-hidden="true" className="mr-1.5">
                      {getCountryFlagEmoji(activeTrack.countryCode)}
                    </span>
                    {translateTerm(activeTrack.country)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-400">{t('languageSungLabel')}</dt>
                  <dd className="font-medium text-white text-right">
                    {translateTerm(activeTrack.language)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-400">{t('genreLabel')}</dt>
                  <dd className="font-medium text-white text-right">
                    {translateTerm(activeTrack.genre)}
                  </dd>
                </div>
              </dl>

              {activeTrack.curatorNote && (
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {translateTerm(activeTrack.curatorNote)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onPrevious}
                disabled={!hasPrevious}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <SkipBack className="h-4 w-4" aria-hidden="true" />
                <span>{t('previousTrack')}</span>
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <span>{t('nextTrack')}</span>
                <SkipForward className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
