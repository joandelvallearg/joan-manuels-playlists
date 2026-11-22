import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildAudioQueue,
  buildFallbackPsychologicalProfile,
  computeGenreSimilarityScore,
  extractComparableTitleKeys,
  extractYouTubeId,
  filterTracks,
  findCatalogDuplicateGroups,
  findDuplicateTrackMatches,
  formatAudioTime,
  formatProfileDate,
  getAdjacentAudioTrack,
  getCountryFlagEmoji,
  getYouTubeEmbedUrl,
  groupTracksByCountry,
  groupTracksByLanguage,
  isPrivateDevUrl,
  normalizeArtistTokens,
  normalizeLanguageCode,
  normalizeSongTitleForComparison,
  resolveCountryCode,
  resolveInitialTheme,
  resolveLanguageCode,
  resolvePublicShareUrl,
  shouldShowVideoGallery,
  toggleThemeMode,
  translateCountryByCode,
  translateLanguageByCode,
} from './musicLogic';
import {
  getLocalizedProfileContent,
  mapToPublicTranslateLang,
  parseGoogleTranslateResponse,
  translateTermsPublicFallback,
} from './profileTranslation';
import { BASE_UI_STRINGS } from '../data/translations';
import { OwnerStudioModal } from '../components/OwnerStudioModal';
import { OWNER_EMAIL, type PsychologicalProfile, type Track } from '../types';

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
  assert.equal(translateLanguageByCode('zxx', 'en'), 'Instrumental');
  assert.equal(translateLanguageByCode('zxx', 'ko'), '연주곡');
  assert.equal(translateLanguageByCode('zxx', 'ru'), 'Инструментал');
});

