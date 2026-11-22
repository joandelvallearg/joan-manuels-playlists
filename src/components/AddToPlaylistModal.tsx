import { useEffect, useState, type FormEvent } from 'react';
import { Check, Heart, ListPlus, Plus, X } from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import type { Track, VisitorLibraryState } from '../types';
import { formatTrackTitlePlain } from '../utils/titleLocalization';

interface AddToPlaylistModalProps {
  track: Track | null;
  onClose: () => void;
  t: (key: UiStringKey) => string;
  library: VisitorLibraryState;
  onToggleLike: (trackId: string) => void;
  onToggleTrackInPlaylist: (playlistId: string, trackId: string) => void;
  onCreatePlaylistWithTrack: (name: string, trackId: string) => void;
  getTitleGloss: (track: Track) => string | null;
}

export function AddToPlaylistModal({
  track,
  onClose,
  t,
  library,
  onToggleLike,
  onToggleTrackInPlaylist,
  onCreatePlaylistWithTrack,
  getTitleGloss,
}: AddToPlaylistModalProps) {
  const [newPlaylistName, setNewPlaylistName] = useState('');

  useEffect(() => {
    if (!track) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [track, onClose]);

  if (!track) return null;

  const isLiked = library.likedTrackIds.includes(track.id);
  const displayTitle = formatTrackTitlePlain(track.title, getTitleGloss(track));

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    onCreatePlaylistWithTrack(trimmed, track.id);
    setNewPlaylistName('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-to-playlist-title"
      data-testid="add-to-playlist-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh] dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 space-y-0.5">
            <h2
              id="add-to-playlist-title"
              className="font-display text-base font-bold text-zinc-950 dark:text-zinc-50"
            >
              {t('saveToPlaylistsTitle')}
            </h2>
            <p className="text-xs text-zinc-600 truncate dark:text-zinc-400">
              {displayTitle} — {track.artist}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 cursor-pointer shrink-0 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Quick Liked Songs toggle */}
          <button
            type="button"
            data-testid="modal-toggle-like-btn"
            aria-pressed={isLiked}
            onClick={() => onToggleLike(track.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors cursor-pointer ${
              isLiked
                ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-100'
                : 'border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-700'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Heart
                className={`h-4 w-4 shrink-0 ${
                  isLiked ? 'fill-rose-600 text-rose-600 dark:fill-rose-500 dark:text-rose-500' : 'text-zinc-500 dark:text-zinc-400'
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{t('likedSongsPlaylistName')}</span>
            </span>
            <span className="font-mono text-xs tabular-nums opacity-80">
              {library.likedTrackIds.length}
            </span>
          </button>

          {/* Existing custom playlists checklist */}
          {library.playlists.length > 0 && (
            <div className="space-y-2">
              {library.playlists.map((playlist) => {
                const checked = playlist.trackIds.includes(track.id);
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    data-testid={`modal-playlist-toggle-${playlist.id}`}
                    aria-pressed={checked}
                    onClick={() => onToggleTrackInPlaylist(playlist.id, track.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors cursor-pointer ${
                      checked
                        ? 'border-blue-600 bg-blue-50/60 text-zinc-950 dark:border-blue-500 dark:bg-blue-950/35 dark:text-zinc-50'
                        : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                            : 'border-zinc-400 bg-white dark:border-zinc-600 dark:bg-zinc-900'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      <span className="truncate font-medium">{playlist.name}</span>
                    </span>
                    <span className="font-mono text-xs text-zinc-500 tabular-nums shrink-0 dark:text-zinc-400">
                      {playlist.trackIds.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Create new playlist inline */}
          <form onSubmit={handleCreate} className="space-y-2.5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <label
              htmlFor="modal-new-playlist-name"
              className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('createPlaylistBtn')}</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="modal-new-playlist-name"
                data-testid="modal-new-playlist-input"
                type="text"
                maxLength={60}
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder={t('createPlaylistPlaceholder')}
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500"
              />
              <button
                type="submit"
                data-testid="modal-create-playlist-submit"
                disabled={!newPlaylistName.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('createAndAddBtn')}</span>
              </button>
            </div>
          </form>

          <p className="text-[11px] text-zinc-500 leading-relaxed dark:text-zinc-400">
            {t('myPlaylistsNotice')}
          </p>
        </div>
      </div>
    </div>
  );
}
