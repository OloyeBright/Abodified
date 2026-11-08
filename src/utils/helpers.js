// Small reusable functions. Keeping them here means every page uses the SAME logic.

// "0803 123 4567" or "2348031234567" -> "2348031234567" (what wa.me needs)
export function toWhatsApp(number = '') {
  const digits = String(number).replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return '234' + digits.slice(1);
  return digits;
}

// Accepts 08012345678 or 2348012345678. Returns "2348012345678" or null if invalid.
// Valid Nigerian mobile prefixes: 070, 071, 080, 081, 090, 091.
export function normalizeNgNumber(input = '') {
  const d = String(input).replace(/\D/g, '');
  if (/^0[789][01]\d{8}$/.test(d)) return '234' + d.slice(1);
  if (/^234[789][01]\d{8}$/.test(d)) return d;
  return null;
}

// "prepaidMeter" -> "Prepaid Meter"
export function formatTag(tag) {
  return tag.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export const periodLabel = { yearly: 'year', monthly: 'month' };

// Straight-line distance between two GPS points (haversine formula), in km
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}


// REPLACE the old compressImage function in src/utils/helpers.js with this one.
// It keeps the poster's original file whenever possible, so nothing is lost.
// Only photos that are too big are shrunk, and they are saved at high quality.
export async function compressImage(file, maxEdge = 2400, quality = 0.92) {
  const MAX_BYTES = 5 * 1024 * 1024; // the upload limit used by the form
  let bitmap;
  try {
    // "from-image" keeps the photo the right way up
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    return file; // the browser cannot read it: upload the original untouched
  }

  const fits = bitmap.width <= maxEdge && bitmap.height <= maxEdge;
  if (fits && file.size <= MAX_BYTES) {
    if (bitmap.close) bitmap.close();
    return file; // already a good size: upload the original bytes, no re-encoding
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';            // transparent PNGs get a white background
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // never make it bigger
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch (e) {
    return file;
  }

}


// SHA-256 fingerprint of a file (used to spot the same document on two accounts)
export async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Pixel size of an image file, e.g. { w: 1600, h: 1200 }. Returns null if the browser cannot read it.
export async function imageSize(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = { w: bmp.width, h: bmp.height };
    if (bmp.close) bmp.close();
    return size;
  } catch (e) {
    return null;
  }
}