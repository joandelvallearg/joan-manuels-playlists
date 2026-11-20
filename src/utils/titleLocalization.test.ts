import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTitleScripts,
  formatTrackTitlePlain,
  getTargetScript,
  isTrackAlreadyInTargetLanguage,
  localizeSongTitlesPublicFallback,
  resolveTitleGloss,
  stripTitleMetadataSuffix,
  titleDiffersFromUserScript,
  transliterateCyrillicToLatin,
} from './titleLocalization';

test('getTargetScript and detectTitleScripts identify Latin, Cyrillic, Japanese, Korean, Arabic, Chinese, Devanagari', () => {
  assert.equal(getTargetScript('es'), 'latin');
  assert.equal(getTargetScript('en-US'), 'latin');
  assert.equal(getTargetScript('ru'), 'cyrillic');
  assert.equal(getTargetScript('ja'), 'japanese');
  assert.equal(getTargetScript('ko'), 'korean');
  assert.equal(getTargetScript('ar'), 'arabic');
  assert.equal(getTargetScript('zh-TW'), 'chinese');
  assert.equal(getTargetScript('hi'), 'devanagari');

  assert.deepEqual(detectTitleScripts('Глубина'), ['cyrillic']);
  assert.deepEqual(detectTitleScripts('PROVENZA'), ['latin']);
  assert.deepEqual(detectTitleScripts('Грустный Дэнс (LIVE @ Авторадио)'), ['cyrillic']);
  assert.deepEqual(detectTitleScripts('1999'), []);
});

test('titleDiffersFromUserScript compares core title script against visitor target script', () => {
  // Cyrillic title vs Latin visitor -> differs
  assert.equal(titleDiffersFromUserScript('Лали', 'es'), true);
  assert.equal(titleDiffersFromUserScript('Глубина', 'en'), true);
  // Cyrillic title with Latin metadata suffix vs Russian visitor -> does NOT differ
  assert.equal(titleDiffersFromUserScript('Грустный Дэнс (LIVE @ Авторадио)', 'ru'), false);
  // Latin title vs Latin visitor -> does NOT differ
  assert.equal(titleDiffersFromUserScript('PROVENZA', 'es'), false);
  assert.equal(titleDiffersFromUserScript('S91', 'en'), false);
  // Latin title vs non-Latin visitor -> differs
  assert.equal(titleDiffersFromUserScript('PROVENZA', 'ja'), true);
  assert.equal(titleDiffersFromUserScript('PROVENZA', 'ru'), true);
  assert.equal(titleDiffersFromUserScript('Cairo', 'ar'), true);
  // Pure digits -> never differs
  assert.equal(titleDiffersFromUserScript('1999', 'ja'), false);
});

test('isTrackAlreadyInTargetLanguage skips native-script same-language tracks but keeps foreign-script & instrumental titles', () => {
  assert.equal(isTrackAlreadyInTargetLanguage({ title: 'Senderito de amor', languageCode: 'es' }, 'es'), true);
  assert.equal(isTrackAlreadyInTargetLanguage({ title: 'Bohemian Rhapsody', languageCode: 'en' }, 'en'), true);
  assert.equal(isTrackAlreadyInTargetLanguage({ title: 'Лали', languageCode: 'ru' }, 'ru'), true);

  // Russian track with English title "Life" should NOT be treated as already in Russian
  assert.equal(isTrackAlreadyInTargetLanguage({ title: 'Life', languageCode: 'ru' }, 'ru'), false);
  // Instrumental track ("zxx") with English title still needs translation for Spanish visitors
  assert.equal(isTrackAlreadyInTargetLanguage({ title: 'River Flows in You', languageCode: 'zxx' }, 'es'), false);
  // Bilingual track ("pt,en") needs evaluation even for English or Spanish
  assert.equal(isTrackAlreadyInTargetLanguage({ title: 'Boa Sorte / Good Luck', languageCode: 'pt,en' }, 'es'), false);
});

