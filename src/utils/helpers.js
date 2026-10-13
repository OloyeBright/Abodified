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