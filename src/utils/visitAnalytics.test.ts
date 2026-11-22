import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BASE_UI_STRINGS } from '../data/translations';
import { HeroPhotoSection } from '../components/HeroPhotoSection';
import { OwnerStudioModal } from '../components/OwnerStudioModal';
import { OWNER_EMAIL, type PageVisit } from '../types';
import {
  buildSanitizedVisitPayload,
  detectVisitorDeviceType,
  formatDayKey,
  generateSafeVisitId,
  inferGeoFromTimezoneAndLocale,
  sanitizeReferrerHost,
  summarizeVisitAnalytics,
} from './visitAnalytics';

test('inferGeoFromTimezoneAndLocale maps known timezones, Argentine subzones, and locale fallbacks cleanly', () => {
  const ba = inferGeoFromTimezoneAndLocale('America/Argentina/Buenos_Aires', 'es-AR');
  assert.equal(ba.countryCode, 'AR');
  assert.equal(ba.countryName, 'Argentina');
  assert.equal(ba.city, 'Buenos Aires');
  assert.equal(ba.geoSource, 'timezone');

  const salta = inferGeoFromTimezoneAndLocale('America/Argentina/Salta', 'es');
  assert.equal(salta.countryCode, 'AR');
  assert.equal(salta.city, 'Salta');

  const madrid = inferGeoFromTimezoneAndLocale('Europe/Madrid', 'es-ES');
  assert.equal(madrid.countryCode, 'ES');
  assert.equal(madrid.city, 'Madrid');

  const localeFallback = inferGeoFromTimezoneAndLocale('Atlantic/UnknownZone', 'pt-BR');
  assert.equal(localeFallback.countryCode, 'BR');
  assert.equal(localeFallback.geoSource, 'timezone');

  const completelyUnknown = inferGeoFromTimezoneAndLocale('', '');
  assert.equal(completelyUnknown.countryCode, 'ZZ');
});

test('detectVisitorDeviceType and sanitizeReferrerHost classify device and strip same-host or invalid referrers', () => {
  assert.equal(
    detectVisitorDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'),
    'mobile'
  );
  assert.equal(
    detectVisitorDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'),
    'tablet'
  );
  assert.equal(
    detectVisitorDeviceType('Mozilla/5.0 (X11; Linux x86_64)', 1440),
    'desktop'
  );

  assert.equal(sanitizeReferrerHost('https://www.google.com/search?q=joan', 'joan-manuels-playlists.vercel.app'), 'google.com');
  assert.equal(sanitizeReferrerHost('https://joan-manuels-playlists.vercel.app/other', 'joan-manuels-playlists.vercel.app'), 'direct');
  assert.equal(sanitizeReferrerHost('not-a-valid-url', 'localhost'), 'direct');
  assert.equal(sanitizeReferrerHost('', 'localhost'), 'direct');
});

test('buildSanitizedVisitPayload enforces strict Firestore schema bounds and valid ID format', () => {
  const id = generateSafeVisitId();
  assert.match(id, /^[a-zA-Z0-9_\-]+$/);
  assert.ok(id.length <= 128);

  const now = new Date('2026-11-22T14:00:00.000Z');
  const payload = buildSanitizedVisitPayload(
    {
      countryCode: 'ar123',
      countryName: 'Argentina ' + 'x'.repeat(120),
      region: 'Buenos Aires',
      city: 'La Plata',
      continent: 'Sudamérica',
      timezone: 'America/Argentina/Buenos_Aires',
      visitorLang: 'es-AR!@#',
      deviceType: 'mobile',
      referrerHost: 'instagram.com',
      geoSource: 'ip-geo',
      dayKey: 'invalid-date',
    },
    now
  );

  assert.equal(payload.countryCode, 'AR');
  assert.equal(payload.countryName.length, 80);
  assert.equal(payload.visitorLang, 'es-AR');
  assert.equal(payload.dayKey, formatDayKey(now));
  assert.equal(payload.geoSource, 'ip-geo');
});

test('summarizeVisitAnalytics aggregates countries, cities, devices, languages, and 14-day series accurately', () => {
  const now = new Date('2026-11-22T15:00:00.000Z');
  const visits: PageVisit[] = [
    {
      id: 'v1',
      countryCode: 'AR',
      countryName: 'Argentina',
      region: 'Buenos Aires',
      city: 'Buenos Aires',
      continent: 'Sudamérica',
      timezone: 'America/Argentina/Buenos_Aires',
      visitorLang: 'es-AR',
      deviceType: 'mobile',
      referrerHost: 'direct',
      geoSource: 'ip-geo',
      dayKey: '2026-11-22',
      createdAtMs: 3000,
    },
    {
      id: 'v2',
      countryCode: 'AR',
      countryName: 'Argentina',
      region: 'Córdoba',
      city: 'Córdoba',
      continent: 'Sudamérica',
      timezone: 'America/Argentina/Cordoba',
      visitorLang: 'es',
      deviceType: 'desktop',
      referrerHost: 'instagram.com',
      geoSource: 'ip-geo',
      dayKey: '2026-11-21',
      createdAtMs: 2000,
    },
    {
      id: 'v3',
      countryCode: 'ES',
      countryName: 'España',
      region: 'Madrid',
      city: 'Madrid',
      continent: 'Europa',
      timezone: 'Europe/Madrid',
      visitorLang: 'en-US',
      deviceType: 'mobile',
      referrerHost: 'google.com',
      geoSource: 'server-header',
      dayKey: '2026-11-10',
      createdAtMs: 1000,
    },
  ];

  const summary = summarizeVisitAnalytics(visits, 12, now);
  assert.equal(summary.totalVisits, 12);
  assert.equal(summary.loadedVisits, 3);
  assert.equal(summary.uniqueCountriesCount, 2);
  assert.equal(summary.uniqueCitiesCount, 3);
  assert.equal(summary.todayCount, 1);
  assert.equal(summary.last7DaysCount, 2);
  assert.equal(summary.topCountries[0].countryCode, 'AR');
  assert.equal(summary.topCountries[0].count, 2);
  assert.equal(summary.topCountries[0].percent, 67);
  assert.equal(summary.topCities[0].countryCode, 'AR');
  assert.equal(summary.dailySeries.length, 14);
  assert.equal(summary.dailySeries[13].dayKey, '2026-11-22');
  assert.equal(summary.dailySeries[13].count, 1);
  assert.equal(summary.recentVisits[0].id, 'v1');
});

