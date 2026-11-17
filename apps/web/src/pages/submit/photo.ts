import { API_PATHS, AVATAR_SIZE_PX, PHOTO_FIELD, type PersonMeDto } from '@pribe/shared';
import { ApiRequestError } from '../../lib/api';

async function loadImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // Respects the EXIF rotation of phone photos.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* older Safari: fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Center-crops to a square and scales to `AVATAR_SIZE_PX` as JPEG (D27). */
export async function squareJpeg(file: Blob, size = AVATAR_SIZE_PX): Promise<Blob> {
  const img = await loadImage(file);
  const w = img.width;
  const h = img.height;
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  if ('close' in img) img.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.85),
  );
}

export async function uploadPhoto(photo: Blob): Promise<PersonMeDto> {
  const form = new FormData();
  form.append(PHOTO_FIELD, photo, 'avatar.jpg');
  const res = await fetch(API_PATHS.person.photo, { method: 'PUT', body: form, credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok) throw new ApiRequestError(res.status, data);
  return data as PersonMeDto;
}
