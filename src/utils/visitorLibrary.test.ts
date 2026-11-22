import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VISITOR_LIBRARY_STORAGE_KEY,
  createEmptyVisitorLibrary,
  createVisitorPlaylist,
  deleteVisitorPlaylist,
  getPlaylistsContainingTrack,
  loadVisitorLibrary,
  parseVisitorLibraryJson,
  recordListeningHistory,
  renameVisitorPlaylist,
  resolveLibraryTracks,
  saveVisitorLibrary,
  toggleLikedTrack,
  toggleTrackInPlaylist,
  type StorageLike,
} from './visitorLibrary';
import type { Track } from '../types';

function makeTrack(id: string, title: string): Track {
  return {
    id,
    ownerId: 'owner1',
    youtubeId: `yt_${id.padEnd(8, '0')}`,
    youtubeUrl: `https://www.youtube.com/watch?v=yt_${id.padEnd(8, '0')}`,
    title,
    artist: `Artist ${id}`,
    country: 'Argentina',
    countryCode: 'AR',
    language: 'Español',
    languageCode: 'es',
    genre: 'Rock',
    thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
    createdAtMs: 1000,
  };
}

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

test('toggleLikedTrack adds and removes liked track IDs cleanly without duplicates', () => {
  let state = createEmptyVisitorLibrary();
  state = toggleLikedTrack(state, 't1');
  assert.deepEqual(state.likedTrackIds, ['t1']);

  state = toggleLikedTrack(state, 't2');
  assert.deepEqual(state.likedTrackIds, ['t2', 't1']);

  state = toggleLikedTrack(state, 't1');
  assert.deepEqual(state.likedTrackIds, ['t2']);
});

test('createVisitorPlaylist, toggleTrackInPlaylist, renameVisitorPlaylist, and deleteVisitorPlaylist work deterministically', () => {
  let state = createEmptyVisitorLibrary();

  // Empty name is ignored
  const emptyAttempt = createVisitorPlaylist(state, '   ', 't1', 1000);
  assert.equal(emptyAttempt.createdPlaylist, null);
  assert.equal(emptyAttempt.state.playlists.length, 0);

  // Create with initial track
  const created1 = createVisitorPlaylist(state, 'Para viajar', 't1', 1000);
  state = created1.state;
  assert.ok(created1.createdPlaylist);
  assert.equal(created1.createdPlaylist.name, 'Para viajar');
  assert.deepEqual(created1.createdPlaylist.trackIds, ['t1']);

  // Creating case-insensitive duplicate name reuses existing playlist and adds track
  const reused = createVisitorPlaylist(state, '  para viajar ', 't2', 2000);
  state = reused.state;
  assert.equal(state.playlists.length, 1);
  assert.deepEqual(state.playlists[0].trackIds, ['t1', 't2']);

  // Toggle track out and back in
  const plId = state.playlists[0].id;
  state = toggleTrackInPlaylist(state, plId, 't1', 3000);
  assert.deepEqual(state.playlists[0].trackIds, ['t2']);
  state = toggleTrackInPlaylist(state, plId, 't3', 4000);
  assert.deepEqual(state.playlists[0].trackIds, ['t2', 't3']);

  assert.equal(getPlaylistsContainingTrack(state, 't3').length, 1);
  assert.equal(getPlaylistsContainingTrack(state, 't1').length, 0);

  // Rename and delete
  state = renameVisitorPlaylist(state, plId, 'Ruta Nocturna', 5000);
  assert.equal(state.playlists[0].name, 'Ruta Nocturna');
  state = deleteVisitorPlaylist(state, plId);
  assert.equal(state.playlists.length, 0);
});

test('recordListeningHistory keeps most recent tracks first, unique, and bounded', () => {
  let state = createEmptyVisitorLibrary();
  state = recordListeningHistory(state, 't1', 3);
  state = recordListeningHistory(state, 't2', 3);
  state = recordListeningHistory(state, 't3', 3);
  state = recordListeningHistory(state, 't1', 3);
  assert.deepEqual(state.historyTrackIds, ['t1', 't3', 't2']);

  state = recordListeningHistory(state, 't4', 3);
  assert.deepEqual(state.historyTrackIds, ['t4', 't1', 't3']);
});

test('saveVisitorLibrary and loadVisitorLibrary round-trip cleanly and tolerate corrupted JSON', () => {
  const storage = createMemoryStorage();
  let state = createEmptyVisitorLibrary();
  state = toggleLikedTrack(state, 't1');
  state = createVisitorPlaylist(state, 'Favoritas', 't2', 1000).state;
  state = recordListeningHistory(state, 't1');

  saveVisitorLibrary(state, storage);
  const reloaded = loadVisitorLibrary(storage);
  assert.deepEqual(reloaded, state);

  storage.setItem(VISITOR_LIBRARY_STORAGE_KEY, '{broken json');
  assert.deepEqual(loadVisitorLibrary(storage), createEmptyVisitorLibrary());

  const sanitized = parseVisitorLibraryJson(
    JSON.stringify({
      likedTrackIds: ['t1', 't1', '', 42],
      playlists: [{ id: 'p1', name: 'Mix', trackIds: ['t2', 't2'] }, { id: '', name: 'Bad' }],
      historyTrackIds: ['t3'],
    })
  );
  assert.deepEqual(sanitized.likedTrackIds, ['t1']);
  assert.equal(sanitized.playlists.length, 1);
  assert.deepEqual(sanitized.playlists[0].trackIds, ['t2']);
});

test('resolveLibraryTracks maps valid track IDs in saved order and ignores deleted tracks', () => {
  const catalog = [makeTrack('t1', 'Uno'), makeTrack('t2', 'Dos'), makeTrack('t3', 'Tres')];
  const resolved = resolveLibraryTracks(['t3', 'missing-id', 't1'], catalog);
  assert.deepEqual(
    resolved.map((tr) => tr.id),
    ['t3', 't1']
  );
});
