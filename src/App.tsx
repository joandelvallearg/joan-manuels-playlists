import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { AudioDeckPlayer, type AudioPlaybackStatus } from './components/AudioDeckPlayer';
import { Header } from './components/Header';
import { HeroPhotoSection } from './components/HeroPhotoSection';
import { OwnerStudioModal } from './components/OwnerStudioModal';
import { PhotoGallerySection } from './components/PhotoGallerySection';
import { PhotoLightbox } from './components/PhotoLightbox';
import { HISTORY_VIRTUAL_PLAYLIST_ID, PlaylistExplorer } from './components/PlaylistExplorer';
import { QrShareModal } from './components/QrShareModal';
import { StagePlayer } from './components/StagePlayer';
import { SEED_PHOTOS, SEED_TRACKS } from './data/seedData';
import {
  BASE_UI_STRINGS,
  LANGUAGE_OPTIONS,
  STATIC_TERM_TRANSLATIONS,
  STATIC_UI_DICTIONARIES,
  STATIC_TRANSLITERATIONS,
  type UiStringKey,
} from './data/translations';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import {
  OWNER_EMAIL,
  OWNER_SPANISH_NAME,
  PUBLIC_SHARE_URL,
  type AnalyzedVideoResult,
  type AudioPlayMode,
  type GeneratedProfileDraft,
  type PageVisit,
  type Photo,
  type PlaylistGroup,
  type PlaylistMode,
  type ProfileTranslation,
  type PsychologicalProfile,
  type Track,
  type TransliterationInfo,
  type VisitGeoSource,
  type VisitorLibraryState,
} from './types';
import {
  buildAudioQueue,
  buildFallbackPsychologicalProfile,
  filterTracks,
  getAdjacentAudioTrack,
  groupTracksByCountry,
  groupTracksByLanguage,
  isPrivateDevUrl,
  normalizeCountryCodesList,
  normalizeLanguageCode,
  normalizeLanguageCodesList,
  resolveInitialTheme,
  resolvePublicShareUrl,
  THEME_STORAGE_KEY,
  toggleThemeMode,
  translateCountryByCode,
  translateLanguageByCode,
  type ThemeMode,
} from './utils/musicLogic';
import { translateTermsPublicFallback } from './utils/profileTranslation';
import {
  isTrackAlreadyInTargetLanguage,
  localizeSongTitlesPublicFallback,
  resolveTitleGloss,
  type TitleAnnotation,
} from './utils/titleLocalization';
import {
  LIKED_VIRTUAL_PLAYLIST_ID,
  createVisitorPlaylist,
  deleteVisitorPlaylist,
  loadVisitorLibrary,
  recordListeningHistory,
  renameVisitorPlaylist,
  resolveLibraryTracks,
  saveVisitorLibrary,
  toggleLikedTrack,
  toggleTrackInPlaylist,
} from './utils/visitorLibrary';
import {
  buildSanitizedVisitPayload,
  detectVisitorDeviceType,
  generateSafeVisitId,
  inferGeoFromTimezoneAndLocale,
  sanitizeReferrerHost,
  VISIT_SESSION_KEY,
} from './utils/visitAnalytics';

interface CachedTranslationPayload {
  transliteratedName: string;
  scriptLabel: string;
  translatedUi: Record<string, string>;
  translatedTerms: Record<string, string>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [firestoreTracks, setFirestoreTracks] = useState<Track[]>([]);
  const [firestorePhotos, setFirestorePhotos] = useState<Photo[]>([]);
  const [hiddenSeedTrackIds, setHiddenSeedTrackIds] = useState<string[]>([]);
  const [hiddenSeedPhotoIds, setHiddenSeedPhotoIds] = useState<string[]>([]);
  const [savedProfile, setSavedProfile] = useState<PsychologicalProfile | null>(null);

