import { Globe2, Languages, ListMusic, Play, Plus, Search, Trash2, Volume2 } from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import type { PlaylistGroup, PlaylistMode, Track } from '../types';
import { formatCodesDisplay, getCountryFlagEmoji, shouldShowVideoGallery } from '../utils/musicLogic';

interface PlaylistExplorerProps {
  t: (key: UiStringKey) => string;
  mode: PlaylistMode;
  onChangeMode: (mode: PlaylistMode) => void;
  selectedKey: string | null;
  onSelectGroup: (key: string | null) => void;
  onPlayPlaylist: (group: PlaylistGroup) => void;
  countryGroups: PlaylistGroup[];
  languageGroups: PlaylistGroup[];
  genres: string[];
  selectedGenre: string | null;
  onChangeGenre: (genre: string | null) => void;
  searchQuery: string;
  onChangeSearch: (query: string) => void;
  filteredTracks: Track[];
  activeTrackId: string | null;
  onPlayTrack: (track: Track) => void;
  isOwner: boolean;
  onDeleteTrack: (track: Track) => void;
  onOpenAddVideo: () => void;
  hasAnyTracks: boolean;
  translateTerm: (term: string) => string;
  getTitleGloss: (track: Track) => string | null;
}

export function PlaylistExplorer({
  t,
  mode,
  onChangeMode,
  selectedKey,
  onSelectGroup,
  onPlayPlaylist,
  countryGroups,
  languageGroups,
  genres,
  selectedGenre,
  onChangeGenre,
  searchQuery,
  onChangeSearch,
  filteredTracks,
  activeTrackId,
  onPlayTrack,
  isOwner,
  onDeleteTrack,
  onOpenAddVideo,
  hasAnyTracks,
  translateTerm,
  getTitleGloss,
}: PlaylistExplorerProps) {
  const activeGroups = mode === 'country' ? countryGroups : mode === 'language' ? languageGroups : [];
  const showGallery = shouldShowVideoGallery({
    mode,
    selectedKey,
    genre: selectedGenre,
    query: searchQuery,
  });
  const selectedGroup = selectedKey ? activeGroups.find((g) => g.key === selectedKey) ?? null : null;

  const formatSongCount = (count: number) =>
    `${count} ${count === 1 ? t('songsCountSingle') : t('songsCountPlural')}`;

  return (
    <section id="playlists" className="scroll-mt-20 bg-white transition-colors dark:bg-zinc-950">
      <div id="playlists-language" className="scroll-mt-20 mx-auto max-w-6xl px-6 py-12 space-y-8">
        {/* Controls Row: Mode Tabs + Search + Genre Filter */}
        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-center lg:justify-between dark:border-zinc-800">
          <div role="tablist" aria-label="Modo de playlists" className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'country'}
              onClick={() => onChangeMode('country')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'country'
                  ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('modeCountry')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'language'}
              onClick={() => onChangeMode('language')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'language'
                  ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Languages className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('modeLanguage')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'all'}
              onClick={() => onChangeMode('all')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'all'
                  ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <ListMusic className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('modeAll')}</span>
            </button>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="relative min-w-0 w-full sm:w-64 sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onChangeSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500"
              />
            </div>

            <select
              aria-label={t('genreLabel')}
              value={selectedGenre ?? ''}
              onChange={(e) => onChangeGenre(e.target.value || null)}
              className="w-full min-w-0 max-w-full truncate rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 focus:border-blue-600 focus:outline-none sm:w-auto sm:max-w-[16rem] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-500"
            >
              <option value="">{t('allGenres')}</option>
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {translateTerm(genre)}
                </option>
              ))}
            </select>

            {isOwner && (
              <button
                type="button"
                onClick={onOpenAddVideo}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('addVideoButton')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Playlist Cards Grid (Country or Language) */}
        {activeGroups.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeGroups.map((group) => {
              const isSelected = selectedKey === group.key;
              const flag = mode === 'country' ? getCountryFlagEmoji(group.code) : '';
              const translatedLabel = translateTerm(group.label);
              const genrePreview = group.genres.slice(0, 3).map(translateTerm).join(' · ');

              return (
                <div
                  key={group.key}
                  className={`flex flex-col justify-between gap-4 rounded-2xl border p-5 transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectGroup(isSelected ? null : group.key)}
                    className="text-left space-y-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
                        {flag && <span aria-hidden="true" className="mr-2">{flag}</span>}
                        {translatedLabel}
                      </h3>
                      <span className="font-mono text-xs font-medium text-zinc-500 tabular-nums shrink-0 dark:text-zinc-400">
                        {formatSongCount(group.tracks.length)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 line-clamp-1 dark:text-zinc-400">{genrePreview}</p>
                  </button>

                  <div className="flex items-center justify-between gap-3 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
                    <span className="font-mono text-xs text-zinc-500 uppercase dark:text-zinc-400">
                      {formatCodesDisplay(group.code)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onPlayPlaylist(group)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 whitespace-nowrap cursor-pointer dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-blue-500 dark:hover:text-white"
                    >
                      <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                      <span>{t('playPlaylist')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Thumbnail Galleries Grid (only shown when a country/filter/all view is selected) */}
        <div id="gallery" className="scroll-mt-20 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
            <h2 className="font-display text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              {t('galleryHeading')}
              {selectedGroup ? ` · ${translateTerm(selectedGroup.label)}` : ''}
            </h2>
            <div className="flex items-center gap-3">
              {showGallery && (
                <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {formatSongCount(filteredTracks.length)}
                </span>
              )}
              {selectedKey && (
                <button
                  type="button"
                  data-testid="gallery-clear-selection"
                  onClick={() => onSelectGroup(null)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {t('clearSelection')}
                </button>
              )}
            </div>
          </div>

          {!showGallery ? (
            <div
              data-testid="gallery-prompt"
              className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-8 text-center dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {t('selectPlaylistForGallery')}
              </p>
            </div>
          ) : filteredTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 py-12 px-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {hasAnyTracks ? t('noTracksMatch') : t('emptyTracksText')}
              </p>
              {hasAnyTracks ? (
                <button
                  type="button"
                  onClick={() => {
                    onSelectGroup(null);
                    onChangeGenre(null);
                    onChangeSearch('');
                  }}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 cursor-pointer dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  {t('clearFilters')}
                </button>
              ) : (
                isOwner && (
                  <button
                    type="button"
                    onClick={onOpenAddVideo}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('addVideoButton')}</span>
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTracks.map((track) => {
                const isActive = track.id === activeTrackId;
                const flag = getCountryFlagEmoji(track.countryCode);

                return (
                  <article
                    key={track.id}
                    data-testid="track-card"
                    className={`group flex flex-col overflow-hidden rounded-2xl border transition-colors ${
                      isActive
                        ? 'border-blue-600 bg-blue-50/30 dark:border-blue-500 dark:bg-blue-950/30'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                      <button
                        type="button"
                        onClick={() => onPlayTrack(track)}
                        aria-label={`${t('listenHere')}: ${track.title} - ${track.artist}`}
                        className="block h-full w-full cursor-pointer text-left"
                      >
                        <img
                          src={track.thumbnailUrl}
                          alt={`${track.title} - ${track.artist}`}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
                        <span
                          className={`absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                            isActive ? 'bg-blue-600' : 'bg-black/80 group-hover:bg-blue-600'
                          }`}
                        >
                          {isActive ? (
                            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                          )}
                          <span>{isActive ? t('nowPlaying') : t('listenHere')}</span>
                        </span>
                      </button>

                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => onDeleteTrack(track)}
                          aria-label={`${t('deleteTrack')}: ${track.title}`}
                          className="absolute right-2.5 top-2.5 rounded-lg bg-black/75 p-2 text-white hover:bg-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                      <div className="space-y-1">
                        {(() => {
                          const titleGloss = getTitleGloss(track);
                          return (
                            <h3
                              data-testid="track-card-title"
                              className="font-display text-lg font-bold text-zinc-950 leading-snug line-clamp-2 dark:text-zinc-50"
                            >
                              {track.title.trim()}
                              {titleGloss && (
                                <span
                                  data-testid="track-card-title-gloss"
                                  className="font-normal text-zinc-500 dark:text-zinc-400"
                                >
                                  {' '}
                                  ({titleGloss})
                                </span>
                              )}
                            </h3>
                          );
                        })()}
                        <p className="text-sm font-medium text-zinc-600 line-clamp-1 dark:text-zinc-400">
                          {track.artist}
                        </p>
                      </div>

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
                        <div>
                          <dt className="text-zinc-400 dark:text-zinc-500">{t('countryLabel')}</dt>
                          <dd className="font-semibold text-zinc-900 truncate dark:text-zinc-100">
                            {flag && <span aria-hidden="true" className="mr-1">{flag}</span>}
                            {translateTerm(track.country)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-zinc-400 dark:text-zinc-500">{t('languageSungLabel')}</dt>
                          <dd className="font-semibold text-zinc-900 truncate dark:text-zinc-100">
                            {translateTerm(track.language)}
                          </dd>
                        </div>
                        <div className="col-span-2 pt-1 text-zinc-500 truncate dark:text-zinc-400">
                          {track.isRemix && (
                            <>
                              <span className="font-semibold text-blue-700 dark:text-blue-400">{t('remixBadge')}</span>
                              <span aria-hidden="true"> · </span>
                            </>
                          )}
                          <span>{translateTerm(track.genre)}</span>
                        </div>
                      </dl>

                      {track.curatorNote && (
                        <p
                          data-testid="track-card-note"
                          className="border-t border-zinc-100 pt-2.5 text-xs text-zinc-600 leading-relaxed line-clamp-2 dark:border-zinc-800 dark:text-zinc-300"
                        >
                          {translateTerm(track.curatorNote)}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