test('resolveCountryCode and resolveLanguageCode map common names to ISO codes', () => {
  assert.equal(resolveCountryCode('Rusia'), 'RU');
  assert.equal(resolveCountryCode('Francia'), 'FR');
  assert.equal(resolveLanguageCode('Ruso'), 'ru');
  assert.equal(resolveLanguageCode('Francés'), 'fr');
  assert.equal(resolveLanguageCode('Sin letra'), 'zxx');
  assert.equal(resolveLanguageCode('Instrumental'), 'zxx');
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
  assert.ok(draft.personalitySummary.includes('rutinas'));
  assert.ok(draft.personalitySummary.includes('compañías'));
  assert.ok(draft.personalitySummary.length <= 1450);
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

test('translateTermsPublicFallback batches >30 video comments/descriptions, preserves keys, and uses sl=auto', async () => {
  const seenUrls: string[] = [];
  const mockFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seenUrls.push(url);
    const qParam = new URL(url).searchParams.get('q') ?? '';
    return new Response(JSON.stringify([[[`EN:${qParam}`, qParam]]]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const manyComments = Array.from({ length: 36 }, (_, idx) => `Comentario del video ${idx + 1}`);
  manyComments.push('  Nota con espacios  ');

  const translated = await translateTermsPublicFallback(manyComments, 'en', mockFetch);
  assert.equal(seenUrls.length, 37);
  assert.ok(seenUrls.every((u) => u.includes('sl=auto&tl=en')));
  assert.equal(translated['Comentario del video 36'], 'EN:Comentario del video 36');
  assert.equal(translated['  Nota con espacios  '], 'EN:Nota con espacios');
  assert.equal(translated['Nota con espacios'], 'EN:Nota con espacios');
});

test('resolveInitialTheme and toggleThemeMode respect stored preference and system fallback', () => {
  assert.equal(resolveInitialTheme('dark', false), 'dark');
  assert.equal(resolveInitialTheme('light', true), 'light');
  assert.equal(resolveInitialTheme(null, true), 'dark');
  assert.equal(resolveInitialTheme(undefined, false), 'light');
  assert.equal(resolveInitialTheme('unexpected', false), 'light');
  assert.equal(toggleThemeMode('light'), 'dark');
  assert.equal(toggleThemeMode('dark'), 'light');
});

test('buildAudioQueue builds ordered, radio, similar-genre, same-language, and same-genre queues', () => {
  const catalog: Track[] = [
    ...SAMPLE_TRACKS,
    {
      id: 't4',
      ownerId: 'owner1',
      youtubeId: 'abc11111111',
      youtubeUrl: 'https://www.youtube.com/watch?v=abc11111111',
      title: 'Pop Frances Demo',
      artist: 'Emma Peters',
      country: 'Francia',
      countryCode: 'FR',
      language: 'Francés',
      languageCode: 'fr',
      genre: 'Pop Electrónica (Remix)',
      isRemix: true,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc11111111/hqdefault.jpg',
    },
    {
      id: 't5',
      ownerId: 'owner1',
      youtubeId: 'abc22222222',
      youtubeUrl: 'https://www.youtube.com/watch?v=abc22222222',
      title: 'Bilingual Pop Demo',
      artist: 'Artist A & B',
      country: 'Argentina / Brasil',
      countryCode: 'AR,BR',
      language: 'Español / Portugués',
      languageCode: 'es,pt',
      genre: 'Pop Electrónico',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc22222222/hqdefault.jpg',
    },
    {
      id: 't6',
      ownerId: 'owner1',
      youtubeId: 'abc33333333',
      youtubeUrl: 'https://www.youtube.com/watch?v=abc33333333',
      title: 'River Flows in You',
      artist: 'Yiruma',
      country: 'Corea del Sur',
      countryCode: 'KR',
      language: 'Instrumental',
      languageCode: 'zxx',
      genre: 'Piano Contemporáneo',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc33333333/hqdefault.jpg',
    },
  ];

  // Ordered preserves catalog order
  assert.deepEqual(
    buildAudioQueue(catalog, catalog[2], 'ordered').map((t) => t.id),
    catalog.map((t) => t.id)
  );

  // Radio keeps anchor first and preserves all tracks
  const radioA = buildAudioQueue(catalog, catalog[1], 'radio', 42);
  const radioB = buildAudioQueue(catalog, catalog[1], 'radio', 99);
  assert.equal(radioA[0].id, 't2');
  assert.equal(radioA.length, catalog.length);
  assert.notDeepEqual(
    radioA.map((t) => t.id),
    radioB.map((t) => t.id)
  );

  // Same language matches bilingual codes too (es + es,pt)
  const esQueue = buildAudioQueue(catalog, catalog[0], 'same-language');
  assert.deepEqual(
    esQueue.map((t) => t.id),
    ['t1', 't3', 't5']
  );

  // Instrumental zxx matches instrumental only
  const instQueue = buildAudioQueue(catalog, catalog[5], 'same-language');
  assert.deepEqual(
    instQueue.map((t) => t.id),
    ['t6']
  );

  // Same genre ignores case, accents, and (Remix) tag
  const popElectroQueue = buildAudioQueue(catalog, catalog[4], 'same-genre');
  assert.deepEqual(
    popElectroQueue.map((t) => t.id),
    ['t5']
  );
  const sameRockQueue = buildAudioQueue(
    [
      ...catalog,
      { ...catalog[0], id: 't7', title: 'Otra Rock', genre: 'rock nacional (Remix)' },
    ],
    catalog[0],
    'same-genre'
  );
  assert.deepEqual(
    sameRockQueue.map((t) => t.id),
    ['t1', 't7']
  );

  // Similar genre links Rock Nacional -> Rock Alternativo and excludes unrelated Piano Contemporáneo
  const similarRockQueue = buildAudioQueue(catalog, catalog[0], 'similar-genre');
  assert.ok(similarRockQueue.some((t) => t.id === 't3'));
  assert.ok(!similarRockQueue.some((t) => t.id === 't6'));
  assert.ok(computeGenreSimilarityScore('Pop Electrónico', 'City Pop') > 0);

  // Adjacent track navigation + wrap-around + time formatting
  assert.equal(getAdjacentAudioTrack(esQueue, 't1', 1, true)?.id, 't3');
  assert.equal(getAdjacentAudioTrack(esQueue, 't5', 1, true)?.id, 't1');
  assert.equal(getAdjacentAudioTrack(esQueue, 't1', -1, true)?.id, 't5');
  assert.equal(formatAudioTime(0), '0:00');
  assert.equal(formatAudioTime(-5), '0:00');
  assert.equal(formatAudioTime(125.9), '2:05');
});

test('shouldShowVideoGallery hides full catalog until country, language, filter, search, or all mode is chosen', () => {
  assert.equal(
    shouldShowVideoGallery({ mode: 'country', selectedKey: null, genre: null, query: '' }),
    false
  );
  assert.equal(
    shouldShowVideoGallery({ mode: 'language', selectedKey: null, genre: null, query: '' }),
    false
  );
  assert.equal(
    shouldShowVideoGallery({ mode: 'country', selectedKey: 'FR', genre: null, query: '' }),
    true
  );
  assert.equal(
    shouldShowVideoGallery({ mode: 'country', selectedKey: null, genre: 'Pop', query: '' }),
    true
  );
  assert.equal(
    shouldShowVideoGallery({ mode: 'country', selectedKey: null, genre: null, query: 'Indila' }),
    true
  );
  assert.equal(
    shouldShowVideoGallery({ mode: 'all', selectedKey: null, genre: null, query: '' }),
    true
  );
});

test('findDuplicateTrackMatches detects exact videos, same song/artist variants, and alternate interpretations without false positives', () => {
  const catalog: Track[] = [
    {
      id: 'c1',
      ownerId: 'owner1',
      youtubeId: 'abc12345678',
      youtubeUrl: 'https://www.youtube.com/watch?v=abc12345678',
      title: 'Mil Horas',
      artist: 'Los Abuelos de la Nada',
      country: 'Argentina',
      countryCode: 'AR',
      language: 'Español',
      languageCode: 'es',
      genre: 'Rock Nacional',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 1000,
    },
    {
      id: 'c2',
      ownerId: 'owner1',
      youtubeId: 'def12345678',
      youtubeUrl: 'https://www.youtube.com/watch?v=def12345678',
      title: 'Louca Por Ti (Dust In The Wind)',
      artist: 'Calcinha Preta',
      country: 'Brasil',
      countryCode: 'BR',
      language: 'Português',
      languageCode: 'pt',
      genre: 'Forró',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 2000,
    },
    {
      id: 'c3',
      ownerId: 'owner1',
      youtubeId: 'ghi12345678',
      youtubeUrl: 'https://www.youtube.com/watch?v=ghi12345678',
      title: 'Nuestro Juramento',
      artist: 'Julio Jaramillo',
      country: 'Ecuador',
      countryCode: 'EC',
      language: 'Español',
      languageCode: 'es',
      genre: 'Pasillo',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 3000,
    },
    {
      id: 'c4',
      ownerId: 'owner1',
      youtubeId: 'cyr12345678',
      youtubeUrl: 'https://www.youtube.com/watch?v=cyr12345678',
      title: 'Яд',
      artist: 'Эрика Лундмоен',
      country: 'Rusia',
      countryCode: 'RU',
      language: 'Ruso',
      languageCode: 'ru',
      genre: 'Pop Alternativo',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 4000,
    },
  ];

  // Normalization sanity checks
  assert.equal(normalizeSongTitleForComparison('Mil Horas (Official Video)'), 'mil horas');
  assert.equal(normalizeSongTitleForComparison('Despacito - Remix'), 'despacito');
  assert.ok(extractComparableTitleKeys('Louca Por Ti (Dust In The Wind)').includes('dust in the wind'));
  assert.deepEqual(normalizeArtistTokens('Celine Dion & Andrea Bocelli'), ['celine dion', 'andrea bocelli']);

  // 1. Exact YouTube video match
  const exactMatches = findDuplicateTrackMatches({ youtubeId: 'abc12345678' }, catalog);
  assert.equal(exactMatches.length, 1);
  assert.equal(exactMatches[0].matchType, 'exact-video');
  assert.equal(exactMatches[0].track.id, 'c1');

  // 2. Same song + same artist with casing/live tag differences on a different YouTube URL
  const sameSongArtistMatches = findDuplicateTrackMatches(
    {
      youtubeId: 'xyz99999999',
      title: 'Mil horas (En vivo)',
      artist: 'Los Abuelos De La Nada',
    },
    catalog
  );
  assert.equal(sameSongArtistMatches.length, 1);
  assert.equal(sameSongArtistMatches[0].matchType, 'same-song-artist');
  assert.equal(sameSongArtistMatches[0].track.id, 'c1');

  // 3. Alternate interpretation via different artist / cover subtitle / Cyrillic variant
  const coverMatches = findDuplicateTrackMatches(
    {
      youtubeId: 'kns11111111',
      title: 'Dust in the Wind',
      artist: 'Kansas',
    },
    catalog
  );
  assert.equal(coverMatches.length, 1);
  assert.equal(coverMatches[0].matchType, 'same-song-interpretation');
  assert.equal(coverMatches[0].track.id, 'c2');

  const cyrillicMatches = findDuplicateTrackMatches(
    {
      youtubeId: 'cyr99999999',
      title: 'Яд (Acoustic)',
      artist: 'Otro Intérprete',
    },
    catalog
  );
  assert.equal(cyrillicMatches.length, 1);
  assert.equal(cyrillicMatches[0].matchType, 'same-song-interpretation');
  assert.equal(cyrillicMatches[0].track.id, 'c4');

  // 4. Different song by same artist MUST NOT trigger duplicate warning
  const distinctSameArtist = findDuplicateTrackMatches(
    {
      youtubeId: 'jjj22222222',
      title: 'Senderito de amor',
      artist: 'Julio Jaramillo',
    },
    catalog
  );
  assert.deepEqual(distinctSameArtist, []);
});

test('findCatalogDuplicateGroups groups existing duplicate songs and interpretations cleanly', () => {
  const catalog: Track[] = [
    {
      id: 't1',
      ownerId: 'owner1',
      youtubeId: 'vid00000001',
      youtubeUrl: 'https://www.youtube.com/watch?v=vid00000001',
      title: 'Mil Horas',
      artist: 'Los Abuelos de la Nada',
      country: 'Argentina',
      countryCode: 'AR',
      language: 'Español',
      languageCode: 'es',
      genre: 'Rock Nacional',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 1,
    },
    {
      id: 't2',
      ownerId: 'owner1',
      youtubeId: 'vid00000002',
      youtubeUrl: 'https://www.youtube.com/watch?v=vid00000002',
      title: 'Mil Horas (Official Video)',
      artist: 'Los Abuelos De La Nada',
      country: 'Argentina',
      countryCode: 'AR',
      language: 'Español',
      languageCode: 'es',
      genre: 'Rock',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 2,
    },
    {
      id: 't3',
      ownerId: 'owner1',
      youtubeId: 'vid00000003',
      youtubeUrl: 'https://www.youtube.com/watch?v=vid00000003',
      title: 'Canción Única',
      artist: 'Artista Único',
      country: 'España',
      countryCode: 'ES',
      language: 'Español',
      languageCode: 'es',
      genre: 'Pop',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 3,
    },
  ];

  const groups = findCatalogDuplicateGroups(catalog);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].matchType, 'same-song-artist');
  assert.deepEqual(
    groups[0].tracks.map((tr) => tr.id),
    ['t1', 't2']
  );
});

test('OwnerStudioModal renders duplicate URL alert, publish confirmation alert, and catalog duplicate summary', () => {
  const existingTracks: Track[] = [
    {
      id: 't1',
      ownerId: 'owner1',
      youtubeId: 'dQw4w9WgXcQ',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Mil Horas',
      artist: 'Los Abuelos de la Nada',
      country: 'Argentina',
      countryCode: 'AR',
      language: 'Español',
      languageCode: 'es',
      genre: 'Rock Nacional',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 100,
    },
    {
      id: 't2',
      ownerId: 'owner1',
      youtubeId: 'other000002',
      youtubeUrl: 'https://www.youtube.com/watch?v=other000002',
      title: 'Mil Horas (En Vivo)',
      artist: 'Los Abuelos De La Nada',
      country: 'Argentina',
      countryCode: 'AR',
      language: 'Español',
      languageCode: 'es',
      genre: 'Rock Nacional',
      thumbnailUrl: 'https://i.ytimg.com/vi/sample/hqdefault.jpg',
      createdAtMs: 200,
    },
  ];

  const html = renderToStaticMarkup(
    createElement(OwnerStudioModal, {
      open: true,
      initialTab: 'video',
      onClose: () => {},
      t: (key) => BASE_UI_STRINGS[key],
      user: { email: OWNER_EMAIL } as never,
      isOwner: true,
      existingTracks,
      initialYoutubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      initialAnalyzed: {
        youtubeId: 'newid999999',
        youtubeUrl: 'https://www.youtube.com/watch?v=newid999999',
        title: 'Mil Horas (Cover)',
        artist: 'Otro Artista',
        country: 'Argentina',
        countryCode: 'AR',
        language: 'Español',
        languageCode: 'es',
        genre: 'Pop',
        isRemix: false,
        curatorNote: '',
        thumbnailUrl: 'https://i.ytimg.com/vi/newid999999/hqdefault.jpg',
      },
      onSignIn: async () => {},
      onSignOut: async () => {},
      onPublishTrack: async () => {},
      onUploadPhoto: async () => {},
      hasDefaultTracks: false,
      hasDefaultPhotos: false,
      onClearDefaultTracks: async () => {},
      onClearDefaultPhotos: async () => {},
    })
  );

  assert.ok(html.includes('data-testid="duplicate-url-alert"'));
  assert.ok(html.includes('data-testid="duplicate-track-alert"'));
  assert.ok(html.includes('data-testid="duplicate-confirm-checkbox"'));
  assert.ok(html.includes('data-testid="catalog-duplicates-notice"'));
  assert.ok(html.includes(BASE_UI_STRINGS.duplicateInterpretationAlertTitle));
  assert.ok(html.includes('disabled=""'));
});



