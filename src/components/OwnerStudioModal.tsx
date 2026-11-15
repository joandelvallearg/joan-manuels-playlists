import { useState, type FormEvent } from 'react';
import { LogIn, LogOut, Sparkles, Upload, Video, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { UiStringKey } from '../data/translations';
import { OWNER_EMAIL, type AnalyzedVideoResult } from '../types';
import { compressImageToDataUrl } from '../utils/imageHelper';
import {
  extractYouTubeId,
  getYouTubeThumbnailUrl,
  resolveCountryCode,
  resolveLanguageCode,
} from '../utils/musicLogic';

interface OwnerStudioModalProps {
  open: boolean;
  initialTab: 'video' | 'photo';
  onClose: () => void;
  t: (key: UiStringKey) => string;
  user: User | null;
  isOwner: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onPublishTrack: (video: AnalyzedVideoResult) => Promise<void>;
  onUploadPhoto: (imageData: string, caption: string) => Promise<void>;
  hasDefaultTracks: boolean;
  hasDefaultPhotos: boolean;
  onClearDefaultTracks: () => Promise<void>;
  onClearDefaultPhotos: () => Promise<void>;
}

export function OwnerStudioModal({
  open,
  initialTab,
  onClose,
  t,
  user,
  isOwner,
  onSignIn,
  onSignOut,
  onPublishTrack,
  onUploadPhoto,
  hasDefaultTracks,
  hasDefaultPhotos,
  onClearDefaultTracks,
  onClearDefaultPhotos,
}: OwnerStudioModalProps) {
  const [activeTab, setActiveTab] = useState<'video' | 'photo'>(initialTab);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [analyzed, setAnalyzed] = useState<AnalyzedVideoResult | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [quotaNotice, setQuotaNotice] = useState(false);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!open) return null;

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

    return {
      youtubeId: id,
      youtubeUrl: canonicalUrl,
      title,
      artist,
      country: 'Argentina',
      countryCode: 'AR',
      language: 'Español',
      languageCode: 'es',
      genre: 'Pop / Rock',
      curatorNote: '',
      thumbnailUrl: getYouTubeThumbnailUrl(id),
      aiQuotaExceeded: true,
    };
  };

  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    setVideoError(null);
    setQuotaNotice(false);
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
      curatorNote: '',
      thumbnailUrl: getYouTubeThumbnailUrl(id),
    });
  };

  const handlePublish = async (e: FormEvent) => {
    e.preventDefault();
    if (!analyzed) return;
    setVideoError(null);
    setPublishing(true);
    try {
      await onPublishTrack(analyzed);
      setYoutubeUrl('');
      setAnalyzed(null);
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-studio-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 id="owner-studio-title" className="font-display text-lg font-bold text-zinc-950">
            {t('ownerModalTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {!user && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-700 leading-relaxed">{t('ownerOnlyNotice')}</p>
              <p className="font-mono text-xs text-zinc-500">{OWNER_EMAIL}</p>
              {authError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {authError}
                </p>
              )}
              <button
                type="button"
                onClick={handleSignInClick}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-600 transition-colors cursor-pointer"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>{t('signInGoogle')}</span>
              </button>
            </div>
          )}

          {user && !isOwner && (
            <div className="space-y-4">
              <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {t('unauthorizedEmail')}
              </p>
              <p className="text-xs text-zinc-500">{user.email}</p>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('signOut')}</span>
              </button>
            </div>
          )}

          {user && isOwner && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4 border-b border-zinc-200 pb-3">
                <div className="inline-flex items-center gap-1 rounded-xl bg-zinc-100 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('video')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'video' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    <Video className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('tabAddVideo')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('photo')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === 'photo' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('tabUploadPhoto')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-950 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('signOut')}</span>
                </button>
              </div>

              {activeTab === 'video' ? (
                <div className="space-y-5">
                  {hasDefaultTracks && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                      <p className="text-xs text-zinc-600">
                        Los videos de ejemplo desaparecen automáticamente al publicar tu primer video, o puedes quitarlos ahora.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClearDefaultTracks();
                        }}
                        className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-red-50 hover:text-red-700 hover:border-red-200 cursor-pointer whitespace-nowrap"
                      >
                        {t('clearDefaultTracks')}
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleAnalyze} className="space-y-3">
                    <label htmlFor="youtube-url-input" className="block text-xs font-semibold text-zinc-800">
                      {t('youtubeUrlLabel')}
                    </label>
                    <input
                      id="youtube-url-input"
                      type="url"
                      required
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder={t('youtubeUrlPlaceholder')}
                      className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-950 focus:border-blue-600 focus:outline-none"
                    />
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
                        className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 cursor-pointer whitespace-nowrap"
                      >
                        Completar manualmente
                      </button>
                    </div>
                  </form>

                  {quotaNotice && (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 leading-relaxed">
                      Se alcanzó el límite diario del nivel gratuito de Gemini AI. Obtuvimos el título y la miniatura desde YouTube; completa o ajusta el país, idioma y género abajo para publicar tu canción. Si deseas mayor cuota de IA, puedes seleccionar una clave con facturación en <strong>Settings &gt; Secrets</strong>.
                    </p>
                  )}

                  {videoError && (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {videoError}
                    </p>
                  )}

                  {analyzed && (
                    <form onSubmit={handlePublish} className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={analyzed.thumbnailUrl}
                          alt={analyzed.title}
                          referrerPolicy="no-referrer"
                          className="h-14 w-24 rounded-lg object-cover border border-zinc-200"
                        />
                        <div className="text-xs text-zinc-600">
                          <p className="font-semibold text-blue-700">{t('aiDetectedBadge')}</p>
                          <p className="font-mono">{analyzed.youtubeId}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="analyzed-title" className="block text-xs font-medium text-zinc-700 mb-1">
                            {t('trackTitleLabel')}
                          </label>
                          <input
                            id="analyzed-title"
                            type="text"
                            required
                            value={analyzed.title}
                            onChange={(e) => setAnalyzed({ ...analyzed, title: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor="analyzed-artist" className="block text-xs font-medium text-zinc-700 mb-1">
                            {t('artistLabel')}
                          </label>
                          <input
                            id="analyzed-artist"
                            type="text"
                            required
                            value={analyzed.artist}
                            onChange={(e) => setAnalyzed({ ...analyzed, artist: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor="analyzed-country" className="block text-xs font-medium text-zinc-700 mb-1">
                            {t('countryLabel')}
                          </label>
                          <input
                            id="analyzed-country"
                            type="text"
                            required
                            value={analyzed.country}
                            onChange={(e) => {
                              const nextCountry = e.target.value;
                              setAnalyzed({
                                ...analyzed,
                                country: nextCountry,
                                countryCode: resolveCountryCode(nextCountry, analyzed.countryCode),
                              });
                            }}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor="analyzed-language" className="block text-xs font-medium text-zinc-700 mb-1">
                            {t('languageSungLabel')}
                          </label>
                          <input
                            id="analyzed-language"
                            type="text"
                            required
                            value={analyzed.language}
                            onChange={(e) => {
                              const nextLang = e.target.value;
                              setAnalyzed({
                                ...analyzed,
                                language: nextLang,
                                languageCode: resolveLanguageCode(nextLang, analyzed.languageCode),
                              });
                            }}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="analyzed-genre" className="block text-xs font-medium text-zinc-700 mb-1">
                            {t('genreLabel')}
                          </label>
                          <input
                            id="analyzed-genre"
                            type="text"
                            required
                            value={analyzed.genre}
                            onChange={(e) => setAnalyzed({ ...analyzed, genre: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="analyzed-note" className="block text-xs font-medium text-zinc-700 mb-1">
                            {t('curatorNoteLabel')}
                          </label>
                          <input
                            id="analyzed-note"
                            type="text"
                            value={analyzed.curatorNote}
                            onChange={(e) => setAnalyzed({ ...analyzed, curatorNote: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={publishing}
                        className="w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
                      >
                        {publishing ? t('publishing') : t('publishTrack')}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {hasDefaultPhotos && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                      <p className="text-xs text-zinc-600">
                        Las fotos de ejemplo se reemplazan automáticamente al subir tu primera foto, o puedes quitarlas ahora.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClearDefaultPhotos();
                        }}
                        className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-red-50 hover:text-red-700 hover:border-red-200 cursor-pointer whitespace-nowrap"
                      >
                        {t('clearDefaultPhotos')}
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleUploadPhotoSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="photo-file-input" className="block text-xs font-semibold text-zinc-800 mb-2">
                      {t('photoFileLabel')}
                    </label>
                    <input
                      id="photo-file-input"
                      type="file"
                      accept="image/*"
                      required={!photoPreview}
                      onChange={(e) => handleFileChange(e.target.files?.[0])}
                      className="block w-full text-xs text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-800"
                    />
                  </div>

                  {photoPreview && (
                    <div className="overflow-hidden rounded-xl border border-zinc-200 max-h-56">
                      <img src={photoPreview} alt="Vista previa" className="h-full w-full object-cover" />
                    </div>
                  )}

                  <div>
                    <label htmlFor="photo-caption-input" className="block text-xs font-semibold text-zinc-800 mb-1">
                      {t('photoCaptionLabel')}
                    </label>
                    <input
                      id="photo-caption-input"
                      type="text"
                      maxLength={180}
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-3.5 py-2 text-sm text-zinc-950 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  {photoError && (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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