  const [currentLang, setCurrentLang] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('jm_lang') : null;
    if (saved) return saved;
    const browser = typeof navigator !== 'undefined' ? navigator.language : 'es';
    return normalizeLanguageCode(browser);
  });

  const [aiCache, setAiCache] = useState<Record<string, CachedTranslationPayload>>({});
  const [titleAnnotationsCache, setTitleAnnotationsCache] = useState<
    Record<string, Record<string, TitleAnnotation>>
  >({});
  const [isTranslating, setIsTranslating] = useState(false);

  const [mode, setMode] = useState<PlaylistMode>('country');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [autoplayPlayer, setAutoplayPlayer] = useState(false);

  const [audioTrackId, setAudioTrackId] = useState<string | null>(null);
  const [audioAnchorTrackId, setAudioAnchorTrackId] = useState<string | null>(null);
  const [audioPlayMode, setAudioPlayMode] = useState<AudioPlayMode>('ordered');
  const [audioPlaybackStatus, setAudioPlaybackStatus] = useState<AudioPlaybackStatus>('stopped');
  const [radioSeed, setRadioSeed] = useState<number>(1);
  const [activePersonalAudioId, setActivePersonalAudioId] = useState<string | null>(null);

  const [visitorLibrary, setVisitorLibrary] = useState<VisitorLibraryState>(() =>
    loadVisitorLibrary()
  );
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [ownerModalTab, setOwnerModalTab] = useState<'video' | 'photo' | 'stats'>('video');
  const [ownerVisits, setOwnerVisits] = useState<PageVisit[]>([]);
  const [ownerTotalVisits, setOwnerTotalVisits] = useState<number>(0);
  const [ownerStatsLoading, setOwnerStatsLoading] = useState<boolean>(false);
  const [ownerStatsError, setOwnerStatsError] = useState<string | null>(null);
  const visitRecordedRef = useRef(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [serverPublicUrl, setServerPublicUrl] = useState('');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved =
        typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
      const systemDark =
        typeof window !== 'undefined' &&
        Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      return resolveInitialTheme(saved, systemDark);
    } catch {
      return 'light';
    }
  });
  const [customShareUrl, setCustomShareUrl] = useState<string>(() => {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem('jm_custom_share_url') ?? '' : '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = toggleThemeMode(prev);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const isOwner = Boolean(
    user && user.emailVerified && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );

  // Sync Firebase Auth, verify Firestore connection, and fetch public share URL
  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { publicUrl?: string } | null) => {
        if (data?.publicUrl) setServerPublicUrl(data.publicUrl);
      })
      .catch(() => {
        // Ignore network errors on health check
      });
    return () => unsub();
  }, []);

  const loadOwnerVisitStats = useCallback(async () => {
    if (!isOwner) return;
    setOwnerStatsLoading(true);
    setOwnerStatsError(null);
    try {
      const visitsCol = collection(db, 'visits');
      const [countSnap, docsSnap] = await Promise.all([
        getCountFromServer(visitsCol),
        getDocs(query(visitsCol, orderBy('createdAt', 'desc'), limit(1000))),
      ]);
      const items: PageVisit[] = docsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          countryCode: String(data.countryCode ?? 'ZZ'),
          countryName: String(data.countryName ?? 'Ubicación no especificada'),
          region: String(data.region ?? ''),
          city: String(data.city ?? ''),
          continent: String(data.continent ?? ''),
          timezone: String(data.timezone ?? ''),
          visitorLang: String(data.visitorLang ?? 'es'),
          deviceType:
            data.deviceType === 'mobile' || data.deviceType === 'tablet'
              ? data.deviceType
              : 'desktop',
          referrerHost: String(data.referrerHost ?? 'direct'),
          geoSource:
            data.geoSource === 'server-header' || data.geoSource === 'ip-geo'
              ? data.geoSource
              : 'timezone',
          dayKey: String(data.dayKey ?? ''),
          createdAtMs:
            typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0,
        };
      });
      setOwnerTotalVisits(Math.max(countSnap.data().count, items.length));
      setOwnerVisits(items);
    } catch (error) {
      setOwnerStatsError(
        error instanceof Error ? error.message : 'No se pudieron cargar las estadísticas.'
      );
    } finally {
      setOwnerStatsLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    if (isOwner) {
      loadOwnerVisitStats();
    } else {
      setOwnerVisits([]);
      setOwnerTotalVisits(0);
      setOwnerStatsError(null);
    }
  }, [isOwner, loadOwnerVisitStats]);

  // Record one anonymous visit per browser tab session (never counts signed-in owner)
  useEffect(() => {
    if (typeof window === 'undefined' || visitRecordedRef.current) return;
    try {
      if (window.sessionStorage.getItem(VISIT_SESSION_KEY) === '1') {
        visitRecordedRef.current = true;
        return;
      }
    } catch {
      // Ignore sessionStorage restrictions
    }

    visitRecordedRef.current = true;
    let cancelled = false;

    const recordVisit = async () => {
      try {
        await auth.authStateReady();
        if (cancelled) return;
        const currentUser = auth.currentUser;
        if (
          currentUser &&
          currentUser.emailVerified &&
          currentUser.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
        ) {
          return;
        }

        const timeZone =
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone || ''
            : '';
        const browserLang = typeof navigator !== 'undefined' ? navigator.language || 'es' : 'es';
        const fallbackGeo = inferGeoFromTimezoneAndLocale(timeZone, browserLang);

        let resolvedCountryCode = fallbackGeo.countryCode;
        let resolvedCountryName = fallbackGeo.countryName;
        let resolvedRegion = fallbackGeo.region;
        let resolvedCity = fallbackGeo.city;
        let resolvedContinent = fallbackGeo.continent;
        let resolvedGeoSource: VisitGeoSource = 'timezone';

        const fetchJsonWithTimeout = async <T,>(url: string): Promise<T | null> => {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), 2500);
          try {
            const res = await fetch(url, { signal: controller.signal });
            const cType = res.headers.get('content-type') || '';
            if (!res.ok || !cType.includes('application/json')) return null;
            return (await res.json()) as T;
          } catch {
            return null;
          } finally {
            window.clearTimeout(timer);
          }
        };

        const serverGeo = await fetchJsonWithTimeout<{
          countryCode?: string;
          countryName?: string;
          region?: string;
          city?: string;
          continent?: string;
          geoSource?: 'server-header' | 'ip-geo' | 'none';
        }>('/api/visitor-geo');

        if (serverGeo && serverGeo.geoSource && serverGeo.geoSource !== 'none' && serverGeo.countryCode) {
          resolvedCountryCode = serverGeo.countryCode;
          resolvedCountryName = serverGeo.countryName || '';
          resolvedRegion = serverGeo.region || '';
          resolvedCity = serverGeo.city || '';
          resolvedContinent = serverGeo.continent || fallbackGeo.continent;
          resolvedGeoSource = serverGeo.geoSource;
        } else if (
          window.location.hostname !== 'localhost' &&
          window.location.hostname !== '127.0.0.1'
        ) {
          // Static host fallback (e.g. Vercel SPA without Express /api/visitor-geo)
          const publicGeo = await fetchJsonWithTimeout<{
            country_code?: string;
            country?: string;
            region?: string;
            city?: string;
            continent_code?: string;
          }>('https://get.geojs.io/v1/ip/geo.json');
          if (publicGeo?.country_code && /^[A-Z]{2,3}$/i.test(publicGeo.country_code)) {
            resolvedCountryCode = publicGeo.country_code.toUpperCase();
            resolvedCountryName = publicGeo.country || '';
            resolvedRegion = publicGeo.region || '';
            resolvedCity = publicGeo.city || '';
            resolvedContinent = publicGeo.continent_code || fallbackGeo.continent;
            resolvedGeoSource = 'ip-geo';
          }
        }

        if (cancelled) return;

        const payload = buildSanitizedVisitPayload({
          countryCode: resolvedCountryCode,
          countryName: resolvedCountryName,
          region: resolvedRegion,
          city: resolvedCity,
          continent: resolvedContinent,
          timezone: timeZone,
          visitorLang: browserLang,
          deviceType: detectVisitorDeviceType(
            typeof navigator !== 'undefined' ? navigator.userAgent : '',
            window.innerWidth
          ),
          referrerHost: sanitizeReferrerHost(
            typeof document !== 'undefined' ? document.referrer : '',
            window.location.hostname
          ),
          geoSource: resolvedGeoSource,
        });

        const visitId = generateSafeVisitId();
        await setDoc(doc(db, 'visits', visitId), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        try {
          window.sessionStorage.setItem(VISIT_SESSION_KEY, '1');
        } catch {
          // Ignore sessionStorage write errors
        }
      } catch {
        // Silently ignore visit-tracking errors so visitors are never affected
      }
    };

    recordVisit();
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to public tracks & photos in Firestore
  useEffect(() => {
    const tracksQuery = query(collection(db, 'tracks'), orderBy('createdAt', 'desc'));
    const unsubTracks = onSnapshot(
      tracksQuery,
      (snapshot) => {
        const items: Track[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId ?? ''),
            youtubeId: String(data.youtubeId ?? ''),
            youtubeUrl: String(data.youtubeUrl ?? ''),
            title: String(data.title ?? ''),
            artist: String(data.artist ?? ''),
            country: String(data.country ?? ''),
            countryCode: String(data.countryCode ?? 'AR'),
            language: String(data.language ?? ''),
            languageCode: String(data.languageCode ?? 'es'),
            genre: String(data.genre ?? ''),
            isRemix: Boolean(data.isRemix),
            curatorNote: data.curatorNote ? String(data.curatorNote) : undefined,
            thumbnailUrl: String(data.thumbnailUrl ?? ''),
          };
        });
        setFirestoreTracks(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'tracks');
      }
    );

    const photosQuery = query(collection(db, 'photos'), orderBy('createdAt', 'desc'));
    const unsubPhotos = onSnapshot(
      photosQuery,
      (snapshot) => {
        const items: Photo[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId ?? ''),
            imageData: String(data.imageData ?? ''),
            caption: String(data.caption ?? ''),
            order: Number(data.order ?? 0),
          };
        });
        setFirestorePhotos(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'photos');
      }
    );

    const configRef = doc(db, 'siteConfig', 'main');
    const unsubConfig = onSnapshot(
      configRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setHiddenSeedTrackIds([]);
          setHiddenSeedPhotoIds([]);
          return;
        }
        const data = snapshot.data();
        setHiddenSeedTrackIds(Array.isArray(data.hiddenSeedTrackIds) ? data.hiddenSeedTrackIds.map(String) : []);
        setHiddenSeedPhotoIds(Array.isArray(data.hiddenSeedPhotoIds) ? data.hiddenSeedPhotoIds.map(String) : []);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'siteConfig/main');
      }
    );

    const profileRef = doc(db, 'profile', 'main');
    const unsubProfile = onSnapshot(
      profileRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setSavedProfile(null);
          return;
        }
        const data = snapshot.data();
        const createdAtMs =
          typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : undefined;
        const updatedAtMs =
          typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : undefined;
        const rawTranslations =
          data.translations && typeof data.translations === 'object'
            ? (data.translations as Record<string, unknown>)
            : undefined;
        const parsedTranslations: Record<string, ProfileTranslation> = {};
        if (rawTranslations) {
          for (const [langCode, val] of Object.entries(rawTranslations)) {
            if (!val || typeof val !== 'object') continue;
            const entry = val as Record<string, unknown>;
            const p = typeof entry.personalitySummary === 'string' ? entry.personalitySummary.trim() : '';
            const m = typeof entry.musicalTasteSummary === 'string' ? entry.musicalTasteSummary.trim() : '';
            const k = Array.isArray(entry.keyTraits) ? entry.keyTraits.map(String) : [];
            if (p && m) {
              parsedTranslations[langCode] = {
                personalitySummary: p,
                musicalTasteSummary: m,
                keyTraits: k,
              };
            }
          }
        }
        setSavedProfile({
          ownerId: String(data.ownerId ?? ''),
          personalitySummary: String(data.personalitySummary ?? ''),
          musicalTasteSummary: String(data.musicalTasteSummary ?? ''),
          keyTraits: Array.isArray(data.keyTraits) ? data.keyTraits.map(String) : [],
          trackCount: Number(data.trackCount ?? 0),
          translations: Object.keys(parsedTranslations).length > 0 ? parsedTranslations : undefined,
          createdAtMs,
          updatedAtMs,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'profile/main');
      }
    );

    return () => {
      unsubTracks();
      unsubPhotos();
      unsubConfig();
      unsubProfile();
    };
  }, []);

  const visibleSeedTracks = useMemo(
    () => (firestoreTracks.length > 0 ? [] : SEED_TRACKS.filter((tr) => !hiddenSeedTrackIds.includes(tr.id))),
    [firestoreTracks.length, hiddenSeedTrackIds]
  );

  const visibleSeedPhotos = useMemo(
    () => (firestorePhotos.length > 0 ? [] : SEED_PHOTOS.filter((ph) => !hiddenSeedPhotoIds.includes(ph.id))),
    [firestorePhotos.length, hiddenSeedPhotoIds]
  );

  const allTracks = useMemo(
    () => (firestoreTracks.length > 0 ? firestoreTracks : visibleSeedTracks),
    [firestoreTracks, visibleSeedTracks]
  );

  const allPhotos = useMemo(
    () => (firestorePhotos.length > 0 ? firestorePhotos : visibleSeedPhotos),
    [firestorePhotos, visibleSeedPhotos]
  );

  // Local Intl.DisplayNames map for all track countries and languages (zero API quota)
  const localIntlTerms = useMemo(() => {
    const map: Record<string, string> = {};
    if (currentLang === 'es') return map;
    for (const tr of allTracks) {
      if (tr.country && tr.countryCode) {
        const localizedCountry = translateCountryByCode(tr.countryCode, currentLang);
        if (localizedCountry) map[tr.country] = localizedCountry;
      }
      if (tr.language && tr.languageCode) {
        const localizedLang = translateLanguageByCode(tr.languageCode, currentLang);
        if (localizedLang) map[tr.language] = localizedLang;
      }
    }
    return map;
  }, [allTracks, currentLang]);

  // Prioritize profile terms first (when not already pre-translated for currentLang), then tracks & captions
  const dynamicTerms = useMemo(() => {
    const set = new Set<string>();
    const hasPreTranslatedProfile = Boolean(
      currentLang !== 'es' &&
        savedProfile?.translations?.[currentLang]?.personalitySummary?.trim() &&
        savedProfile?.translations?.[currentLang]?.musicalTasteSummary?.trim()
    );

    if (savedProfile && !hasPreTranslatedProfile) {
      if (savedProfile.personalitySummary) set.add(savedProfile.personalitySummary);
      if (savedProfile.musicalTasteSummary) set.add(savedProfile.musicalTasteSummary);
      for (const trait of savedProfile.keyTraits) {
        if (trait) set.add(trait);
      }
    }
    for (const tr of allTracks) {
      if (tr.country && !localIntlTerms[tr.country]) set.add(tr.country);
      if (tr.language && !localIntlTerms[tr.language]) set.add(tr.language);
      if (tr.genre) set.add(tr.genre);
      if (tr.curatorNote) set.add(tr.curatorNote);
    }
    for (const ph of allPhotos) {
      if (ph.caption) set.add(ph.caption);
    }
    return Array.from(set);
  }, [allTracks, allPhotos, savedProfile, localIntlTerms, currentLang]);

  // Automatic translation & transliteration when visitor language != 'es' (with static-host fallback)
  useEffect(() => {
    const langMeta = LANGUAGE_OPTIONS.find((l) => l.code === currentLang);
    document.documentElement.lang = currentLang;
    document.documentElement.dir = langMeta?.dir ?? 'ltr';

    if (currentLang === 'es') return;

    const staticDict = STATIC_UI_DICTIONARIES[currentLang];
    const staticTerms = STATIC_TERM_TRANSLATIONS[currentLang] ?? {};
    const storageKey = `jm_i18n_v2_${currentLang}`;

    let storedPayload: CachedTranslationPayload | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        storedPayload = JSON.parse(stored) as CachedTranslationPayload;
      }
    } catch {
      // Ignore storage parsing errors
    }

    const knownTerms: Record<string, string> = {
      ...(storedPayload?.translatedTerms ?? {}),
      ...(aiCache[currentLang]?.translatedTerms ?? {}),
    };

    const missingTerms = dynamicTerms.filter((term) => {
      const trimmed = term.trim();
      return (
        !staticTerms[term] &&
        !staticTerms[trimmed] &&
        !knownTerms[term] &&
        !knownTerms[trimmed]
      );
    });
    const needsUiTranslation =
      !staticDict &&
      !aiCache[currentLang]?.translatedUi?.navPhotos &&
      !storedPayload?.translatedUi?.navPhotos;

    if (storedPayload && !aiCache[currentLang]) {
      setAiCache((prev) => ({ ...prev, [currentLang]: storedPayload! }));
    }

    if (!needsUiTranslation && missingTerms.length === 0) return;

    let cancelled = false;
    const abortController = new AbortController();
    setIsTranslating(true);

    const runTranslation = async () => {
      let nextTransliterated = storedPayload?.transliteratedName || OWNER_SPANISH_NAME;
      let nextScriptLabel = storedPayload?.scriptLabel || currentLang;
      let nextUi: Record<string, string> = {};
      const nextTerms: Record<string, string> = {};

      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            targetLanguage: langMeta ? `${langMeta.englishName} (${currentLang})` : currentLang,
            ownerName: OWNER_SPANISH_NAME,
            uiStrings: needsUiTranslation ? BASE_UI_STRINGS : {},
            terms: missingTerms,
          }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const payload = (await res.json()) as CachedTranslationPayload & { quotaFallback?: boolean };
          if (payload.transliteratedName) nextTransliterated = payload.transliteratedName;
          if (payload.scriptLabel) nextScriptLabel = payload.scriptLabel;
          if (payload.translatedUi) nextUi = payload.translatedUi;
          if (payload.translatedTerms) Object.assign(nextTerms, payload.translatedTerms);
        }
      } catch {
        // Static deployment or offline /api/translate -> handled by fallback below
      }

      if (cancelled) return;

      const stillUntranslated = missingTerms.filter(
        (term) => !nextTerms[term] && !nextTerms[term.trim()]
      );
      if (stillUntranslated.length > 0) {
        const fallbackMap = await translateTermsPublicFallback(stillUntranslated, currentLang);
        Object.assign(nextTerms, fallbackMap);
      }

      if (cancelled) return;

      setAiCache((prev) => {
        const existing = prev[currentLang] ?? storedPayload ?? undefined;
        const merged: CachedTranslationPayload = {
          transliteratedName: nextTransliterated || existing?.transliteratedName || OWNER_SPANISH_NAME,
          scriptLabel: nextScriptLabel || existing?.scriptLabel || currentLang,
          translatedUi: { ...(existing?.translatedUi ?? {}), ...nextUi },
          translatedTerms: { ...(existing?.translatedTerms ?? {}), ...nextTerms },
        };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(merged));
        } catch {
          // Ignore storage quota errors
        }
        return { ...prev, [currentLang]: merged };
      });
    };

    const timerId = window.setTimeout(() => {
      if (cancelled) return;
      runTranslation().finally(() => {
        if (!cancelled) setIsTranslating(false);
      });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      abortController.abort();
    };
  }, [currentLang, dynamicTerms]);

  // Automatic song title translation & cross-script transliteration for ALL languages (including 'es')
  useEffect(() => {
    if (allTracks.length === 0) return;

    const langMeta = LANGUAGE_OPTIONS.find((l) => l.code === currentLang);
    const storageKey = `jm_title_i18n_v1_${currentLang}`;

    let storedMap: Record<string, TitleAnnotation> = {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, TitleAnnotation>;
        if (parsed && typeof parsed === 'object') storedMap = parsed;
      }
    } catch {
      // Ignore storage errors
    }

    const inMemory = titleAnnotationsCache[currentLang] ?? {};
    if (Object.keys(storedMap).length > 0 && !titleAnnotationsCache[currentLang]) {
      setTitleAnnotationsCache((prev) => ({
        ...prev,
        [currentLang]: { ...storedMap, ...(prev[currentLang] ?? {}) },
      }));
    }

    const knownMap: Record<string, TitleAnnotation> = { ...storedMap, ...inMemory };

    const missingItems = Array.from(
      new Map(
        allTracks
          .filter((tr) => {
            const cleanTitle = tr.title.trim();
            if (!cleanTitle) return false;
            if (isTrackAlreadyInTargetLanguage(tr, currentLang)) return false;
            return !knownMap[cleanTitle];
          })
          .map((tr) => [
            tr.title.trim(),
            {
              title: tr.title.trim(),
              artist: tr.artist,
              language: tr.language,
              languageCode: tr.languageCode,
            },
          ])
      ).values()
    );

    if (missingItems.length === 0) return;

    let cancelled = false;
    const abortController = new AbortController();

    const runTitleLocalization = async () => {
      const nextMap: Record<string, TitleAnnotation> = {};

      try {
        const res = await fetch('/api/translate-titles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            targetLanguage: langMeta ? `${langMeta.englishName} (${currentLang})` : currentLang,
            targetLangCode: currentLang,
            items: missingItems,
          }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = (await res.json()) as {
            annotations?: Record<string, TitleAnnotation>;
          };
          if (data.annotations && typeof data.annotations === 'object') {
            Object.assign(nextMap, data.annotations);
          }
        }
      } catch {
        // Static deployment or offline /api/translate-titles -> handled by fallback below
      }

      if (cancelled) return;

      const stillMissing = missingItems.filter((item) => !nextMap[item.title]);
      if (stillMissing.length > 0) {
        const fallbackMap = await localizeSongTitlesPublicFallback(stillMissing, currentLang);
        Object.assign(nextMap, fallbackMap);
      }

      if (cancelled || Object.keys(nextMap).length === 0) return;

      setTitleAnnotationsCache((prev) => {
        const merged = {
          ...storedMap,
          ...(prev[currentLang] ?? {}),
          ...nextMap,
        };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(merged));
        } catch {
          // Ignore storage quota errors
        }
        return { ...prev, [currentLang]: merged };
      });
    };

    const timerId = window.setTimeout(() => {
      if (!cancelled) {
        runTitleLocalization();
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      abortController.abort();
    };
  }, [currentLang, allTracks]);

  const handleChangeLang = useCallback((langCode: string) => {
    setCurrentLang(langCode);
    try {
      window.localStorage.setItem('jm_lang', langCode);
    } catch {
      // Ignore
    }
  }, []);

  const t = useCallback(
    (key: UiStringKey): string => {
      if (currentLang === 'es') return BASE_UI_STRINGS[key];
      const staticVal = STATIC_UI_DICTIONARIES[currentLang]?.[key];
      if (staticVal) return staticVal;
      const aiVal = aiCache[currentLang]?.translatedUi?.[key];
      if (aiVal) return aiVal;
      return BASE_UI_STRINGS[key];
    },
    [currentLang, aiCache]
  );

  const translateTerm = useCallback(
    (term: string): string => {
      if (!term || currentLang === 'es') return term;
      const trimmed = term.trim();
      return (
        localIntlTerms[term] ||
        localIntlTerms[trimmed] ||
        STATIC_TERM_TRANSLATIONS[currentLang]?.[term] ||
        STATIC_TERM_TRANSLATIONS[currentLang]?.[trimmed] ||
        aiCache[currentLang]?.translatedTerms?.[term] ||
        aiCache[currentLang]?.translatedTerms?.[trimmed] ||
        term
      );
    },
    [currentLang, localIntlTerms, aiCache]
  );

  const transliteration: TransliterationInfo = useMemo(() => {
    if (currentLang === 'es') return STATIC_TRANSLITERATIONS.es;
    if (aiCache[currentLang]?.transliteratedName) {
      return {
        transliteratedName: aiCache[currentLang].transliteratedName,
        scriptLabel: aiCache[currentLang].scriptLabel,
      };
    }
    return (
      STATIC_TRANSLITERATIONS[currentLang] ?? {
        transliteratedName: OWNER_SPANISH_NAME,
        scriptLabel: currentLang.toUpperCase(),
      }
    );
  }, [currentLang, aiCache]);

  const countryGroups = useMemo(() => groupTracksByCountry(allTracks), [allTracks]);
  const languageGroups = useMemo(() => groupTracksByLanguage(allTracks), [allTracks]);
  const genres = useMemo(
    () => Array.from(new Set(allTracks.map((tr) => tr.genre).filter(Boolean))).sort(),
    [allTracks]
  );

  const getTitleGloss = useCallback(
    (track: Track): string | null => {
      const cleanTitle = track.title.trim();
      const annotation = titleAnnotationsCache[currentLang]?.[cleanTitle];
      return resolveTitleGloss(cleanTitle, currentLang, annotation, track.languageCode);
    },
    [titleAnnotationsCache, currentLang]
  );

  const titleGlossByTrackId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tr of allTracks) {
      const gloss = getTitleGloss(tr);
      if (gloss) map[tr.id] = gloss;
    }
    return map;
  }, [allTracks, getTitleGloss]);

  useEffect(() => {
    saveVisitorLibrary(visitorLibrary);
  }, [visitorLibrary]);

  const likedTracks = useMemo(
    () => resolveLibraryTracks(visitorLibrary.likedTrackIds, allTracks),
    [visitorLibrary.likedTrackIds, allTracks]
  );

  const historyTracks = useMemo(
    () => resolveLibraryTracks(visitorLibrary.historyTrackIds, allTracks),
    [visitorLibrary.historyTrackIds, allTracks]
  );

  const visitorPlaylistsResolved = useMemo(
    () =>
      visitorLibrary.playlists.map((playlist) => ({
        playlist,
        tracks: resolveLibraryTracks(playlist.trackIds, allTracks),
      })),
    [visitorLibrary.playlists, allTracks]
  );

  const selectedPersonalTrackIds = useMemo(() => {
    if (mode !== 'my-playlists' || !selectedKey) return undefined;
    if (selectedKey === LIKED_VIRTUAL_PLAYLIST_ID) return visitorLibrary.likedTrackIds;
    if (selectedKey === HISTORY_VIRTUAL_PLAYLIST_ID) return visitorLibrary.historyTrackIds;
    return visitorLibrary.playlists.find((pl) => pl.id === selectedKey)?.trackIds ?? [];
  }, [mode, selectedKey, visitorLibrary]);

  const filteredTracks = useMemo(
    () =>
      filterTracks(allTracks, {
        mode,
        selectedKey,
        genre: selectedGenre,
        query: searchQuery,
        titleGlosses: titleGlossByTrackId,
        visitorSelectedTrackIds: selectedPersonalTrackIds,
      }),
    [allTracks, mode, selectedKey, selectedGenre, searchQuery, titleGlossByTrackId, selectedPersonalTrackIds]
  );

  const activeTrack = useMemo(
    () => (activeTrackId ? allTracks.find((tr) => tr.id === activeTrackId) ?? null : null),
    [allTracks, activeTrackId]
  );

  const queue = filteredTracks.length > 0 ? filteredTracks : allTracks;
  const activeQueueIndex = activeTrack ? queue.findIndex((tr) => tr.id === activeTrack.id) : -1;

  const activePersonalAudioInfo = useMemo(() => {
    if (!activePersonalAudioId) return null;
    if (activePersonalAudioId === LIKED_VIRTUAL_PLAYLIST_ID) {
      return likedTracks.length > 0
        ? { id: LIKED_VIRTUAL_PLAYLIST_ID, name: t('likedSongsPlaylistName'), tracks: likedTracks }
        : null;
    }
    if (activePersonalAudioId === HISTORY_VIRTUAL_PLAYLIST_ID) {
      return historyTracks.length > 0
        ? { id: HISTORY_VIRTUAL_PLAYLIST_ID, name: t('recentHistoryTitle'), tracks: historyTracks }
        : null;
    }
    const found = visitorPlaylistsResolved.find((item) => item.playlist.id === activePersonalAudioId);
    if (!found || found.tracks.length === 0) return null;
    return {
      id: found.playlist.id,
      name: found.playlist.name,
      tracks: found.tracks,
    };
  }, [activePersonalAudioId, likedTracks, historyTracks, visitorPlaylistsResolved, t]);

  const audioSourceTracks = activePersonalAudioInfo ? activePersonalAudioInfo.tracks : allTracks;

  const currentAudioTrack = useMemo(() => {
    if (audioTrackId) {
      const foundInSource = audioSourceTracks.find((tr) => tr.id === audioTrackId);
      if (foundInSource) return foundInSource;
      if (!activePersonalAudioInfo) {
        const foundAny = allTracks.find((tr) => tr.id === audioTrackId);
        if (foundAny) return foundAny;
      }
    }
    return audioSourceTracks[0] ?? allTracks[0] ?? null;
  }, [audioSourceTracks, allTracks, audioTrackId, activePersonalAudioInfo]);

  const audioAnchorTrack = useMemo(() => {
    if (audioAnchorTrackId) {
      const found = audioSourceTracks.find((tr) => tr.id === audioAnchorTrackId);
      if (found) return found;
    }
    return currentAudioTrack;
  }, [audioSourceTracks, audioAnchorTrackId, currentAudioTrack]);

  const audioQueue = useMemo(
    () => buildAudioQueue(audioSourceTracks, audioAnchorTrack, audioPlayMode, radioSeed),
    [audioSourceTracks, audioAnchorTrack, audioPlayMode, radioSeed]
  );

  const playlistModalTrack = useMemo(
    () => (playlistModalTrackId ? allTracks.find((tr) => tr.id === playlistModalTrackId) ?? null : null),
    [allTracks, playlistModalTrackId]
  );

  const isTrackLiked = useCallback(
    (trackId: string) => visitorLibrary.likedTrackIds.includes(trackId),
    [visitorLibrary.likedTrackIds]
  );

  const handleToggleLike = useCallback((trackId: string) => {
    setVisitorLibrary((prev) => toggleLikedTrack(prev, trackId));
  }, []);

  const handleCreatePlaylist = useCallback((name: string) => {
    setVisitorLibrary((prev) => {
      const { state, createdPlaylist } = createVisitorPlaylist(prev, name);
      if (createdPlaylist) {
        setSelectedKey(createdPlaylist.id);
      }
      return state;
    });
  }, []);

  const handleCreatePlaylistWithTrack = useCallback((name: string, trackId: string) => {
    setVisitorLibrary((prev) => createVisitorPlaylist(prev, name, trackId).state);
  }, []);

  const handleToggleTrackInPlaylist = useCallback((playlistId: string, trackId: string) => {
    setVisitorLibrary((prev) => toggleTrackInPlaylist(prev, playlistId, trackId));
  }, []);

  const handleRenamePlaylist = useCallback((playlistId: string, name: string) => {
    setVisitorLibrary((prev) => renameVisitorPlaylist(prev, playlistId, name));
  }, []);

  const handleDeletePlaylist = useCallback((playlistId: string) => {
    setVisitorLibrary((prev) => deleteVisitorPlaylist(prev, playlistId));
    setSelectedKey((prev) => (prev === playlistId ? null : prev));
    setActivePersonalAudioId((prev) => (prev === playlistId ? null : prev));
  }, []);

  const handlePlayPersonalAudio = useCallback(
    (playlistId: string, _playlistName: string, tracks: Track[]) => {
      if (tracks.length === 0) return;
      setActiveTrackId(null);
      setActivePersonalAudioId(playlistId);
      setAudioTrackId(tracks[0].id);
      setAudioAnchorTrackId(tracks[0].id);
      setAudioPlaybackStatus('playing');
      setVisitorLibrary((prev) => recordListeningHistory(prev, tracks[0].id));
      document.getElementById('audio-player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    []
  );

  useEffect(() => {
    if (audioPlaybackStatus === 'playing' && currentAudioTrack) {
      setVisitorLibrary((prev) => recordListeningHistory(prev, currentAudioTrack.id));
    }
  }, [audioPlaybackStatus, currentAudioTrack]);

  const handleAudioPlayPause = useCallback(() => {
    if (!currentAudioTrack) return;
    setActiveTrackId(null);
    setAudioTrackId(currentAudioTrack.id);
    if (!audioAnchorTrackId) setAudioAnchorTrackId(currentAudioTrack.id);
    setAudioPlaybackStatus((prev) => (prev === 'playing' ? 'paused' : 'playing'));
  }, [currentAudioTrack, audioAnchorTrackId]);

  const handleAudioStop = useCallback(() => {
    setAudioPlaybackStatus('stopped');
  }, []);

  const handleAudioPrevious = useCallback(() => {
    const prevTrack = getAdjacentAudioTrack(audioQueue, currentAudioTrack?.id ?? null, -1, true);
    if (!prevTrack) return;
    setActiveTrackId(null);
    setAudioTrackId(prevTrack.id);
    if (audioPlayMode === 'ordered') {
      setAudioAnchorTrackId(prevTrack.id);
    }
    setAudioPlaybackStatus('playing');
  }, [audioQueue, currentAudioTrack?.id, audioPlayMode]);

  const handleAudioNext = useCallback(() => {
    const nextTrack = getAdjacentAudioTrack(audioQueue, currentAudioTrack?.id ?? null, 1, true);
    if (!nextTrack) return;
    setActiveTrackId(null);
    setAudioTrackId(nextTrack.id);
    if (audioPlayMode === 'ordered') {
      setAudioAnchorTrackId(nextTrack.id);
    }
    setAudioPlaybackStatus('playing');
  }, [audioQueue, currentAudioTrack?.id, audioPlayMode]);

  const handleAudioSelectMode = useCallback(
    (nextMode: AudioPlayMode) => {
      if (!currentAudioTrack) return;
      setActiveTrackId(null);
      setAudioTrackId(currentAudioTrack.id);
      setAudioAnchorTrackId(currentAudioTrack.id);
      setAudioPlayMode(nextMode);
      if (nextMode === 'radio') {
        setRadioSeed((prev) => prev + 1);
      }
      if (nextMode !== 'ordered') {
        setAudioPlaybackStatus('playing');
      }
    },
    [currentAudioTrack]
  );

  const handleAudioSelectTrack = useCallback((track: Track) => {
    setActiveTrackId(null);
    setAudioTrackId(track.id);
    setAudioAnchorTrackId(track.id);
    setAudioPlaybackStatus('playing');
  }, []);

  const handleAudioTrackEnded = useCallback(() => {
    const currentIdx = currentAudioTrack
      ? audioQueue.findIndex((tr) => tr.id === currentAudioTrack.id)
      : -1;
    const isAtEndOfRadio =
      audioPlayMode === 'radio' && currentIdx >= 0 && currentIdx === audioQueue.length - 1;

    if (isAtEndOfRadio) {
      const nextSeed = radioSeed + 1;
      setRadioSeed(nextSeed);
      const nextQueue = buildAudioQueue(audioSourceTracks, currentAudioTrack, 'radio', nextSeed);
      const candidate = nextQueue.find((tr) => tr.id !== currentAudioTrack?.id) ?? nextQueue[0];
      if (candidate) {
        setAudioTrackId(candidate.id);
        setAudioAnchorTrackId(candidate.id);
        setAudioPlaybackStatus('playing');
      }
      return;
    }

    const nextTrack = getAdjacentAudioTrack(audioQueue, currentAudioTrack?.id ?? null, 1, true);
    if (!nextTrack) return;
    setAudioTrackId(nextTrack.id);
    setAudioPlaybackStatus('playing');
  }, [audioPlayMode, audioQueue, currentAudioTrack, radioSeed, audioSourceTracks]);

  const handlePlayTrack = (track: Track) => {
    setAudioPlaybackStatus((prev) => (prev === 'playing' ? 'paused' : prev));
    setAudioTrackId(track.id);
    setAudioAnchorTrackId(track.id);
    setActiveTrackId(track.id);
    setAutoplayPlayer(true);
    setVisitorLibrary((prev) => recordListeningHistory(prev, track.id));
    document.getElementById('player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handlePlayPlaylist = (group: PlaylistGroup) => {
    setSelectedKey(group.key);
    if (group.tracks[0]) {
      setAudioPlaybackStatus((prev) => (prev === 'playing' ? 'paused' : prev));
      setAudioTrackId(group.tracks[0].id);
      setAudioAnchorTrackId(group.tracks[0].id);
      setActiveTrackId(group.tracks[0].id);
      setAutoplayPlayer(true);
      document.getElementById('player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handlePrevious = () => {
    if (activeQueueIndex > 0) {
      setActiveTrackId(queue[activeQueueIndex - 1].id);
      setAutoplayPlayer(true);
    }
  };

  const handleNext = () => {
    if (activeQueueIndex >= 0 && activeQueueIndex < queue.length - 1) {
      setActiveTrackId(queue[activeQueueIndex + 1].id);
      setAutoplayPlayer(true);
    }
  };

  const handleModeChange = (nextMode: PlaylistMode) => {
    setMode(nextMode);
    setSelectedKey(null);
  };

  // Sync top-bar hash links (#playlists / #playlists-language / #my-playlists) with playlist mode
  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === '#playlists-language') {
        setMode('language');
        setSelectedKey(null);
      } else if (window.location.hash === '#my-playlists') {
        setMode('my-playlists');
        setSelectedKey(null);
      } else if (window.location.hash === '#playlists') {
        setMode('country');
        setSelectedKey(null);
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const handleSignIn = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handlePublishTrack = async (video: AnalyzedVideoResult) => {
    if (!user || !isOwner) throw new Error('Solo Joan Manuel puede publicar canciones.');
    try {
      const normalizedCountryCode = normalizeCountryCodesList(video.countryCode, 'AR');
      const normalizedLangCode = normalizeLanguageCodesList(video.languageCode, 'es');
      const isRemix = Boolean(
        video.isRemix ||
          normalizedCountryCode.includes(',') ||
          normalizedLangCode.includes(',') ||
          /\bremix\b/i.test(video.title) ||
          /\bremix\b/i.test(video.genre)
      );

      const docRef = await addDoc(collection(db, 'tracks'), {
        ownerId: user.uid,
        youtubeId: video.youtubeId,
        youtubeUrl: video.youtubeUrl,
        title: video.title,
        artist: video.artist,
        country: video.country,
        countryCode: normalizedCountryCode,
        language: video.language,
        languageCode: normalizedLangCode,
        genre: video.genre,
        isRemix,
        curatorNote: video.curatorNote || '',
        thumbnailUrl: video.thumbnailUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveTrackId(docRef.id);
      setAutoplayPlayer(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tracks');
    }
  };

  const updateSiteConfig = async (nextTrackIds: string[], nextPhotoIds: string[]) => {
    if (!user || !isOwner) return;
    try {
      await setDoc(doc(db, 'siteConfig', 'main'), {
        ownerId: user.uid,
        hiddenSeedTrackIds: nextTrackIds.slice(0, 20),
        hiddenSeedPhotoIds: nextPhotoIds.slice(0, 20),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'siteConfig/main');
    }
  };

  const handleDeleteTrack = async (track: Track) => {
    if (!isOwner) return;
    if (track.isSeed) {
      const nextIds = Array.from(new Set([...hiddenSeedTrackIds, track.id]));
      setHiddenSeedTrackIds(nextIds);
      await updateSiteConfig(nextIds, hiddenSeedPhotoIds);
      return;
    }
    try {
      await deleteDoc(doc(db, 'tracks', track.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tracks/${track.id}`);
    }
  };

  const handleUploadPhoto = async (imageData: string, caption: string) => {
    if (!user || !isOwner) throw new Error('Solo Joan Manuel puede subir fotos.');
    try {
      await addDoc(collection(db, 'photos'), {
        ownerId: user.uid,
        imageData,
        caption,
        order: firestorePhotos.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'photos');
    }
  };

  const handleDeletePhoto = async (photo: Photo) => {
    if (!isOwner) return;
    if (photo.isSeed) {
      const nextIds = Array.from(new Set([...hiddenSeedPhotoIds, photo.id]));
      setHiddenSeedPhotoIds(nextIds);
      await updateSiteConfig(hiddenSeedTrackIds, nextIds);
      return;
    }
    try {
      await deleteDoc(doc(db, 'photos', photo.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `photos/${photo.id}`);
    }
  };

  const handleClearDefaultTracks = async () => {
    const allSeedIds = SEED_TRACKS.map((tr) => tr.id);
    setHiddenSeedTrackIds(allSeedIds);
    await updateSiteConfig(allSeedIds, hiddenSeedPhotoIds);
  };

  const handleClearDefaultPhotos = async () => {
    const allSeedIds = SEED_PHOTOS.map((ph) => ph.id);
    setHiddenSeedPhotoIds(allSeedIds);
    await updateSiteConfig(hiddenSeedTrackIds, allSeedIds);
  };

  const handleGenerateProfile = async (): Promise<GeneratedProfileDraft> => {
    if (!user || !isOwner) throw new Error('Solo Joan Manuel puede generar su perfil.');
    if (allTracks.length === 0) {
      throw new Error('Agrega al menos una canción antes de generar tu análisis.');
    }

    try {
      const response = await fetch('/api/analyze-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: allTracks.map((tr) => ({
            title: tr.title,
            artist: tr.artist,
            country: tr.country,
            language: tr.language,
            genre: tr.genre,
            curatorNote: tr.curatorNote ?? '',
          })),
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        return buildFallbackPsychologicalProfile(allTracks);
      }
      const data = (await response.json()) as GeneratedProfileDraft;
      return data;
    } catch {
      return buildFallbackPsychologicalProfile(allTracks);
    }
  };

  const handleSaveProfile = async (draft: GeneratedProfileDraft): Promise<void> => {
    if (!user || !isOwner) throw new Error('Solo Joan Manuel puede guardar este perfil.');
    let translations = draft.translations;
    if (!translations || Object.keys(translations).length === 0) {
      try {
        const res = await fetch('/api/translate-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalitySummary: draft.personalitySummary.slice(0, 1500),
            musicalTasteSummary: draft.musicalTasteSummary.slice(0, 1500),
            keyTraits: draft.keyTraits.map((s) => s.slice(0, 120)).slice(0, 6),
          }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = (await res.json()) as { translations?: Record<string, ProfileTranslation> };
          if (data.translations && Object.keys(data.translations).length > 0) {
            translations = data.translations;
          }
        }
      } catch {
        // Ignore if running on static host; client visitors automatically translate via public fallback
      }
    }

    try {
      const profileRef = doc(db, 'profile', 'main');
      const existingSnap = await getDoc(profileRef);
      const createdAtVal = existingSnap.exists()
        ? existingSnap.data().createdAt
        : serverTimestamp();
      const payload: Record<string, unknown> = {
        ownerId: user.uid,
        personalitySummary: draft.personalitySummary.slice(0, 1500),
        musicalTasteSummary: draft.musicalTasteSummary.slice(0, 1500),
        keyTraits: draft.keyTraits.map((s) => s.slice(0, 120)).slice(0, 6),
        trackCount: Math.max(0, Math.min(5000, Math.round(draft.trackCount))),
        createdAt: createdAtVal,
        updatedAt: serverTimestamp(),
      };
      if (translations && Object.keys(translations).length > 0) {
        payload.translations = translations;
      }
      await setDoc(profileRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'profile/main');
    }
  };

  const handleUpdateCustomShareUrl = useCallback((nextUrl: string) => {
    setCustomShareUrl(nextUrl);
    try {
      if (nextUrl.trim()) {
        window.localStorage.setItem('jm_custom_share_url', nextUrl.trim());
      } else {
        window.localStorage.removeItem('jm_custom_share_url');
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const currentBrowserUrl =
    typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const shareUrl = useMemo(
    () => resolvePublicShareUrl(currentBrowserUrl, serverPublicUrl || PUBLIC_SHARE_URL, customShareUrl),
    [currentBrowserUrl, serverPublicUrl, customShareUrl]
  );
  const isPrivatePreview = isPrivateDevUrl(shareUrl);

  const activePlaylistLabel = useMemo(() => {
    if (!selectedKey) return null;
    const list = mode === 'country' ? countryGroups : languageGroups;
    const found = list.find((g) => g.key === selectedKey);
    return found ? translateTerm(found.label) : null;
  }, [selectedKey, mode, countryGroups, languageGroups, translateTerm]);

  return (
    <div className="min-h-screen bg-white text-zinc-950 flex flex-col transition-colors dark:bg-zinc-950 dark:text-zinc-50">
      <Header
        t={t}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenQr={() => setQrModalOpen(true)}
      />

      <main className="flex-1">
        <HeroPhotoSection
          t={t}
          currentLang={currentLang}
          onChangeLang={handleChangeLang}
          isTranslating={isTranslating}
          transliteration={transliteration}
          totalTracks={allTracks.length}
          isOwner={isOwner}
          ownerTotalVisits={ownerTotalVisits}
          onOpenOwnerStudio={(tab = 'video') => {
            setOwnerModalTab(tab);
            setOwnerModalOpen(true);
          }}
        />

        <StagePlayer
          t={t}
          activeTrack={activeTrack}
          autoplay={autoplayPlayer}
          activePlaylistLabel={activePlaylistLabel}
          hasPrevious={activeQueueIndex > 0}
          hasNext={activeQueueIndex >= 0 && activeQueueIndex < queue.length - 1}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onClosePlayer={() => setActiveTrackId(null)}
          translateTerm={translateTerm}
          getTitleGloss={getTitleGloss}
          isLiked={activeTrack ? isTrackLiked(activeTrack.id) : false}
          onToggleLike={() => {
            if (activeTrack) handleToggleLike(activeTrack.id);
          }}
          onOpenAddToPlaylist={() => {
            if (activeTrack) setPlaylistModalTrackId(activeTrack.id);
          }}
        />

        <AudioDeckPlayer
          t={t}
          activeTrack={currentAudioTrack}
          queue={audioQueue}
          playMode={audioPlayMode}
          playbackStatus={audioPlaybackStatus}
          onPlayPause={handleAudioPlayPause}
          onStop={handleAudioStop}
          onPrevious={handleAudioPrevious}
          onNext={handleAudioNext}
          onSelectMode={handleAudioSelectMode}
          onTrackEnded={handleAudioTrackEnded}
          onSyncExternalPlaybackState={setAudioPlaybackStatus}
          tracks={audioSourceTracks}
          onSelectTrack={handleAudioSelectTrack}
          translateTerm={translateTerm}
          getTitleGloss={getTitleGloss}
          isTrackLiked={isTrackLiked}
          onToggleLike={handleToggleLike}
          onOpenAddToPlaylist={(track) => setPlaylistModalTrackId(track.id)}
          activePersonalPlaylistName={activePersonalAudioInfo?.name ?? null}
          onClearPersonalPlaylist={() => setActivePersonalAudioId(null)}
        />

        <PlaylistExplorer
          t={t}
          mode={mode}
          onChangeMode={handleModeChange}
          selectedKey={selectedKey}
          onSelectGroup={setSelectedKey}
          onPlayPlaylist={handlePlayPlaylist}
          countryGroups={countryGroups}
          languageGroups={languageGroups}
          genres={genres}
          selectedGenre={selectedGenre}
          onChangeGenre={setSelectedGenre}
          searchQuery={searchQuery}
          onChangeSearch={setSearchQuery}
          filteredTracks={filteredTracks}
          activeTrackId={activeTrack?.id ?? null}
          onPlayTrack={handlePlayTrack}
          isOwner={isOwner}
          onDeleteTrack={handleDeleteTrack}
          onOpenAddVideo={() => {
            setOwnerModalTab('video');
            setOwnerModalOpen(true);
          }}
          hasAnyTracks={allTracks.length > 0}
          translateTerm={translateTerm}
          getTitleGloss={getTitleGloss}
          isTrackLiked={isTrackLiked}
          onToggleLike={handleToggleLike}
          onOpenAddToPlaylist={(track) => setPlaylistModalTrackId(track.id)}
          likedTracks={likedTracks}
          historyTracks={historyTracks}
          visitorPlaylists={visitorLibrary.playlists}
          visitorPlaylistsResolved={visitorPlaylistsResolved}
          onCreatePlaylist={handleCreatePlaylist}
          onRenamePlaylist={handleRenamePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
          onRemoveTrackFromPlaylist={handleToggleTrackInPlaylist}
          onPlayPersonalAudio={handlePlayPersonalAudio}
        />

        <PhotoGallerySection
          t={t}
          photos={allPhotos}
          isOwner={isOwner}
          onOpenUploadPhoto={() => {
            setOwnerModalTab('photo');
            setOwnerModalOpen(true);
          }}
          onSelectPhoto={(idx) => setLightboxIndex(idx)}
          onDeletePhoto={handleDeletePhoto}
          translateTerm={translateTerm}
          currentLang={currentLang}
          savedProfile={savedProfile}
          hasAnyTracks={allTracks.length > 0}
          onGenerateProfile={handleGenerateProfile}
          onSaveProfile={handleSaveProfile}
        />

        {/* Inline QR Cross-Device Save Section */}
        <section className="border-t border-zinc-200 bg-[#F6F7F9] transition-colors dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
            <div className="max-w-lg space-y-2 text-center sm:text-left">
              <h2 className="font-display text-2xl font-bold text-zinc-950 dark:text-zinc-50">{t('qrModalTitle')}</h2>
              <p className="text-sm text-zinc-600 leading-relaxed dark:text-zinc-400">{t('qrModalSubtitle')}</p>
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 cursor-pointer dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                <span>{t('navQr')}</span>
              </button>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-xs shrink-0 dark:border-zinc-700">
              <QRCodeSVG value={shareUrl} size={112} level="M" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white transition-colors dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-zinc-500 dark:text-zinc-400">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {OWNER_SPANISH_NAME} · {t('heroSubtitle')}
          </p>
          <p className="font-mono tabular-nums">
            {allTracks.length} {allTracks.length === 1 ? t('songsCountSingle') : t('songsCountPlural')}
          </p>
        </div>
      </footer>

      <QrShareModal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        t={t}
        shareUrl={shareUrl}
        isPrivatePreview={isPrivatePreview}
        isOwner={isOwner}
        customShareUrl={customShareUrl}
        onUpdateCustomShareUrl={handleUpdateCustomShareUrl}
      />

      <OwnerStudioModal
        key={ownerModalTab + (ownerModalOpen ? '-open' : '-closed')}
        open={ownerModalOpen}
        initialTab={ownerModalTab}
        onClose={() => setOwnerModalOpen(false)}
        t={t}
        currentLang={currentLang}
        user={user}
        isOwner={isOwner}
        existingTracks={allTracks}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onPublishTrack={handlePublishTrack}
        onUploadPhoto={handleUploadPhoto}
        hasDefaultTracks={visibleSeedTracks.length > 0}
        hasDefaultPhotos={visibleSeedPhotos.length > 0}
        onClearDefaultTracks={handleClearDefaultTracks}
        onClearDefaultPhotos={handleClearDefaultPhotos}
        visits={ownerVisits}
        totalVisitsCount={ownerTotalVisits}
        statsLoading={ownerStatsLoading}
        statsError={ownerStatsError}
        onRefreshStats={loadOwnerVisitStats}
      />

      <PhotoLightbox
        photos={allPhotos}
        activeIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChangeIndex={setLightboxIndex}
        closeLabel={t('close')}
        translateTerm={translateTerm}
      />

      <AddToPlaylistModal
        key={playlistModalTrack?.id ?? 'closed'}
        track={playlistModalTrack}
        onClose={() => setPlaylistModalTrackId(null)}
        t={t}
        library={visitorLibrary}
        onToggleLike={handleToggleLike}
        onToggleTrackInPlaylist={handleToggleTrackInPlaylist}
        onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
        getTitleGloss={getTitleGloss}
      />
    </div>
  );
}
