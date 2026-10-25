export const R = 6378137;
export const WORLD = 2 * Math.PI * R;
export const HALF = WORLD / 2;
export const SIZE = 256;

export function lonToX(lon) {
  return R * lon * Math.PI / 180;
}

export function latToY(lat) {
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const radians = clampedLatitude * Math.PI / 180;
  return R * Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

export function xToLon(x) {
  return x / R * 180 / Math.PI;
}

export function yToLat(y) {
  return (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
}

export function tileFromLonLat(lon, lat, z) {
  const n = 2 ** z;
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const radians = clampedLatitude * Math.PI / 180;
  return {
    x: Math.floor((lon + 180) / 360 * n),
    y: Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n),
  };
}

export function tileBounds(z, x, y) {
  const size = WORLD / (2 ** z);
  return { left: -HALF + x * size, top: HALF - y * size, size };
}
