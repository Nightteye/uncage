import { describe, it, expect } from 'vitest';
import { cleanHead } from './assembler.js';

describe('cleanHead', () => {
  it('preserves functional inline scripts (theme/init/JSON-LD)', () => {
    const head = '<title>X</title><script>window.__INITIAL_STATE__ = {};</script><script type="application/ld+json">{"@type":"WebSite"}</script>';
    const { cleanedHead } = cleanHead(head);
    expect(cleanedHead).toContain('window.__INITIAL_STATE__');
    expect(cleanedHead).toContain('application/ld+json');
  });

  it('strips analytics/tracking inline scripts by default', () => {
    const head = '<title>X</title><script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}</script>';
    const { cleanedHead } = cleanHead(head);
    expect(cleanedHead).not.toContain('dataLayer');
    expect(cleanedHead).not.toContain('gtag(');
  });

  it('keeps analytics inline scripts when keepAnalytics is true', () => {
    const head = '<title>X</title><script>function gtag(){dataLayer.push(arguments);}</script>';
    const { cleanedHead } = cleanHead(head, { keepAnalytics: true });
    expect(cleanedHead).toContain('gtag(');
  });

  it('still strips external analytics scripts by default', () => {
    const head = '<title>X</title><script src="https://www.googletagmanager.com/gtag/js?id=G-XXX"></script>';
    const { cleanedHead } = cleanHead(head);
    expect(cleanedHead).not.toContain('googletagmanager');
  });
});
