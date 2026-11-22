import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, BarChart3, ChevronDown, ChevronUp, LogIn, LogOut, Sparkles, Upload, Video, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { UiStringKey } from '../data/translations';
import { OWNER_EMAIL, type AnalyzedVideoResult, type PageVisit, type Track } from '../types';
import { compressImageToDataUrl } from '../utils/imageHelper';
import {
  extractYouTubeId,
  findCatalogDuplicateGroups,
  findDuplicateTrackMatches,
  getCountryFlagEmoji,
  getYouTubeThumbnailUrl,
  resolveCountryCode,
  resolveLanguageCode,
  type DuplicateMatchType,
} from '../utils/musicLogic';
import { OwnerStatsPanel } from './OwnerStatsPanel';

interface OwnerStudioModalProps {
  open: boolean;
  initialTab: 'video' | 'photo' | 'stats';
  onClose: () => void;
  t: (key: UiStringKey) => string;
  currentLang?: string;
  user: User | null;
  isOwner: boolean;
  existingTracks?: Track[];
  initialYoutubeUrl?: string;
  initialAnalyzed?: AnalyzedVideoResult | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onPublishTrack: (video: AnalyzedVideoResult) => Promise<void>;
  onUploadPhoto: (imageData: string, caption: string) => Promise<void>;
  hasDefaultTracks: boolean;
  hasDefaultPhotos: boolean;
  onClearDefaultTracks: () => Promise<void>;
  onClearDefaultPhotos: () => Promise<void>;
  visits?: PageVisit[];
  totalVisitsCount?: number;
  statsLoading?: boolean;
  statsError?: string | null;
  onRefreshStats?: () => void;
}

function getDuplicateMatchHeading(
  matchType: DuplicateMatchType,
  t: (key: UiStringKey) => string
): string {
  if (matchType === 'exact-video') return t('duplicateVideoAlertTitle');
  if (matchType === 'same-song-artist') return t('duplicateSongArtistAlertTitle');
  return t('duplicateInterpretationAlertTitle');
}

function getDuplicateMatchTag(matchType: DuplicateMatchType): string {
  if (matchType === 'exact-video') return 'Mismo video';
  if (matchType === 'same-song-artist') return 'Misma canción y artista';
  return 'Otra interpretación';
}