test('resolveTitleGloss enforces exact translation vs script-different transliteration rules', () => {
  // 1. Same language & same script -> NO parentheses
  assert.equal(
    resolveTitleGloss('Senderito de amor', 'es', { kind: 'translation', text: 'Senderito de amor' }, 'es'),
    null
  );
  assert.equal(
    resolveTitleGloss('Лали', 'ru', { kind: 'transliteration', text: 'Lali' }, 'ru'),
    null
  );

  // 2. Genuine translation exists -> show translation in parentheses
  assert.equal(
    resolveTitleGloss('Глубина', 'es', { kind: 'translation', text: 'Profundidad' }, 'ru'),
    'Profundidad'
  );
  assert.equal(
    formatTrackTitlePlain('Глубина', resolveTitleGloss('Глубина', 'es', { kind: 'translation', text: 'Profundidad' }, 'ru')),
    'Глубина (Profundidad)'
  );
  assert.equal(
    resolveTitleGloss('Crimen', 'en', { kind: 'translation', text: '(Crime)' }, 'es'),
    'Crime'
  );

  // 3. No translation exists AND scripts DIFFER -> show transliteration
  assert.equal(
    resolveTitleGloss('Лали', 'es', { kind: 'transliteration', text: 'Lali' }, 'ru'),
    'Lali'
  );
  assert.equal(
    resolveTitleGloss('PROVENZA', 'ja', { kind: 'transliteration', text: 'プロベンサ' }, 'es'),
    'プロベンサ'
  );

  // 4. No translation exists AND scripts are the SAME -> NO parentheses (even if model returned a transliteration)
  assert.equal(
    resolveTitleGloss('PROVENZA', 'en', { kind: 'transliteration', text: 'Pro-ven-za' }, 'es'),
    null
  );
  assert.equal(
    resolveTitleGloss('Cairo', 'en', { kind: 'none', text: '' }, 'es'),
    null
  );
  assert.equal(
    resolveTitleGloss('Cairo', 'en', { kind: 'translation', text: 'Cairo' }, 'es'),
    null
  );

  // 5. Bilingual title already contains target language segment -> suppress redundancy
  assert.equal(
    resolveTitleGloss('Boa Sorte / Good Luck', 'en', { kind: 'translation', text: 'Good Luck' }, 'pt,en'),
    null
  );
  // Same bilingual title for Spanish visitor -> keeps Spanish translation
  assert.equal(
    resolveTitleGloss('Boa Sorte / Good Luck', 'es', { kind: 'translation', text: 'Buena suerte' }, 'pt,en'),
    'Buena suerte'
  );

  // 6. Offline/missing annotation safety fallback for Cyrillic -> Latin
  assert.equal(resolveTitleGloss('Лали', 'es', null, 'ru'), 'Lali');
  assert.equal(resolveTitleGloss('Яд', 'en', undefined, 'ru'), 'Yad');
});

test('stripTitleMetadataSuffix and transliterateCyrillicToLatin handle real catalog titles cleanly', () => {
  assert.equal(stripTitleMetadataSuffix('Dernière Danse (Clip Officiel)'), 'Dernière Danse');
  assert.equal(stripTitleMetadataSuffix('Zombie (Alt. Version)'), 'Zombie');
  assert.equal(transliterateCyrillicToLatin('Лали'), 'Lali');
  assert.equal(transliterateCyrillicToLatin('Глубина'), 'Glubina');
  assert.equal(transliterateCyrillicToLatin('Падает Звезда'), 'Padayet Zvezda');
});

test('localizeSongTitlesPublicFallback translates non-Spanish titles for Spanish visitors and transliterates Cyrillic names', async () => {
  const mockFetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    const q = url.searchParams.get('q') ?? '';
    const tl = url.searchParams.get('tl') ?? '';
    assert.equal(tl, 'es');

    if (q === 'Глубина') {
      return {
        ok: true,
        json: async () => [[['Profundidad', 'Глубина', null, null, 1], [null, null, null, 'Glubina']]],
      } as unknown as Response;
    }
    if (q === 'Лали') {
      // Simulate Google Translate returning unchanged Cyrillic + romanization
      return {
        ok: true,
        json: async () => [[['Лали', 'Лали', null, null, 1], [null, null, null, 'Lali']]],
      } as unknown as Response;
    }
    if (q === 'PROVENZA') {
      return {
        ok: true,
        json: async () => [[['PROVENZA', 'PROVENZA', null, null, 1]]],
      } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => [[[q, q]]],
    } as unknown as Response;
  }) as unknown as typeof fetch;

  const result = await localizeSongTitlesPublicFallback(
    [
      { title: 'Глубина', languageCode: 'ru' },
      { title: 'Лали', languageCode: 'ru' },
      { title: 'PROVENZA', languageCode: 'es' },
    ],
    'es',
    mockFetch
  );

  assert.deepEqual(result['Глубина'], { kind: 'translation', text: 'Profundidad' });
  assert.deepEqual(result['Лали'], { kind: 'transliteration', text: 'Lali' });
  assert.deepEqual(result['PROVENZA'], { kind: 'none', text: '' });
});
