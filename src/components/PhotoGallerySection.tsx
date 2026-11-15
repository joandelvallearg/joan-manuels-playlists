import { Plus, Trash2 } from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import { OWNER_SPANISH_NAME, type Photo } from '../types';

interface PhotoGallerySectionProps {
  t: (key: UiStringKey) => string;
  photos: Photo[];
  isOwner: boolean;
  onOpenUploadPhoto: () => void;
  onSelectPhoto: (index: number) => void;
  onDeletePhoto: (photo: Photo) => void;
  translateTerm: (term: string) => string;
}

export function PhotoGallerySection({
  t,
  photos,
  isOwner,
  onOpenUploadPhoto,
  onSelectPhoto,
  onDeletePhoto,
  translateTerm,
}: PhotoGallerySectionProps) {
  return (
    <section id="photos" className="scroll-mt-20 border-t border-zinc-200 bg-[#F6F7F9]">
      <div className="mx-auto max-w-6xl px-6 py-12 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold tracking-tight text-zinc-950">
            {t('photosHeading')}
          </h2>
          {isOwner && (
            <button
              type="button"
              onClick={onOpenUploadPhoto}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600 whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('addPhoto')}</span>
            </button>
          )}
        </div>

        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
            <p className="text-sm text-zinc-600">{t('emptyPhotosText')}</p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo, idx) => (
              <div
                key={photo.id}
                className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200"
              >
                <button
                  type="button"
                  onClick={() => onSelectPhoto(idx)}
                  aria-label={photo.caption || `${t('photosHeading')} ${idx + 1}`}
                  className="block h-full w-full cursor-pointer text-left"
                >
                  <img
                    src={photo.imageData}
                    alt={photo.caption || OWNER_SPANISH_NAME}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                  {photo.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-4 pt-10">
                      <p className="text-xs font-medium text-white line-clamp-2">
                        {translateTerm(photo.caption)}
                      </p>
                    </div>
                  )}
                </button>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => onDeletePhoto(photo)}
                    aria-label={`${t('deletePhoto')}: ${photo.caption || idx + 1}`}
                    className="absolute right-2.5 top-2.5 rounded-lg bg-black/75 p-2 text-white hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
