import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Header } from './components/Header';
import { HeroPhotoSection } from './components/HeroPhotoSection';
import { OwnerStudioModal } from './components/OwnerStudioModal';
import { PhotoGallerySection } from './components/PhotoGallerySection';
import { PhotoLightbox } from './components/PhotoLightbox';
import { PlaylistExplorer } from './components/PlaylistExplorer';
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
  type AnalyzedVideoResult,
  type Photo,
  type PlaylistGroup,
  type PlaylistMode,
  type Track,
  type TransliterationInfo,
} from './types';
import {
  filterTracks,
  groupTracksByCountry,
  groupTracksByLanguage,
  isPrivateDevUrl,
  normalizeLanguageCode,
  resolvePublicShareUrl,
  translateCountryByCode,
  translateLanguageByCode,
} from './utils/musicLogic';

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

  const [currentLang, setCurrentLang] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('jm_lang') : null;
    if (saved) return saved;
    const browser = typeof navigator !== 'undefined' ? navigator.language : 'es';
    return normalizeLanguageCode(browser);
  });

  const [aiCache, setAiCache] = useState<Record<string, CachedTranslationPayload>>({});
  const [isTranslating, setIsTranslating] = useState(false);

  const [mode, setMode] = useState<PlaylistMode>('country');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [autoplayPlayer, setAutoplayPlayer] = useState(false);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [ownerModalTab, setOwnerModalTab] = useState<'video' | 'photo'>('video');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [serverPublicUrl, setServerPublicUrl] = useState('');
  const [customShareUrl, setCustomShareUrl] = useState<string>(() => {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem('jm_custom_share_url') ?? '' : '';
    } catch {
      return '';
    }
  });

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

    return () => {
      unsubTracks();
      unsubPhotos();
      unsubConfig();
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

  // Only send genuinely untranslated non-country/non-language dynamic terms to Gemini
  const dynamicTerms = useMemo(() => {
    const set = new Set<string>();
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
  }, [allTracks, allPhotos, localIntlTerms]);

  // Automatic Gemini translation & transliteration when visitor language != 'es'
  useEffect(() => {
    const langMeta = LANGUAGE_OPTIONS.find((l) => l.code === currentLang);
    document.documentElement.lang = currentLang;
    document.documentElement.dir = langMeta?.dir ?? 'ltr';

    if (currentLang === 'es') return;

    const staticDict = STATIC_UI_DICTIONARIES[currentLang];
    const staticTerms = STATIC_TERM_TRANSLATIONS[currentLang] ?? {};
    const missingTerms = dynamicTerms.filter(
      (term) => !staticTerms[term] && !aiCache[currentLang]?.translatedTerms[term]
    );
    const needsUiTranslation = !staticDict && !aiCache[currentLang]?.translatedUi?.navPhotos;

    if (!needsUiTranslation && missingTerms.length === 0) return;

    const storageKey = `jm_i18n_v1_${currentLang}`;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedTranslationPayload;
        const stillMissing = dynamicTerms.filter(
          (term) => !staticTerms[term] && !parsed.translatedTerms?.[term]
        );
        if (!stillMissing.length && (staticDict || parsed.translatedUi?.navPhotos)) {
          setAiCache((prev) => ({ ...prev, [currentLang]: parsed }));
          return;
        }
      }
    } catch {
      // Ignore storage parsing errors
    }

    let cancelled = false;
    setIsTranslating(true);
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetLanguage: langMeta ? `${langMeta.englishName} (${currentLang})` : currentLang,
        ownerName: OWNER_SPANISH_NAME,
        uiStrings: needsUiTranslation ? BASE_UI_STRINGS : {},
        terms: missingTerms,
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Translation failed'))))
      .then((payload: CachedTranslationPayload) => {
        if (cancelled) return;
        setAiCache((prev) => {
          const existing = prev[currentLang];
          const merged: CachedTranslationPayload = {
            transliteratedName: payload.transliteratedName || existing?.transliteratedName || OWNER_SPANISH_NAME,
            scriptLabel: payload.scriptLabel || existing?.scriptLabel || currentLang,
            translatedUi: { ...(existing?.translatedUi ?? {}), ...(payload.translatedUi ?? {}) },
            translatedTerms: { ...(existing?.translatedTerms ?? {}), ...(payload.translatedTerms ?? {}) },
          };
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(merged));
          } catch {
            // Ignore storage quota errors
          }
          return { ...prev, [currentLang]: merged };
        });
      })
      .catch(() => {
        // Fallback gracefully to static dictionaries
      })
      .finally(() => {
        if (!cancelled) setIsTranslating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentLang, dynamicTerms]);

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
      return (
        localIntlTerms[term] ||
        STATIC_TERM_TRANSLATIONS[currentLang]?.[term] ||
        aiCache[currentLang]?.translatedTerms?.[term] ||
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

  const filteredTracks = useMemo(
    () =>
      filterTracks(allTracks, {
        mode,
        selectedKey,
        genre: selectedGenre,
        query: searchQuery,
      }),
    [allTracks, mode, selectedKey, selectedGenre, searchQuery]
  );

  const activeTrack = useMemo(
    () => (activeTrackId ? allTracks.find((tr) => tr.id === activeTrackId) ?? null : null),
    [allTracks, activeTrackId]
  );

  const queue = filteredTracks.length > 0 ? filteredTracks : allTracks;
  const activeQueueIndex = activeTrack ? queue.findIndex((tr) => tr.id === activeTrack.id) : -1;

  const handlePlayTrack = (track: Track) => {
    setActiveTrackId(track.id);
    setAutoplayPlayer(true);
    document.getElementById('player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handlePlayPlaylist = (group: PlaylistGroup) => {
    setSelectedKey(group.key);
    if (group.tracks[0]) {
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

  // Sync top-bar hash links (#playlists / #playlists-language) with playlist mode
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#playlists-language') {
        setMode('language');
        setSelectedKey(null);
      } else if (window.location.hash === '#playlists') {
        setMode('country');
        setSelectedKey(null);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
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
      const docRef = await addDoc(collection(db, 'tracks'), {
        ownerId: user.uid,
        youtubeId: video.youtubeId,
        youtubeUrl: video.youtubeUrl,
        title: video.title,
        artist: video.artist,
        country: video.country,
        countryCode: video.countryCode.toUpperCase().slice(0, 2),
        language: video.language,
        languageCode: video.languageCode.toLowerCase().slice(0, 10),
        genre: video.genre,
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
  const isPrivatePreview = isPrivateDevUrl(currentBrowserUrl);
  const shareUrl = useMemo(
    () => resolvePublicShareUrl(currentBrowserUrl, serverPublicUrl, customShareUrl),
    [currentBrowserUrl, serverPublicUrl, customShareUrl]
  );

  const activePlaylistLabel = useMemo(() => {
    if (!selectedKey) return null;
    const list = mode === 'country' ? countryGroups : languageGroups;
    const found = list.find((g) => g.key === selectedKey);
    return found ? translateTerm(found.label) : null;
  }, [selectedKey, mode, countryGroups, languageGroups, translateTerm]);

  return (
    <div className="min-h-screen bg-white text-zinc-950 flex flex-col">
      <Header t={t} onOpenQr={() => setQrModalOpen(true)} />

      <main className="flex-1">
        <HeroPhotoSection
          t={t}
          currentLang={currentLang}
          onChangeLang={handleChangeLang}
          isTranslating={isTranslating}
          transliteration={transliteration}
          isOwner={isOwner}
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
        />

        {/* Inline QR Cross-Device Save Section */}
        <section className="border-t border-zinc-200 bg-[#F6F7F9]">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
            <div className="max-w-lg space-y-2 text-center sm:text-left">
              <h2 className="font-display text-2xl font-bold text-zinc-950">{t('qrModalTitle')}</h2>
              <p className="text-sm text-zinc-600 leading-relaxed">{t('qrModalSubtitle')}</p>
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 cursor-pointer"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                <span>{t('navQr')}</span>
              </button>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-xs shrink-0">
              <QRCodeSVG value={shareUrl} size={112} level="M" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-zinc-500">
          <p className="font-medium text-zinc-700">
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
        user={user}
        isOwner={isOwner}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onPublishTrack={handlePublishTrack}
        onUploadPhoto={handleUploadPhoto}
        hasDefaultTracks={visibleSeedTracks.length > 0}
        hasDefaultPhotos={visibleSeedPhotos.length > 0}
        onClearDefaultTracks={handleClearDefaultTracks}
        onClearDefaultPhotos={handleClearDefaultPhotos}
      />

      <PhotoLightbox
        photos={allPhotos}
        activeIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChangeIndex={setLightboxIndex}
        closeLabel={t('close')}
        translateTerm={translateTerm}
      />
    </div>
  );
}
