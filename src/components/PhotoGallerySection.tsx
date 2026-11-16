import { useState } from 'react';
import { Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import {
  OWNER_SPANISH_NAME,
  type GeneratedProfileDraft,
  type Photo,
  type PsychologicalProfile,
} from '../types';
import { formatProfileDate } from '../utils/musicLogic';
import { getLocalizedProfileContent } from '../utils/profileTranslation';

interface PhotoGallerySectionProps {
  t: (key: UiStringKey) => string;
  photos: Photo[];
  isOwner: boolean;
  onOpenUploadPhoto: () => void;
  onSelectPhoto: (index: number) => void;
  onDeletePhoto: (photo: Photo) => void;
  translateTerm: (term: string) => string;
  currentLang: string;
  savedProfile: PsychologicalProfile | null;
  hasAnyTracks: boolean;
  onGenerateProfile: () => Promise<GeneratedProfileDraft>;
  onSaveProfile: (draft: GeneratedProfileDraft) => Promise<void>;
}

export function PhotoGallerySection({
  t,
  photos,
  isOwner,
  onOpenUploadPhoto,
  onSelectPhoto,
  onDeletePhoto,
  translateTerm,
  currentLang,
  savedProfile,
  hasAnyTracks,
  onGenerateProfile,
  onSaveProfile,
}: PhotoGallerySectionProps) {
  const [draft, setDraft] = useState<GeneratedProfileDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleGenerateClick = async () => {
    setProfileError(null);
    setSavedNotice(false);
    setGenerating(true);
    try {
      const nextDraft = await onGenerateProfile();
      setDraft(nextDraft);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'No se pudo generar el análisis.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveClick = async () => {
    if (!draft) return;
    setProfileError(null);
    setSavedNotice(false);
    setSaving(true);
    try {
      await onSaveProfile({
        personalitySummary: draft.personalitySummary.trim(),
        musicalTasteSummary: draft.musicalTasteSummary.trim(),
        keyTraits: draft.keyTraits.map((item) => item.trim()).filter(Boolean).slice(0, 6),
        trackCount: draft.trackCount,
      });
      setDraft(null);
      setSavedNotice(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const formattedUpdatedDate = savedProfile?.updatedAtMs
    ? formatProfileDate(savedProfile.updatedAtMs, currentLang)
    : '';
  const localizedProfile = savedProfile
    ? getLocalizedProfileContent(savedProfile, currentLang, translateTerm)
    : null;

  return (
    <section id="photos" className="scroll-mt-20 border-t border-zinc-200 bg-[#F6F7F9] transition-colors dark:border-zinc-800 dark:bg-zinc-900/70">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start lg:gap-10">
          {/* Left column: Joan Manuel's Photos (compact & uncropped) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex min-h-[2.25rem] items-center justify-between gap-4">
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                {t('photosHeading')}
              </h2>
              {isOwner && (
                <button
                  type="button"
                  onClick={onOpenUploadPhoto}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 whitespace-nowrap cursor-pointer dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-blue-500 dark:hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('addPhoto')}</span>
                </button>
              )}
            </div>

            {photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('emptyPhotosText')}</p>
                {isOwner && (
                  <button
                    type="button"
                    onClick={onOpenUploadPhoto}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('addPhoto')}</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                className={
                  photos.length === 1
                    ? 'flex justify-start'
                    : 'flex flex-wrap items-start gap-3'
                }
              >
                {photos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    data-testid="photo-card"
                    className={`group relative overflow-hidden rounded-xl border border-zinc-200/90 bg-white p-1.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 ${
                      photos.length === 1 ? 'w-fit max-w-[180px]' : 'w-fit max-w-[160px]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPhoto(idx)}
                      aria-label={photo.caption || `${t('photosHeading')} ${idx + 1}`}
                      className="block cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded-lg"
                    >
                      <img
                        data-testid="photo-img"
                        src={photo.imageData}
                        alt={photo.caption || OWNER_SPANISH_NAME}
                        referrerPolicy="no-referrer"
                        className={`block h-auto w-auto max-w-full rounded-lg object-contain transition-transform duration-300 group-hover:scale-[1.02] ${
                          photos.length === 1 ? 'max-h-52' : 'max-h-40'
                        }`}
                      />
                      {photo.caption && (
                        <p className="mt-1.5 max-w-[164px] px-0.5 text-[11px] font-medium text-zinc-600 leading-snug line-clamp-2 dark:text-zinc-400">
                          {translateTerm(photo.caption)}
                        </p>
                      )}
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => onDeletePhoto(photo)}
                        aria-label={`${t('deletePhoto')}: ${photo.caption || idx + 1}`}
                        className="absolute right-2.5 top-2.5 rounded-lg bg-black/75 p-1.5 text-white hover:bg-red-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column: AI Psychological & Musical Taste Profile */}
          <div className="lg:col-span-8 space-y-5">
            <div className="flex min-h-[2.25rem] flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl sm:text-[1.75rem] font-bold tracking-tight text-zinc-950 text-balance dark:text-zinc-50">
                {t('profileHeading')}
              </h2>
              {isOwner && (
                <button
                  type="button"
                  disabled={!hasAnyTracks || generating}
                  onClick={handleGenerateClick}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{generating ? t('profileGeneratingBtn') : t('profileGenerateBtn')}</span>
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 space-y-6 transition-colors dark:border-zinc-800 dark:bg-zinc-900">
              {profileError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {profileError}
                </p>
              )}

              {savedNotice && (
                <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {t('profileSavedNotice')}
                </p>
              )}

              {/* Owner Draft Editing & Save Mode */}
              {isOwner && draft ? (
                <div className="space-y-5">
                  <p className="border-b border-zinc-100 pb-3 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                    {t('profileAiNotice')}
                  </p>

                  {draft.aiQuotaExceeded && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                      {t('profileQuotaNotice')}
                    </p>
                  )}

                  <div className="space-y-2">
                    <label
                      htmlFor="profile-personality-input"
                      className="block font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
                    >
                      {t('profilePersonalityLabel')}
                    </label>
                    <textarea
                      id="profile-personality-input"
                      rows={4}
                      maxLength={1450}
                      value={draft.personalitySummary}
                      onChange={(e) => setDraft({ ...draft, personalitySummary: e.target.value })}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 leading-relaxed focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="profile-taste-input"
                      className="block font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
                    >
                      {t('profileTasteLabel')}
                    </label>
                    <textarea
                      id="profile-taste-input"
                      rows={3}
                      maxLength={1450}
                      value={draft.musicalTasteSummary}
                      onChange={(e) => setDraft({ ...draft, musicalTasteSummary: e.target.value })}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 leading-relaxed focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="profile-traits-input"
                      className="block font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
                    >
                      {t('profileTraitsLabel')}
                    </label>
                    <input
                      id="profile-traits-input"
                      type="text"
                      value={draft.keyTraits.join(' · ')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          keyTraits: e.target.value
                            .split(/[·,]/)
                            .map((s) => s.trim())
                            .slice(0, 6),
                        })
                      }
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-zinc-500 font-mono tabular-nums dark:text-zinc-400">
                      {t('profileBasedOnSongs')} {draft.trackCount}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDraft(null)}
                        className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        {t('close')}
                      </button>
                      <button
                        type="button"
                        disabled={saving || draft.personalitySummary.trim().length < 10 || draft.musicalTasteSummary.trim().length < 10}
                        onClick={handleSaveClick}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50 cursor-pointer dark:bg-blue-600 dark:hover:bg-blue-500"
                      >
                        <Save className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{saving ? t('profileSavingBtn') : t('profileSaveBtn')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : savedProfile && localizedProfile ? (
                <div className="space-y-6">
                  <div className="space-y-1.5 border-b border-zinc-100 pb-4 dark:border-zinc-800">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                      {t('profileAiNotice')}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {formattedUpdatedDate && (
                        <>
                          <span>
                            {t('profileUpdatedAt')} {formattedUpdatedDate}
                          </span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span className="font-mono tabular-nums">
                        {t('profileBasedOnSongs')} {savedProfile.trackCount}{' '}
                        {savedProfile.trackCount === 1 ? t('songsCountSingle') : t('songsCountPlural')}
                      </span>
                    </div>
                  </div>

                  <article className="space-y-2">
                    <h3 className="font-display text-xl sm:text-[1.35rem] font-bold tracking-tight text-zinc-950 leading-snug text-balance dark:text-zinc-50">
                      {t('profilePersonalityLabel')}
                    </h3>
                    <p className="text-[15px] text-zinc-700 leading-[1.65] dark:text-zinc-300">
                      {localizedProfile.personalitySummary}
                    </p>
                  </article>

                  <article className="space-y-2 border-t border-zinc-100 pt-5 dark:border-zinc-800">
                    <h3 className="font-display text-xl sm:text-[1.35rem] font-bold tracking-tight text-zinc-950 leading-snug text-balance dark:text-zinc-50">
                      {t('profileTasteLabel')}
                    </h3>
                    <p className="text-[15px] text-zinc-700 leading-[1.65] dark:text-zinc-300">
                      {localizedProfile.musicalTasteSummary}
                    </p>
                  </article>

                  {localizedProfile.keyTraits.length > 0 && (
                    <article className="space-y-3 border-t border-zinc-100 pt-5 dark:border-zinc-800">
                      <h3 className="font-display text-xl sm:text-[1.35rem] font-bold tracking-tight text-zinc-950 leading-snug text-balance dark:text-zinc-50">
                        {t('profileTraitsLabel')}
                      </h3>
                      <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {localizedProfile.keyTraits.map((trait, idx) => (
                          <li key={idx} className="flex items-baseline gap-2.5">
                            <span className="font-mono text-blue-600 shrink-0 dark:text-blue-400" aria-hidden="true">
                              —
                            </span>
                            <span className="leading-snug">{trait}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  )}
                </div>
              ) : (
                <div className="py-5 text-center space-y-2">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    {t('profileAiNotice')}
                  </p>
                  <p className="text-sm text-zinc-600 leading-relaxed dark:text-zinc-400">
                    {isOwner ? t('profileEmptyOwner') : t('profileEmptyVisitor')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
