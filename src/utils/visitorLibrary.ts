import type { Track, VisitorLibraryState, VisitorPlaylist } from '../types';

export const VISITOR_LIBRARY_STORAGE_KEY = 'jm_visitor_library_v1';
export const LIKED_VIRTUAL_PLAYLIST_ID = '__liked__';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function createEmptyVisitorLibrary(): VisitorLibraryState {
  return {
    likedTrackIds: [],
    playlists: [],
    historyTrackIds: [],
  };
}

function sanitizeStringArray(value: unknown, maxItems = 500): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    clean.push(trimmed);
    if (clean.length >= maxItems) break;
  }
  return clean;
}

export function parseVisitorLibraryJson(raw: string | null | undefined): VisitorLibraryState {
  if (!raw || !raw.trim()) return createEmptyVisitorLibrary();
  try {
    const parsed = JSON.parse(raw) as Partial<VisitorLibraryState> | null;
    if (!parsed || typeof parsed !== 'object') return createEmptyVisitorLibrary();

    const likedTrackIds = sanitizeStringArray(parsed.likedTrackIds, 1000);
    const historyTrackIds = sanitizeStringArray(parsed.historyTrackIds, 50);

    const playlists: VisitorPlaylist[] = [];
    const seenIds = new Set<string>();
    if (Array.isArray(parsed.playlists)) {
      for (const item of parsed.playlists) {
        if (!item || typeof item !== 'object') continue;
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        const name = typeof item.name === 'string' ? item.name.trim().slice(0, 60) : '';
        if (!id || !name || seenIds.has(id)) continue;
        seenIds.add(id);
        playlists.push({
          id,
          name,
          trackIds: sanitizeStringArray(item.trackIds, 1000),
          createdAtMs:
            typeof item.createdAtMs === 'number' && Number.isFinite(item.createdAtMs)
              ? item.createdAtMs
              : Date.now(),
          updatedAtMs:
            typeof item.updatedAtMs === 'number' && Number.isFinite(item.updatedAtMs)
              ? item.updatedAtMs
              : Date.now(),
        });
      }
    }

    return {
      likedTrackIds,
      playlists,
      historyTrackIds,
    };
  } catch {
    return createEmptyVisitorLibrary();
  }
}

export function loadVisitorLibrary(storage?: StorageLike | null): VisitorLibraryState {
  const target =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return createEmptyVisitorLibrary();
  try {
    return parseVisitorLibraryJson(target.getItem(VISITOR_LIBRARY_STORAGE_KEY));
  } catch {
    return createEmptyVisitorLibrary();
  }
}

export function saveVisitorLibrary(
  state: VisitorLibraryState,
  storage?: StorageLike | null
): void {
  const target =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(VISITOR_LIBRARY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private-browsing write errors
  }
}

export function toggleLikedTrack(
  state: VisitorLibraryState,
  trackId: string
): VisitorLibraryState {
  const cleanId = trackId.trim();
  if (!cleanId) return state;

  const exists = state.likedTrackIds.includes(cleanId);
  const likedTrackIds = exists
    ? state.likedTrackIds.filter((id) => id !== cleanId)
    : [cleanId, ...state.likedTrackIds];

  return {
    ...state,
    likedTrackIds,
  };
}

export function createVisitorPlaylist(
  state: VisitorLibraryState,
  rawName: string,
  initialTrackId?: string,
  nowMs = Date.now()
): { state: VisitorLibraryState; createdPlaylist: VisitorPlaylist | null } {
  const cleanName = rawName.trim().slice(0, 60);
  if (!cleanName) {
    return { state, createdPlaylist: null };
  }

  // If a playlist with the exact same case-insensitive name already exists, reuse it and add track if given
  const existing = state.playlists.find(
    (pl) => pl.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (existing) {
    if (initialTrackId && !existing.trackIds.includes(initialTrackId)) {
      const updated: VisitorPlaylist = {
        ...existing,
        trackIds: [...existing.trackIds, initialTrackId],
        updatedAtMs: nowMs,
      };
      return {
        state: {
          ...state,
          playlists: state.playlists.map((pl) => (pl.id === existing.id ? updated : pl)),
        },
        createdPlaylist: updated,
      };
    }
    return { state, createdPlaylist: existing };
  }

  const slugBase = cleanName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);

  let id = `pl-${slugBase || 'list'}-${nowMs.toString(36)}`;
  let suffix = 1;
  while (state.playlists.some((pl) => pl.id === id)) {
    id = `pl-${slugBase || 'list'}-${nowMs.toString(36)}-${suffix}`;
    suffix += 1;
  }

  const cleanInitialId = initialTrackId?.trim();
  const createdPlaylist: VisitorPlaylist = {
    id,
    name: cleanName,
    trackIds: cleanInitialId ? [cleanInitialId] : [],
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };

  return {
    state: {
      ...state,
      playlists: [createdPlaylist, ...state.playlists],
    },
    createdPlaylist,
  };
}

export function renameVisitorPlaylist(
  state: VisitorLibraryState,
  playlistId: string,
  rawName: string,
  nowMs = Date.now()
): VisitorLibraryState {
  const cleanName = rawName.trim().slice(0, 60);
  if (!cleanName) return state;
  return {
    ...state,
    playlists: state.playlists.map((pl) =>
      pl.id === playlistId ? { ...pl, name: cleanName, updatedAtMs: nowMs } : pl
    ),
  };
}

export function deleteVisitorPlaylist(
  state: VisitorLibraryState,
  playlistId: string
): VisitorLibraryState {
  return {
    ...state,
    playlists: state.playlists.filter((pl) => pl.id !== playlistId),
  };
}

export function toggleTrackInPlaylist(
  state: VisitorLibraryState,
  playlistId: string,
  trackId: string,
  nowMs = Date.now()
): VisitorLibraryState {
  const cleanTrackId = trackId.trim();
  if (!cleanTrackId) return state;

  return {
    ...state,
    playlists: state.playlists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      const exists = pl.trackIds.includes(cleanTrackId);
      return {
        ...pl,
        trackIds: exists
          ? pl.trackIds.filter((id) => id !== cleanTrackId)
          : [...pl.trackIds, cleanTrackId],
        updatedAtMs: nowMs,
      };
    }),
  };
}

export function recordListeningHistory(
  state: VisitorLibraryState,
  trackId: string,
  maxItems = 25
): VisitorLibraryState {
  const cleanId = trackId.trim();
  if (!cleanId) return state;
  if (state.historyTrackIds[0] === cleanId) return state;

  const nextHistory = [
    cleanId,
    ...state.historyTrackIds.filter((id) => id !== cleanId),
  ].slice(0, maxItems);

  return {
    ...state,
    historyTrackIds: nextHistory,
  };
}

export function resolveLibraryTracks(trackIds: string[], allTracks: Track[]): Track[] {
  if (trackIds.length === 0 || allTracks.length === 0) return [];
  const byId = new Map(allTracks.map((tr) => [tr.id, tr]));
  const resolved: Track[] = [];
  for (const id of trackIds) {
    const found = byId.get(id);
    if (found) resolved.push(found);
  }
  return resolved;
}

export function getPlaylistsContainingTrack(
  state: VisitorLibraryState,
  trackId: string
): VisitorPlaylist[] {
  return state.playlists.filter((pl) => pl.trackIds.includes(trackId));
}
