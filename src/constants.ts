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
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized;
}
