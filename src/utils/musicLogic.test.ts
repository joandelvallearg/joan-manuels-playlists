import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackPsychologicalProfile,
  extractYouTubeId,
  filterTracks,
  formatProfileDate,
  getCountryFlagEmoji,
  getYouTubeEmbedUrl,
  groupTracksByCountry,
  groupTracksByLanguage,
  isPrivateDevUrl,
  normalizeLanguageCode,
  resolveCountryCode,
  resolveLanguageCode,
  resolvePublicShareUrl,
  translateCountryByCode,
  translateLanguageByCode,
} from './musicLogic';
import {
  getLocalizedProfileContent,
  mapToPublicTranslateLang,
  parseGoogleTranslateResponse,
} from './profileTranslation';
import type { PsychologicalProfile, Track } from '../types';

const SAMPLE_TRACKS: Track[] = [
  {
    id: 't1',
    ownerId: 'owner1',
    youtubeId: 'dQw4w9WgXcQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'De Música Ligera',
    artist: 'Soda Stereo',
    country: 'Argentina',
    countryCode: 'AR',
    language: 'Español',
    languageCode: 'es',
    genre: 'Rock Nacional',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  },
  {
    id: 't2',
    ownerId: 'owner1',
    youtubeId: '9bZkp7q19f0',
    youtubeUrl: 'https://youtu.be/9bZkp7q19f0',
    title: 'Plastic Love',
    artist: 'Mariya Takeuchi',
    country: 'Japan',
    countryCode: 'JP',
    language: 'Japanese',
    languageCode: 'ja',
    genre: 'City Pop',
    thumbnailUrl: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg',
  },
  {
    id: 't3',
    ownerId: 'owner1',
    youtubeId: 'kXYiU_JCYtU',
    youtubeUrl: 'https://www.youtube.com/watch?v=kXYiU_JCYtU',
    title: 'Crimen',
    artist: 'Gustavo Cerati',
    country: 'Argentina',
    countryCode: 'AR',
    language: 'Español',
    languageCode: 'es',
    genre: 'Rock Alternativo',
    thumbnailUrl: 'https://i.ytimg.com/vi/kXYiU_JCYtU/hqdefault.jpg',
  },
];

test('extractYouTubeId parses watch, youtu.be, shorts, music, and embed URLs', () => {
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://youtu.be/9bZkp7q19f0?si=xyz'), '9bZkp7q19f0');
  assert.equal(extractYouTubeId('https://music.youtube.com/watch?v=kXYiU_JCYtU&list=RD'), 'kXYiU_JCYtU');
  assert.equal(extractYouTubeId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(extractYouTubeId('https://www.youtube.com/embed/abcdefghijk'), 'abcdefghijk');
  assert.equal(extractYouTubeId('abcdefghijk'), 'abcdefghijk');
  assert.equal(extractYouTubeId('https://vimeo.com/123456'), null);
  assert.equal(extractYouTubeId('not a url'), null);
});

test('getYouTubeEmbedUrl produces privacy-enhanced embed URL', () => {
  assert.equal(
    getYouTubeEmbedUrl('dQw4w9WgXcQ', true),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1'
  );
  assert.equal(
    getYouTubeEmbedUrl('dQw4w9WgXcQ', false),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&rel=0&modestbranding=1'
  );
});

test('groupTracksByCountry aggregates tracks and unique genres per country', () => {
  const groups = groupTracksByCountry(SAMPLE_TRACKS);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, 'AR');
  assert.equal(groups[0].tracks.length, 2);
  assert.deepEqual(groups[0].genres, ['Rock Nacional', 'Rock Alternativo']);
  assert.equal(groups[1].key, 'JP');
  assert.equal(groups[1].tracks.length, 1);
});

test('groupTracksByLanguage aggregates tracks by singing language', () => {
  const groups = groupTracksByLanguage(SAMPLE_TRACKS);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, 'es');
  assert.equal(groups[0].tracks.length, 2);
  assert.equal(groups[1].key, 'ja');
  assert.equal(groups[1].tracks.length, 1);
});

test('filterTracks filters by mode, selected playlist key, genre, and query', () => {
  const arTracks = filterTracks(SAMPLE_TRACKS, {
    mode: 'country',
    selectedKey: 'AR',
    genre: null,
    query: '',
  });
  assert.equal(arTracks.length, 2);

  const rockNacional = filterTracks(SAMPLE_TRACKS, {
    mode: 'country',
    selectedKey: 'AR',
    genre: 'Rock Nacional',
    query: '',
  });
  assert.equal(rockNacional.length, 1);
  assert.equal(rockNacional[0].id, 't1');

  const queryMatch = filterTracks(SAMPLE_TRACKS, {
    mode: 'all',
    selectedKey: null,
    genre: null,
    query: 'Takeuchi',
  });
  assert.equal(queryMatch.length, 1);
  assert.equal(queryMatch[0].id, 't2');
});

test('getCountryFlagEmoji converts ISO alpha-2 codes and ignores invalid codes', () => {
  assert.equal(getCountryFlagEmoji('AR'), '🇦🇷');
  assert.equal(getCountryFlagEmoji('jp'), '🇯🇵');
  assert.equal(getCountryFlagEmoji('INVALID'), '');
});

test('normalizeLanguageCode normalizes regional locale strings cleanly', () => {
  assert.equal(normalizeLanguageCode('es-AR'), 'es');
  assert.equal(normalizeLanguageCode('en-US'), 'en');
  assert.equal(normalizeLanguageCode('ja-JP'), 'ja');
  assert.equal(normalizeLanguageCode('zh-TW'), 'zh-TW');
  assert.equal(normalizeLanguageCode('zh-CN'), 'zh');
  assert.equal(normalizeLanguageCode(''), 'es');
});

