/**
 * Resizes and compresses a user-selected image file to a crisp JPEG data URL
 * guaranteed to fit comfortably inside a Firestore document (< 350 KB).
 */
export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1200,
  quality = 0.82
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selected file is not an image.');
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file.'));
      el.src = bitmapUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }

    ctx.drawImage(img, 0, 0, width, height);
    let dataUrl = canvas.toDataURL('image/jpeg', quality);

    if (dataUrl.length > 600_000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}
