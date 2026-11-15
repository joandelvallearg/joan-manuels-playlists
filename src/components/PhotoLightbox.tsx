import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { OWNER_SPANISH_NAME, type Photo } from '../types';

interface PhotoLightboxProps {
  photos: Photo[];
  activeIndex: number | null;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
  closeLabel: string;
  translateTerm: (term: string) => string;
}

export function PhotoLightbox({
  photos,
  activeIndex,
  onClose,
  onChangeIndex,
  closeLabel,
  translateTerm,
}: PhotoLightboxProps) {
  useEffect(() => {
    if (activeIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && activeIndex < photos.length - 1) onChangeIndex(activeIndex + 1);
      if (e.key === 'ArrowLeft' && activeIndex > 0) onChangeIndex(activeIndex - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIndex, photos.length, onClose, onChangeIndex]);

  if (activeIndex === null || !photos[activeIndex]) return null;

  const photo = photos[activeIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || OWNER_SPANISH_NAME}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-4 top-4 rounded-lg bg-white/10 p-2.5 text-white hover:bg-white/20 cursor-pointer"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {activeIndex > 0 && (
        <button
          type="button"
          onClick={() => onChangeIndex(activeIndex - 1)}
          aria-label="Foto anterior"
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-lg bg-white/10 p-2.5 text-white hover:bg-white/20 cursor-pointer"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {activeIndex < photos.length - 1 && (
        <button
          type="button"
          onClick={() => onChangeIndex(activeIndex + 1)}
          aria-label="Siguiente foto"
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-white/10 p-2.5 text-white hover:bg-white/20 cursor-pointer"
        >
          <ChevronRight className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      <div className="max-h-[85vh] max-w-4xl space-y-3 text-center">
        <img
          src={photo.imageData}
          alt={photo.caption || OWNER_SPANISH_NAME}
          referrerPolicy="no-referrer"
          className="max-h-[75vh] w-auto rounded-xl object-contain mx-auto"
        />
        {photo.caption && (
          <p className="text-sm text-zinc-200">{translateTerm(photo.caption)}</p>
        )}
      </div>
    </div>
  );
}
