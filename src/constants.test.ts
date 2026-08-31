import { describe, it, expect } from 'vitest';
import { sanitizeFileName, STATIC_EXTENSIONS } from './constants.js';

describe('constants utilities', () => {
  describe('sanitizeFileName', () => {
    it('replaces invalid characters with underscore', () => {
      expect(sanitizeFileName('my file.html')).toBe('my_file.html');
      expect(sanitizeFileName('path/to/file')).toBe('path_to_file');
      expect(sanitizeFileName('file:name?test')).toBe('file_name_test');
    });

    it('handles Windows reserved names', () => {
      expect(sanitizeFileName('con')).toBe('_con');
      expect(sanitizeFileName('prn.txt')).toBe('_prn.txt');
      expect(sanitizeFileName('aux')).toBe('_aux');
      expect(sanitizeFileName('nul')).toBe('_nul');
      expect(sanitizeFileName('com1')).toBe('_com1');
      expect(sanitizeFileName('lpt1')).toBe('_lpt1');
    });

    it('truncates long names', () => {
      const longName = 'a'.repeat(150);
      expect(sanitizeFileName(longName).length).toBe(100);
    });

    it('preserves valid characters', () => {
      expect(sanitizeFileName('valid-file_name.txt')).toBe('valid-file_name.txt');
      expect(sanitizeFileName('normal_page.html')).toBe('normal_page.html');
    });

    it('strips trailing dots (Windows collisions)', () => {
      expect(sanitizeFileName('foo.')).toBe('foo');
      expect(sanitizeFileName('foo..')).toBe('foo');
      expect(sanitizeFileName('foo...')).toBe('foo');
      // spaces are converted to _ before the trailing strip runs
      expect(sanitizeFileName('foo ')).toBe('foo_');
    });

    it('guards . and .. and empty results', () => {
      expect(sanitizeFileName('.')).toBe('_');
      expect(sanitizeFileName('..')).toBe('_');
      expect(sanitizeFileName('')).toBe('_');
    });
  });

  describe('STATIC_EXTENSIONS', () => {
    it('contains image extensions', () => {
      expect(STATIC_EXTENSIONS.has('png')).toBe(true);
      expect(STATIC_EXTENSIONS.has('jpg')).toBe(true);
      expect(STATIC_EXTENSIONS.has('webp')).toBe(true);
      expect(STATIC_EXTENSIONS.has('avif')).toBe(true);
      expect(STATIC_EXTENSIONS.has('svg')).toBe(true);
    });

    it('contains font extensions', () => {
      expect(STATIC_EXTENSIONS.has('woff')).toBe(true);
      expect(STATIC_EXTENSIONS.has('woff2')).toBe(true);
      expect(STATIC_EXTENSIONS.has('ttf')).toBe(true);
    });

    it('contains script/style extensions', () => {
      expect(STATIC_EXTENSIONS.has('js')).toBe(true);
      expect(STATIC_EXTENSIONS.has('css')).toBe(true);
      expect(STATIC_EXTENSIONS.has('mjs')).toBe(true);
    });
  });
});