test('translateCountryByCode and translateLanguageByCode localize codes via Intl.DisplayNames', () => {
  assert.equal(translateCountryByCode('RU', 'en'), 'Russia');
  assert.equal(translateCountryByCode('FR', 'es'), 'Francia');
  assert.equal(translateLanguageByCode('ru', 'en'), 'Russian');
  assert.equal(translateLanguageByCode('fr', 'es'), 'Francés');
  assert.equal(translateLanguageByCode('zxx', 'en'), null);
});

test('resolveCountryCode and resolveLanguageCode map common names to ISO codes', () => {
  assert.equal(resolveCountryCode('Rusia'), 'RU');
  assert.equal(resolveCountryCode('Francia'), 'FR');
  assert.equal(resolveLanguageCode('Ruso'), 'ru');
  assert.equal(resolveLanguageCode('Francés'), 'fr');
});

test('resolvePublicShareUrl defaults to published Vercel URL and supports custom override', () => {
  assert.equal(
    resolvePublicShareUrl('https://ais-dev-abc123.us-west2.run.app/'),
    'https://joan-manuels-playlists.vercel.app/'
  );
  assert.equal(
    resolvePublicShareUrl('http://localhost:3000/', 'https://joan-manuels-playlists.vercel.app/'),
    'https://joan-manuels-playlists.vercel.app/'
  );
  assert.equal(
    resolvePublicShareUrl('https://ais-dev-abc123.us-west2.run.app/', '', 'https://musica.joandelvalle.com'),
    'https://musica.joandelvalle.com/'
  );
  assert.equal(isPrivateDevUrl('https://ais-dev-abc123.us-west2.run.app/'), true);
  assert.equal(isPrivateDevUrl('https://joan-manuels-playlists.vercel.app/'), false);
});

test('buildFallbackPsychologicalProfile summarizes track countries, languages, and genres', () => {
  const draft = buildFallbackPsychologicalProfile(SAMPLE_TRACKS);
  assert.equal(draft.trackCount, 3);
  assert.ok(draft.personalitySummary.includes('Argentina'));
  assert.ok(draft.musicalTasteSummary.includes('Soda Stereo'));
  assert.ok(draft.keyTraits.length >= 3 && draft.keyTraits.length <= 5);
  assert.ok(formatProfileDate(Date.UTC(2026, 10, 15, 12, 0), 'es').includes('2026'));
});

test('multi-country and bilingual remixes render two flags, dual translations, and remix filtering', () => {
  assert.equal(getCountryFlagEmoji('ES,US'), '🇪🇸 🇺🇸');
  assert.equal(getCountryFlagEmoji('CO,FR'), '🇨🇴 🇫🇷');
  assert.equal(resolveCountryCode('España / Estados Unidos'), 'ES,US');
  assert.equal(resolveLanguageCode('Español / Inglés'), 'es,en');
  assert.equal(translateCountryByCode('ES,US', 'en'), 'Spain / United States');
  assert.equal(translateLanguageByCode('es,fr', 'en'), 'Spanish / French');

  const remixTrack: Track = {
    id: 'remix-1',
    ownerId: 'owner1',
    youtubeId: 'abc12345678',
    youtubeUrl: 'https://www.youtube.com/watch?v=abc12345678',
    title: 'Despacito (Remix)',
    artist: 'Luis Fonsi & Justin Bieber',
    country: 'Puerto Rico / Canadá',
    countryCode: 'PR,CA',
    language: 'Español / Inglés',
    languageCode: 'es,en',
    genre: 'Pop Urbano',
    isRemix: true,
    thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
  };

  const countryGroups = groupTracksByCountry([...SAMPLE_TRACKS, remixTrack]);
  assert.ok(countryGroups.some((g) => g.code === 'PR,CA' && g.label === 'Puerto Rico / Canadá'));

  const remixMatches = filterTracks([...SAMPLE_TRACKS, remixTrack], {
    mode: 'all',
    selectedKey: null,
    genre: null,
    query: 'remix',
  });
  assert.equal(remixMatches.length, 1);
  assert.equal(remixMatches[0].id, 'remix-1');
});

test('getLocalizedProfileContent prioritizes pre-translated profile and falls back cleanly', () => {
  const profile: PsychologicalProfile = {
    ownerId: 'owner1',
    personalitySummary: 'Joan Manuel es sensible y curioso.',
    musicalTasteSummary: 'Le gusta la música de varios países.',
    keyTraits: ['Curiosidad cultural'],
    trackCount: 14,
    translations: {
      en: {
        personalitySummary: 'Joan Manuel is sensitive and curious.',
        musicalTasteSummary: 'He enjoys music from several countries.',
        keyTraits: ['Cultural curiosity'],
      },
    },
  };

  const identity = (t: string) => t;
  const mockTranslate = (t: string) => `[pt] ${t}`;

  assert.equal(getLocalizedProfileContent(profile, 'es', mockTranslate).personalitySummary, 'Joan Manuel es sensible y curioso.');
  assert.equal(getLocalizedProfileContent(profile, 'en', identity).personalitySummary, 'Joan Manuel is sensitive and curious.');
  assert.deepEqual(getLocalizedProfileContent(profile, 'en', identity).keyTraits, ['Cultural curiosity']);
  assert.equal(getLocalizedProfileContent(profile, 'pt', mockTranslate).personalitySummary, '[pt] Joan Manuel es sensible y curioso.');
  assert.equal(mapToPublicTranslateLang('zh'), 'zh-CN');
  assert.equal(mapToPublicTranslateLang('pt-BR'), 'pt');
  assert.equal(
    parseGoogleTranslateResponse([[['Hello ', 'Hola '], ['world', 'mundo']]]),
    'Hello world'
  );
});
