export const constants = {};

export function gunzipSync(): never {
  throw new Error('node:zlib is unavailable in the browser');
}

export function gzipSync(): never {
  throw new Error('node:zlib is unavailable in the browser');
}
