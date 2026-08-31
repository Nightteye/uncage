// Shared constants and helpers used across extraction, parsing, and export.

export const STATIC_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico',
  'css', 'js', 'mjs', 'wasm', 'json',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'webm', 'ogg', 'mp3', 'wav',
  'pdf', 'zip', 'tar', 'gz', 'doc', 'docx', 'xlsx', 'xml'
]);

export function sanitizeFileName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  // Windows strips trailing dots and spaces, which can cause collisions; remove them.
  sanitized = sanitized.replace(/[. ]+$/g, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  // Guard against "." and ".." and empty results.
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = '_';
  }
  return sanitized;
}
