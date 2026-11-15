import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, Download, Link2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { UiStringKey } from '../data/translations';

interface QrShareModalProps {
  open: boolean;
  onClose: () => void;
  t: (key: UiStringKey) => string;
  shareUrl: string;
  isPrivatePreview?: boolean;
  isOwner?: boolean;
  customShareUrl?: string;
  onUpdateCustomShareUrl?: (nextUrl: string) => void;
}

export function QrShareModal({
  open,
  onClose,
  t,
  shareUrl,
  isPrivatePreview = false,
  isOwner = false,
  customShareUrl = '',
  onUpdateCustomShareUrl,
}: QrShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [draftLink, setDraftLink] = useState(customShareUrl);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftLink(customShareUrl);
  }, [customShareUrl, open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  const handleDownloadSvg = () => {
    const svg = svgContainerRef.current?.querySelector('svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'joan-manuel-musica-qr.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveCustomLink = (e: FormEvent) => {
    e.preventDefault();
    onUpdateCustomShareUrl?.(draftLink.trim());
    setEditingLink(false);
  };

  const handleResetLink = () => {
    setDraftLink('');
    onUpdateCustomShareUrl?.('');
    setEditingLink(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id="qr-modal-title" className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
              {t('qrModalTitle')}
            </h2>
            <p className="text-xs text-zinc-600 leading-relaxed dark:text-zinc-400">{t('qrModalSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div
          ref={svgContainerRef}
          data-testid="qr-code-container"
          className="flex items-center justify-center rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700"
        >
          <QRCodeSVG value={shareUrl} size={208} level="M" includeMargin />
        </div>

        <div className="space-y-2">
          <p className="break-all rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700 text-center dark:bg-zinc-950 dark:text-zinc-300">
            {shareUrl}
          </p>

          {(isPrivatePreview || isOwner) && onUpdateCustomShareUrl && (
            <div className="flex items-center justify-end gap-3">
              {customShareUrl && (
                <button
                  type="button"
                  onClick={handleResetLink}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  {t('qrResetLink')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingLink((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer dark:text-blue-400 dark:hover:text-blue-300"
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('qrEditLink')}</span>
              </button>
            </div>
          )}

          {editingLink && onUpdateCustomShareUrl && (
            <form onSubmit={handleSaveCustomLink} className="flex items-center gap-2 pt-1">
              <input
                type="url"
                value={draftLink}
                onChange={(e) => setDraftLink(e.target.value)}
                placeholder={t('qrCustomLinkPlaceholder')}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-blue-500"
              />
              <button
                type="submit"
                className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 cursor-pointer whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                OK
              </button>
            </form>
          )}
        </div>

        {isPrivatePreview && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 leading-relaxed dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {t('qrShareNote')}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-600 transition-colors cursor-pointer whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            <span>{copied ? t('linkCopied') : t('copyLink')}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadSvg}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{t('downloadQr')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