export function OwnerStudioModal({
  open,
  initialTab,
  onClose,
  t,
  currentLang = 'es',
  user,
  isOwner,
  existingTracks = [],
  initialYoutubeUrl = '',
  initialAnalyzed = null,
  onSignIn,
  onSignOut,
  onPublishTrack,
  onUploadPhoto,
  hasDefaultTracks,
  hasDefaultPhotos,
  onClearDefaultTracks,
  onClearDefaultPhotos,
  visits = [],
  totalVisitsCount = 0,
  statsLoading = false,
  statsError = null,
  onRefreshStats,
}: OwnerStudioModalProps) {
  const [activeTab, setActiveTab] = useState<'video' | 'photo' | 'stats'>(initialTab);
  const [youtubeUrl, setYoutubeUrl] = useState(initialYoutubeUrl);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [analyzed, setAnalyzed] = useState<AnalyzedVideoResult | null>(initialAnalyzed);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [quotaNotice, setQuotaNotice] = useState(false);
  const [confirmedDuplicateSignature, setConfirmedDuplicateSignature] = useState<string | null>(null);
  const [showCatalogDuplicates, setShowCatalogDuplicates] = useState(false);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const parsedYoutubeId = extractYouTubeId(youtubeUrl);
  const urlDuplicateMatches = parsedYoutubeId
    ? findDuplicateTrackMatches({ youtubeId: parsedYoutubeId }, existingTracks)
    : [];

  const duplicateMatches = analyzed
    ? findDuplicateTrackMatches(
        {
          youtubeId: analyzed.youtubeId,
          title: analyzed.title,
          artist: analyzed.artist,
        },
        existingTracks
      )
    : [];

  const duplicateSignature = duplicateMatches
    .map((match) => `${match.matchType}:${match.track.id}`)
    .join('|');
  const hasUnconfirmedDuplicate =
    duplicateMatches.length > 0 && confirmedDuplicateSignature !== duplicateSignature;

  const catalogDuplicateGroups = findCatalogDuplicateGroups(existingTracks);

  const fetchStaticYouTubeDraft = async (id: string): Promise<AnalyzedVideoResult> => {
    const canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
    let title = '';
    let artist = '';
    try {
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`);
      if (res.ok) {
        const meta = (await res.json()) as { title?: string; author_name?: string };
        const rawTitle = (meta.title || '').trim();
        const rawAuthor = (meta.author_name || '').replace(/\s*-\s*Topic$/i, '').trim();
        if (rawTitle.includes(' - ')) {
          const [left, ...rest] = rawTitle.split(' - ');
          artist = left.trim();
          title = rest.join(' - ').replace(/\s*\(Official.*?\)\s*/gi, '').trim();
        } else {
          title = rawTitle.replace(/\s*\(Official.*?\)\s*/gi, '').trim();
          artist = rawAuthor;
        }
      }
    } catch {
      // Ignore network fallback failure and let owner fill manually
    }

    const isRemixFallback = /\bremix\b/i.test(title);
    return {
      youtubeId: id,
      youtubeUrl: canonicalUrl,
      title,
      artist,
      country: 'Argentina',
      countryCode: 'AR',
      language: 'Español',
      languageCode: 'es',
      genre: isRemixFallback ? 'Pop / Rock (Remix)' : 'Pop / Rock',
      isRemix: isRemixFallback,
      curatorNote: '',
      thumbnailUrl: getYouTubeThumbnailUrl(id),
      aiQuotaExceeded: true,
    };
  };

  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    setVideoError(null);
    setQuotaNotice(false);
    setConfirmedDuplicateSignature(null);
    const id = extractYouTubeId(youtubeUrl);
    if (!id) {
      setVideoError('Ingresa un enlace válido de YouTube (watch, youtu.be o shorts).');
      return;
    }

    setAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        const draft = await fetchStaticYouTubeDraft(id);
        setQuotaNotice(true);
        setAnalyzed(draft);
        return;
      }
      const data = (await response.json()) as AnalyzedVideoResult & { error?: string };
      if (data.aiQuotaExceeded) {
        setQuotaNotice(true);
      }
      setAnalyzed(data);
    } catch {
      const draft = await fetchStaticYouTubeDraft(id);
      setQuotaNotice(true);
      setAnalyzed(draft);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleManualDraft = () => {
    setVideoError(null);
    setQuotaNotice(false);
    setConfirmedDuplicateSignature(null);
    const id = extractYouTubeId(youtubeUrl);
    if (!id) {
      setVideoError('Primero pega un enlace válido de YouTube para continuar.');
      return;
    }
    setAnalyzed({
      youtubeId: id,
      youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
      title: '',
      artist: '',
      country: 'Argentina',
      countryCode: 'AR',
      language: 'Español',
      languageCode: 'es',
      genre: 'Rock Nacional',
      isRemix: false,
      curatorNote: '',
      thumbnailUrl: getYouTubeThumbnailUrl(id),
    });
  };

  const handlePublish = async (e: FormEvent) => {
    e.preventDefault();
    if (!analyzed || hasUnconfirmedDuplicate) return;
    setVideoError(null);
    setPublishing(true);
    try {
      await onPublishTrack(analyzed);
      setYoutubeUrl('');
      setAnalyzed(null);
      setConfirmedDuplicateSignature(null);
      onClose();
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Error al publicar canción.');
    } finally {
      setPublishing(false);
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoPreview(compressed);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'No se pudo procesar la foto.');
    }
  };

  const handleUploadPhotoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!photoPreview) return;
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      await onUploadPhoto(photoPreview, photoCaption.trim());
      setPhotoPreview(null);
      setPhotoCaption('');
      onClose();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'No se pudo subir la foto.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSignInClick = async () => {
    setAuthError(null);
    try {
      await onSignIn();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Error al iniciar sesión.');
    }
  };

  const primaryDuplicateType = duplicateMatches[0]?.matchType;
  const isSevereDuplicate =
    primaryDuplicateType === 'exact-video' || primaryDuplicateType === 'same-song-artist';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-studio-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div
        className={`w-full ${
          activeTab === 'stats' && user && isOwner ? 'max-w-2xl' : 'max-w-xl'
        } rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col dark:border-zinc-800 dark:bg-zinc-900`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 id="owner-studio-title" className="font-display text-lg font-bold text-zinc-950 dark:text-zinc-50">
            {t('ownerModalTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {!user && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-700 leading-relaxed dark:text-zinc-300">{t('ownerOnlyNotice')}</p>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{OWNER_EMAIL}</p>
              {authError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {authError}
                </p>
              )}
              <button
                type="button"
                onClick={handleSignInClick}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-600 transition-colors cursor-pointer dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>{t('signInGoogle')}</span>
              </button>
            </div>
          )}

          {user && !isOwner && (
            <div className="space-y-4">
              <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                {t('unauthorizedEmail')}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 cursor-pointer dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('signOut')}</span>
              </button>
            </div>
          )}

          {user && isOwner && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950">
                  <button
                    type="button"
                    onClick={() => setActiveTab('video')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'video' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    <Video className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('tabAddVideo')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('photo')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'photo' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('tabUploadPhoto')}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="owner-tab-stats"
                    onClick={() => {
                      setActiveTab('stats');
                      onRefreshStats?.();
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'stats' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('tabOwnerStats')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-950 cursor-pointer dark:text-zinc-400 dark:hover:text-white"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('signOut')}</span>
                </button>
              </div>

              {activeTab === 'stats' ? (
                <OwnerStatsPanel
                  t={t}
                  currentLang={currentLang}
                  visits={visits}
                  totalVisitsCount={totalVisitsCount}
                  loading={statsLoading}
                  error={statsError}
                  onRefresh={() => onRefreshStats?.()}
                />
              ) : activeTab === 'video' ? (
                <div className="space-y-5">
                  {hasDefaultTracks && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Los videos de ejemplo desaparecen automáticamente al publicar tu primer video, o puedes quitarlos ahora.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClearDefaultTracks();
                        }}
                        className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-red-50 hover:text-red-700 hover:border-red-200 cursor-pointer whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                      >
                        {t('clearDefaultTracks')}
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleAnalyze} className="space-y-3">
                    <label htmlFor="youtube-url-input" className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      {t('youtubeUrlLabel')}
                    </label>
                    <input
                      id="youtube-url-input"
                      type="url"
                      required
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder={t('youtubeUrlPlaceholder')}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-950 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500"
                    />
                    {urlDuplicateMatches.length > 0 && (
                      <div
                        data-testid="duplicate-url-alert"
                        role="alert"
                        className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-900 dark:border-red-800/80 dark:bg-red-950/45 dark:text-red-200"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true" />
                          <div className="space-y-1">
                            <p className="font-semibold">{t('duplicateUrlAlertText')}</p>
                            <ul className="space-y-0.5 text-red-800 dark:text-red-300">
                              {urlDuplicateMatches.slice(0, 3).map(({ track }) => (
                                <li key={track.id}>
                                  <span className="font-semibold">{track.title}</span> — {track.artist} ({track.country} · {track.genre})
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="submit"
                        disabled={analyzing}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                      >
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        <span>{analyzing ? t('analyzing') : t('analyzeWithAi')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleManualDraft}
                        className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 cursor-pointer whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                      >
                        Completar manualmente
                      </button>
                    </div>
                  </form>

                  {quotaNotice && (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 leading-relaxed dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                      Se alcanzó el límite diario del nivel gratuito de Gemini AI. Obtuvimos el título y la miniatura desde YouTube; completa o ajusta el país, idioma y género abajo para publicar tu canción. Si deseas mayor cuota de IA, puedes seleccionar una clave con facturación en <strong>Settings &gt; Secrets</strong>.
                    </p>
                  )}

                  {videoError && (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                      {videoError}
                    </p>
                  )}

                  {analyzed && (
                    <form onSubmit={handlePublish} className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="flex items-center gap-3">
                        <img
                          src={analyzed.thumbnailUrl}
                          alt={analyzed.title}
                          referrerPolicy="no-referrer"
                          className="h-14 w-24 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700"
                        />
                        <div className="text-xs text-zinc-600 dark:text-zinc-400">
                          <p className="font-semibold text-blue-700 dark:text-blue-400">{t('aiDetectedBadge')}</p>
                          <p className="font-mono">{analyzed.youtubeId}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="analyzed-title" className="block text-xs font-medium text-zinc-700 mb-1 dark:text-zinc-300">
                            {t('trackTitleLabel')}
                          </label>
                          <input
                            id="analyzed-title"
                            type="text"
                            required
                            value={analyzed.title}
                            onChange={(e) => setAnalyzed({ ...analyzed, title: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label htmlFor="analyzed-artist" className="block text-xs font-medium text-zinc-700 mb-1 dark:text-zinc-300">
                            {t('artistLabel')}
                          </label>
                          <input
                            id="analyzed-artist"
                            type="text"
                            required
                            value={analyzed.artist}
                            onChange={(e) => setAnalyzed({ ...analyzed, artist: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label htmlFor="analyzed-country" className="block text-xs font-medium text-zinc-700 mb-1 dark:text-zinc-300">
                            {t('countryLabel')}{' '}
                            <span aria-hidden="true" className="ml-1">
                              {getCountryFlagEmoji(analyzed.countryCode)}
                            </span>
                          </label>
                          <input
                            id="analyzed-country"
                            type="text"
                            required
                            placeholder="Ej: España / Estados Unidos"
                            value={analyzed.country}
                            onChange={(e) => {
                              const nextCountry = e.target.value;
                              const nextCode = resolveCountryCode(nextCountry, analyzed.countryCode);
                              setAnalyzed({
                                ...analyzed,
                                country: nextCountry,
                                countryCode: nextCode,
                                isRemix: Boolean(analyzed.isRemix || nextCode.includes(',')),
                              });
                            }}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label htmlFor="analyzed-language" className="block text-xs font-medium text-zinc-700 mb-1 dark:text-zinc-300">
                            {t('languageSungLabel')}
                          </label>
                          <input
                            id="analyzed-language"
                            type="text"
                            required
                            placeholder="Ej: Español / Inglés"
                            value={analyzed.language}
                            onChange={(e) => {
                              const nextLang = e.target.value;
                              const nextLangCode = resolveLanguageCode(nextLang, analyzed.languageCode);
                              setAnalyzed({
                                ...analyzed,
                                language: nextLang,
                                languageCode: nextLangCode,
                                isRemix: Boolean(analyzed.isRemix || nextLangCode.includes(',')),
                              });
                            }}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="analyzed-genre" className="block text-xs font-medium text-zinc-700 mb-1 dark:text-zinc-300">
                            {t('genreLabel')}
                          </label>
                          <input
                            id="analyzed-genre"
                            type="text"
                            required
                            value={analyzed.genre}
                            onChange={(e) => setAnalyzed({ ...analyzed, genre: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="flex items-center gap-2.5 text-xs font-medium text-zinc-800 cursor-pointer select-none dark:text-zinc-200">
                            <input
                              type="checkbox"
                              checked={Boolean(analyzed.isRemix)}
                              onChange={(e) => setAnalyzed({ ...analyzed, isRemix: e.target.checked })}
                              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-600 dark:bg-zinc-900"
                            />
                            <span>{t('remixToggleLabel')}</span>
                          </label>
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="analyzed-note" className="block text-xs font-medium text-zinc-700 mb-1 dark:text-zinc-300">
                            {t('curatorNoteLabel')}
                          </label>
                          <input
                            id="analyzed-note"
                            type="text"
                            value={analyzed.curatorNote}
                            onChange={(e) => setAnalyzed({ ...analyzed, curatorNote: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                      </div>

                      {duplicateMatches.length > 0 && primaryDuplicateType && (
                        <div
                          data-testid="duplicate-track-alert"
                          role="alert"
                          className={`space-y-3 rounded-xl border p-3.5 text-xs ${
                            isSevereDuplicate
                              ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-800/80 dark:bg-red-950/45 dark:text-red-100'
                              : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <AlertTriangle
                              className={`h-4 w-4 shrink-0 mt-0.5 ${
                                isSevereDuplicate ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                              }`}
                              aria-hidden="true"
                            />
                            <div className="space-y-1.5">
                              <p className="font-bold">
                                {getDuplicateMatchHeading(primaryDuplicateType, t)}
                              </p>
                              <ul className="space-y-1">
                                {duplicateMatches.slice(0, 4).map(({ track, matchType }) => (
                                  <li key={track.id} className="leading-snug">
                                    <span className="font-semibold">{track.title}</span> — {track.artist}{' '}
                                    <span className="opacity-80">
                                      ({track.country} · {track.genre} · {getDuplicateMatchTag(matchType)})
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          <label className="flex items-start gap-2.5 pt-2 border-t border-current/15 cursor-pointer select-none font-medium">
                            <input
                              data-testid="duplicate-confirm-checkbox"
                              type="checkbox"
                              checked={confirmedDuplicateSignature === duplicateSignature}
                              onChange={(e) =>
                                setConfirmedDuplicateSignature(e.target.checked ? duplicateSignature : null)
                              }
                              className="mt-0.5 h-4 w-4 rounded border-zinc-400 text-blue-600 focus:ring-blue-600 dark:border-zinc-600 dark:bg-zinc-900"
                            />
                            <span>{t('duplicateConfirmLabel')}</span>
                          </label>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={publishing || hasUnconfirmedDuplicate}
                        className="w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:bg-blue-600 dark:hover:bg-blue-500"
                      >
                        {publishing ? t('publishing') : t('publishTrack')}
                      </button>
                    </form>
                  )}

                  {catalogDuplicateGroups.length > 0 && (
                    <div
                      data-testid="catalog-duplicates-notice"
                      className="rounded-xl border border-amber-200 bg-amber-50/75 px-4 py-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 font-medium">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                          <span>
                            <strong className="font-mono tabular-nums">{catalogDuplicateGroups.length}</strong>{' '}
                            {t('catalogDuplicatesSummary')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowCatalogDuplicates((prev) => !prev)}
                          className="inline-flex shrink-0 items-center gap-1 font-semibold text-amber-900 hover:underline cursor-pointer dark:text-amber-200"
                        >
                          <span>
                            {showCatalogDuplicates
                              ? t('catalogDuplicatesToggleHide')
                              : t('catalogDuplicatesToggleShow')}
                          </span>
                          {showCatalogDuplicates ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>

                      {showCatalogDuplicates && (
                        <ul className="mt-3 space-y-2 border-t border-amber-200/80 pt-3 dark:border-amber-900/60">
                          {catalogDuplicateGroups.map((group) => (
                            <li key={group.key} className="space-y-0.5">
                              <p className="font-semibold">
                                {group.label}{' '}
                                <span className="font-normal opacity-80">
                                  ({getDuplicateMatchTag(group.matchType)} · {group.tracks.length})
                                </span>
                              </p>
                              <ul className="pl-3 space-y-0.5 text-[11px] opacity-90">
                                {group.tracks.map((tr) => (
                                  <li key={tr.id}>
                                    • {tr.title} — {tr.artist} ({tr.country} · {tr.genre})
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {hasDefaultPhotos && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Las fotos de ejemplo se reemplazan automáticamente al subir tu primera foto, o puedes quitarlas ahora.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClearDefaultPhotos();
                        }}
                        className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-red-50 hover:text-red-700 hover:border-red-200 cursor-pointer whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                      >
                        {t('clearDefaultPhotos')}
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleUploadPhotoSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="photo-file-input" className="block text-xs font-semibold text-zinc-800 mb-2 dark:text-zinc-200">
                      {t('photoFileLabel')}
                    </label>
                    <input
                      id="photo-file-input"
                      type="file"
                      accept="image/*"
                      required={!photoPreview}
                      onChange={(e) => handleFileChange(e.target.files?.[0])}
                      className="block w-full text-xs text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-800 dark:text-zinc-400 dark:file:bg-blue-600 dark:hover:file:bg-blue-500"
                    />
                  </div>

                  {photoPreview && (
                    <div className="overflow-hidden rounded-xl border border-zinc-200 max-h-56 dark:border-zinc-700">
                      <img src={photoPreview} alt="Vista previa" className="h-full w-full object-cover" />
                    </div>
                  )}

                  <div>
                    <label htmlFor="photo-caption-input" className="block text-xs font-semibold text-zinc-800 mb-1 dark:text-zinc-200">
                      {t('photoCaptionLabel')}
                    </label>
                    <input
                      id="photo-caption-input"
                      type="text"
                      maxLength={180}
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-950 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500"
                    />
                  </div>

                  {photoError && (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                      {photoError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!photoPreview || uploadingPhoto}
                    className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    {uploadingPhoto ? t('uploadingPhoto') : t('uploadPhotoBtn')}
                  </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