test('HeroPhotoSection and OwnerStudioModal strictly hide visit counter and stats from non-owners and render them for verified owner', () => {
  const sampleVisits: PageVisit[] = [
    {
      id: 'v1',
      countryCode: 'AR',
      countryName: 'Argentina',
      region: 'Buenos Aires',
      city: 'Buenos Aires',
      continent: 'Sudamérica',
      timezone: 'America/Argentina/Buenos_Aires',
      visitorLang: 'es-AR',
      deviceType: 'mobile',
      referrerHost: 'direct',
      geoSource: 'ip-geo',
      dayKey: '2026-11-22',
      createdAtMs: Date.UTC(2026, 10, 22, 12, 0),
    },
  ];

  // Visitor view: must never expose visit counter or stats panel
  const visitorHeroHtml = renderToStaticMarkup(
    createElement(HeroPhotoSection, {
      t: (k) => BASE_UI_STRINGS[k],
      currentLang: 'es',
      onChangeLang: () => {},
      isTranslating: false,
      transliteration: { transliteratedName: 'Joan Manuel Sebastian Del Valle', scriptLabel: 'Español' },
      totalTracks: 10,
      isOwner: false,
      ownerTotalVisits: 42,
      onOpenOwnerStudio: () => {},
    })
  );
  assert.equal(visitorHeroHtml.includes('data-testid="owner-visits-trigger"'), false);

  const nonOwnerModalHtml = renderToStaticMarkup(
    createElement(OwnerStudioModal, {
      open: true,
      initialTab: 'stats',
      onClose: () => {},
      t: (k) => BASE_UI_STRINGS[k],
      user: { email: 'other@example.com' } as never,
      isOwner: false,
      onSignIn: async () => {},
      onSignOut: async () => {},
      onPublishTrack: async () => {},
      onUploadPhoto: async () => {},
      hasDefaultTracks: false,
      hasDefaultPhotos: false,
      onClearDefaultTracks: async () => {},
      onClearDefaultPhotos: async () => {},
      visits: sampleVisits,
      totalVisitsCount: 42,
    })
  );
  assert.equal(nonOwnerModalHtml.includes('data-testid="owner-tab-stats"'), false);
  assert.equal(nonOwnerModalHtml.includes('data-testid="owner-stats-panel"'), false);

  // Verified owner view: renders discrete badge and full geographic stats dashboard
  const ownerHeroHtml = renderToStaticMarkup(
    createElement(HeroPhotoSection, {
      t: (k) => BASE_UI_STRINGS[k],
      currentLang: 'es',
      onChangeLang: () => {},
      isTranslating: false,
      transliteration: { transliteratedName: 'Joan Manuel Sebastian Del Valle', scriptLabel: 'Español' },
      totalTracks: 10,
      isOwner: true,
      ownerTotalVisits: 42,
      onOpenOwnerStudio: () => {},
    })
  );
  assert.ok(ownerHeroHtml.includes('data-testid="owner-visits-trigger"'));
  assert.ok(ownerHeroHtml.includes('42'));

  const ownerModalHtml = renderToStaticMarkup(
    createElement(OwnerStudioModal, {
      open: true,
      initialTab: 'stats',
      onClose: () => {},
      t: (k) => BASE_UI_STRINGS[k],
      currentLang: 'es',
      user: { email: OWNER_EMAIL } as never,
      isOwner: true,
      onSignIn: async () => {},
      onSignOut: async () => {},
      onPublishTrack: async () => {},
      onUploadPhoto: async () => {},
      hasDefaultTracks: false,
      hasDefaultPhotos: false,
      onClearDefaultTracks: async () => {},
      onClearDefaultPhotos: async () => {},
      visits: sampleVisits,
      totalVisitsCount: 42,
    })
  );
  assert.ok(ownerModalHtml.includes('data-testid="owner-tab-stats"'));
  assert.ok(ownerModalHtml.includes('data-testid="owner-stats-panel"'));
  assert.ok(ownerModalHtml.includes('Buenos Aires'));
  assert.ok(ownerModalHtml.includes('42'));
});
