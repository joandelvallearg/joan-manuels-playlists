import { useState, type FormEvent } from 'react';
import {
  Check,
  Globe2,
  Headphones,
  Heart,
  History,
  Languages,
  ListMusic,
  ListPlus,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import type { PlaylistGroup, PlaylistMode, Track, VisitorPlaylist } from '../types';
import { formatCodesDisplay, getCountryFlagEmoji, shouldShowVideoGallery } from '../utils/musicLogic';
import { LIKED_VIRTUAL_PLAYLIST_ID } from '../utils/visitorLibrary';

export const HISTORY_VIRTUAL_PLAYLIST_ID = '__history__';

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
  isTrackLiked: (trackId: string) => boolean;
  onToggleLike: (trackId: string) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  likedTracks: Track[];
  historyTracks: Track[];
  visitorPlaylists: VisitorPlaylist[];
  visitorPlaylistsResolved: Array<{ playlist: VisitorPlaylist; tracks: Track[] }>;
  onCreatePlaylist: (name: string) => void;
  onRenamePlaylist: (playlistId: string, name: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onPlayPersonalAudio: (playlistId: string, playlistName: string, tracks: Track[]) => void;
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
  isTrackLiked,
  onToggleLike,
  onOpenAddToPlaylist,
  likedTracks,
  historyTracks,
  visitorPlaylists,
  visitorPlaylistsResolved,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onRemoveTrackFromPlaylist,
  onPlayPersonalAudio,
}: PlaylistExplorerProps) {
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState('');

  const activeGroups = mode === 'country' ? countryGroups : mode === 'language' ? languageGroups : [];
  const showGallery = shouldShowVideoGallery({
    mode,
    selectedKey,
    genre: selectedGenre,
    query: searchQuery,
  });

  const selectedGroup =
    selectedKey && (mode === 'country' || mode === 'language')
      ? activeGroups.find((g) => g.key === selectedKey) ?? null
      : null;

  const selectedPersonalPlaylist =
    mode === 'my-playlists' && selectedKey
      ? selectedKey === LIKED_VIRTUAL_PLAYLIST_ID
        ? t('likedSongsPlaylistName')
        : selectedKey === HISTORY_VIRTUAL_PLAYLIST_ID
          ? t('recentHistoryTitle')
          : visitorPlaylists.find((p) => p.id === selectedKey)?.name ?? null
      : null;

  const selectedCustomPlaylistId =
    mode === 'my-playlists' &&
    selectedKey &&
    selectedKey !== LIKED_VIRTUAL_PLAYLIST_ID &&
    selectedKey !== HISTORY_VIRTUAL_PLAYLIST_ID
      ? selectedKey
      : null;

  const formatSongCount = (count: number) =>
    `${count} ${count === 1 ? t('songsCountSingle') : t('songsCountPlural')}`;

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = newPlaylistName.trim();
    if (!clean) return;
    onCreatePlaylist(clean);
    setNewPlaylistName('');
  };

  const handleRenameSubmit = (e: FormEvent, playlistId: string) => {
    e.preventDefault();
    const clean = editingPlaylistName.trim();
    if (!clean) return;
    onRenamePlaylist(playlistId, clean);
    setEditingPlaylistId(null);
    setEditingPlaylistName('');
  };

  return (
    <section id="playlists" className="scroll-mt-20 bg-white transition-colors dark:bg-zinc-950">
      <div id="playlists-language" className="scroll-mt-20 mx-auto max-w-6xl px-6 py-12 space-y-8">
        <div id="my-playlists" className="scroll-mt-24 flex flex-col gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-center lg:justify-between dark:border-zinc-800">
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
              data-testid="tab-my-playlists"
              aria-selected={mode === 'my-playlists'}
              onClick={() => onChangeMode('my-playlists')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'my-playlists'
                  ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Heart className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {t('modeMyPlaylists')}
                {likedTracks.length + visitorPlaylists.length > 0 && (
                  <span className="ml-1 font-mono tabular-nums opacity-75">
                    ({likedTracks.length > 0 ? `${likedTracks.length} ♥` : ''}{likedTracks.length > 0 && visitorPlaylists.length > 0 ? ' · ' : ''}{visitorPlaylists.length > 0 ? visitorPlaylists.length : ''})
                  </span>
                )}
              </span>
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

        {/* Visitor Personal Playlists Workspace */}
        {mode === 'my-playlists' && (
          <div data-testid="my-playlists-workspace" className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-[#F6F7F9] p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-xs sm:text-sm text-zinc-600 max-w-xl dark:text-zinc-300">
                {t('myPlaylistsNotice')}
              </p>

              <form onSubmit={handleCreateSubmit} className="flex w-full sm:w-auto sm:min-w-[20rem] items-center gap-2">
                <input
                  type="text"
                  data-testid="create-playlist-input"
                  aria-label={t('createPlaylistBtn')}
                  maxLength={60}
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder={t('createPlaylistPlaceholder')}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-950 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500"
                />
                <button
                  type="submit"
                  data-testid="create-playlist-submit"
                  disabled={!newPlaylistName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('createPlaylistBtn')}</span>
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Liked Songs Card */}
              <div
                data-testid="liked-songs-card"
                className={`flex flex-col justify-between gap-4 rounded-2xl border p-5 transition-colors ${
                  selectedKey === LIKED_VIRTUAL_PLAYLIST_ID
                    ? 'border-rose-500 bg-rose-50/40 dark:border-rose-500 dark:bg-rose-950/25'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-zinc-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    onSelectGroup(selectedKey === LIKED_VIRTUAL_PLAYLIST_ID ? null : LIKED_VIRTUAL_PLAYLIST_ID)
                  }
                  className="text-left space-y-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-xl font-bold text-zinc-950 flex items-center gap-2 dark:text-zinc-50">
                      <Heart className="h-4 w-4 fill-rose-600 text-rose-600 shrink-0 dark:fill-rose-500 dark:text-rose-500" aria-hidden="true" />
                      <span>{t('likedSongsPlaylistName')}</span>
                    </h3>
                    <span data-testid="liked-songs-count" className="font-mono text-xs font-medium text-zinc-500 tabular-nums shrink-0 dark:text-zinc-400">
                      {formatSongCount(likedTracks.length)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 line-clamp-2 dark:text-zinc-400">
                    {likedTracks.length > 0
                      ? likedTracks.slice(0, 2).map((tr) => tr.title).join(' · ')
                      : t('emptyLikedSongs')}
                  </p>
                </button>

                <div className="flex items-center justify-between gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
                  <button
                    type="button"
                    data-testid="play-liked-audio-btn"
                    disabled={likedTracks.length === 0}
                    onClick={() =>
                      onPlayPersonalAudio(LIKED_VIRTUAL_PLAYLIST_ID, t('likedSongsPlaylistName'), likedTracks)
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('playAudioCollection')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={likedTracks.length === 0}
                    onClick={() =>
                      onPlayPlaylist({
                        key: LIKED_VIRTUAL_PLAYLIST_ID,
                        label: t('likedSongsPlaylistName'),
                        code: '',
                        tracks: likedTracks,
                        genres: [],
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-blue-500 dark:hover:text-white"
                  >
                    <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                    <span>{t('playPlaylist')}</span>
                  </button>
                </div>
              </div>

              {/* Visitor Custom Playlists */}
              {visitorPlaylistsResolved.map(({ playlist, tracks }) => {
                const isSelected = selectedKey === playlist.id;
                const isEditing = editingPlaylistId === playlist.id;
                return (
                  <div
                    key={playlist.id}
                    data-testid={`visitor-playlist-card-${playlist.id}`}
                    className={`flex flex-col justify-between gap-4 rounded-2xl border p-5 transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-2">
                      {isEditing ? (
                        <form onSubmit={(e) => handleRenameSubmit(e, playlist.id)} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            maxLength={60}
                            autoFocus
                            value={editingPlaylistName}
                            onChange={(e) => setEditingPlaylistName(e.target.value)}
                            aria-label={t('renamePlaylist')}
                            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-sm font-semibold text-zinc-950 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                          <button
                            type="submit"
                            aria-label={t('saveLabel')}
                            className="rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-700 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('cancelLabel')}
                            onClick={() => setEditingPlaylistId(null)}
                            className="rounded-lg border border-zinc-300 p-1.5 text-zinc-600 hover:bg-zinc-100 cursor-pointer dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectGroup(isSelected ? null : playlist.id)}
                            className="text-left min-w-0 flex-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
                          >
                            <h3 className="font-display text-xl font-bold text-zinc-950 truncate dark:text-zinc-50">
                              {playlist.name}
                            </h3>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              aria-label={`${t('renamePlaylist')}: ${playlist.name}`}
                              onClick={() => {
                                setEditingPlaylistId(playlist.id);
                                setEditingPlaylistName(playlist.name);
                              }}
                              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              data-testid={`delete-playlist-${playlist.id}`}
                              aria-label={`${t('deletePlaylist')}: ${playlist.name}`}
                              onClick={() => onDeletePlaylist(playlist.id)}
                              className="rounded-lg p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 cursor-pointer dark:text-zinc-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectGroup(isSelected ? null : playlist.id)}
                        className="w-full text-left space-y-1 cursor-pointer rounded"
                      >
                        <p className="font-mono text-xs font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
                          {formatSongCount(tracks.length)}
                        </p>
                        <p className="text-xs text-zinc-600 line-clamp-1 dark:text-zinc-400">
                          {tracks.length > 0
                            ? tracks.slice(0, 2).map((tr) => tr.title).join(' · ')
                            : '—'}
                        </p>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
                      <button
                        type="button"
                        data-testid={`play-playlist-audio-${playlist.id}`}
                        disabled={tracks.length === 0}
                        onClick={() => onPlayPersonalAudio(playlist.id, playlist.name, tracks)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t('playAudioCollection')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={tracks.length === 0}
                        onClick={() =>
                          onPlayPlaylist({
                            key: playlist.id,
                            label: playlist.name,
                            code: '',
                            tracks,
                            genres: [],
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-blue-500 dark:hover:text-white"
                      >
                        <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                        <span>{t('playPlaylist')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Recent Browser Listening History Card */}
              {historyTracks.length > 0 && (
                <div
                  data-testid="recent-history-card"
                  className={`flex flex-col justify-between gap-4 rounded-2xl border p-5 transition-colors ${
                    selectedKey === HISTORY_VIRTUAL_PLAYLIST_ID
                      ? 'border-blue-600 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onSelectGroup(selectedKey === HISTORY_VIRTUAL_PLAYLIST_ID ? null : HISTORY_VIRTUAL_PLAYLIST_ID)
                    }
                    className="text-left space-y-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-display text-xl font-bold text-zinc-950 flex items-center gap-2 dark:text-zinc-50">
                        <History className="h-4 w-4 text-zinc-500 shrink-0 dark:text-zinc-400" aria-hidden="true" />
                        <span>{t('recentHistoryTitle')}</span>
                      </h3>
                      <span className="font-mono text-xs font-medium text-zinc-500 tabular-nums shrink-0 dark:text-zinc-400">
                        {formatSongCount(historyTracks.length)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 line-clamp-2 dark:text-zinc-400">
                      {historyTracks.slice(0, 2).map((tr) => tr.title).join(' · ')}
                    </p>
                  </button>

                  <div className="flex items-center justify-between gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() =>
                        onPlayPersonalAudio(HISTORY_VIRTUAL_PLAYLIST_ID, t('recentHistoryTitle'), historyTracks)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-100 whitespace-nowrap cursor-pointer dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t('playAudioCollection')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onPlayPlaylist({
                          key: HISTORY_VIRTUAL_PLAYLIST_ID,
                          label: t('recentHistoryTitle'),
                          code: '',
                          tracks: historyTracks,
                          genres: [],
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 whitespace-nowrap cursor-pointer dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-blue-500 dark:hover:text-white"
                    >
                      <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                      <span>{t('playPlaylist')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {visitorPlaylists.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t('emptyCustomPlaylists')}
              </p>
            )}
          </div>
        )}

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

        {/* Thumbnail Galleries Grid (only shown when a country/filter/all/my-playlist view is selected) */}
        <div id="gallery" className="scroll-mt-20 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
            <h2 className="font-display text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              {t('galleryHeading')}
              {selectedGroup
                ? ` · ${translateTerm(selectedGroup.label)}`
                : selectedPersonalPlaylist
                  ? ` · ${selectedPersonalPlaylist}`
                  : ''}
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
                  {mode === 'my-playlists' ? t('modeMyPlaylists') : t('clearSelection')}
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
                {mode === 'my-playlists' ? t('selectMyPlaylistForGallery') : t('selectPlaylistForGallery')}
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

                      {/* Visitor Like & Add-to-Playlist Footer */}
                      {(() => {
                        const liked = isTrackLiked(track.id);
                        return (
                          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                data-testid="track-like-btn"
                                aria-pressed={liked}
                                aria-label={`${liked ? t('unlikeTrack') : t('likeTrack')}: ${track.title}`}
                                onClick={() => onToggleLike(track.id)}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                  liked
                                    ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-800/80 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-900/60'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:text-white'
                                }`}
                              >
                                <Heart
                                  className={`h-3.5 w-3.5 ${
                                    liked ? 'fill-rose-600 text-rose-600 dark:fill-rose-500 dark:text-rose-500' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                                <span>{t('likeTrack')}</span>
                              </button>

                              <button
                                type="button"
                                data-testid="track-playlist-btn"
                                aria-label={`${t('addToPlaylist')}: ${track.title}`}
                                onClick={() => onOpenAddToPlaylist(track)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:text-zinc-950 whitespace-nowrap cursor-pointer dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:text-white"
                              >
                                <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>+ Playlist</span>
                              </button>
                            </div>

                            {selectedCustomPlaylistId && (
                              <button
                                type="button"
                                data-testid="track-remove-from-playlist-btn"
                                aria-label={`${t('removeFromPlaylist')}: ${track.title}`}
                                onClick={() => onRemoveTrackFromPlaylist(selectedCustomPlaylistId, track.id)}
                                className="text-[11px] font-medium text-zinc-500 hover:text-red-600 cursor-pointer dark:text-zinc-400 dark:hover:text-red-400"
                              >
                                {t('removeFromPlaylist')}
                              </button>
                            )}
                          </div>
                        );
                      })()}
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
