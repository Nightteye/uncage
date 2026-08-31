import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import {
  toCamelCase,
  toPascalCase,
  parseStyle,
  buildRouteComponentMap,
  nodeToJsx,
  svgTagMap,
  svgCamelCaseMap,
  htmlAttrMap,
  booleanAttrs,
  voidElements,
} from './parser.js';

describe('parser utilities', () => {
  describe('toCamelCase', () => {
    it('converts kebab-case to camelCase', () => {
      expect(toCamelCase('background-color')).toBe('backgroundColor');
      expect(toCamelCase('font-size')).toBe('fontSize');
      expect(toCamelCase('z-index')).toBe('zIndex');
    });

    it('handles vendor prefixes', () => {
      expect(toCamelCase('-webkit-transform')).toBe('WebkitTransform');
      expect(toCamelCase('-moz-transition')).toBe('MozTransition');
      expect(toCamelCase('-ms-grid')).toBe('MsGrid');
    });

    it('preserves CSS variables', () => {
      expect(toCamelCase('--my-color')).toBe('--my-color');
      expect(toCamelCase('--custom-property')).toBe('--custom-property');
    });

    it('handles edge cases', () => {
      expect(toCamelCase('')).toBe('');
      expect(toCamelCase('single')).toBe('single');
      expect(toCamelCase('alreadyCamel')).toBe('alreadyCamel');
    });
  });

  describe('toPascalCase', () => {
    it('converts routes to PascalCase component names', () => {
      expect(toPascalCase('/')).toBe('Home');
      expect(toPascalCase('/about')).toBe('About');
      expect(toPascalCase('/blog/post')).toBe('BlogPost');
      expect(toPascalCase('/my-page_name')).toBe('MyPageName');
    });

    it('handles numeric prefixes', () => {
      expect(toPascalCase('/404')).toBe('Page404');
      expect(toPascalCase('/2024-report')).toBe('Page2024Report');
    });

    it('avoids reserved names', () => {
      expect(toPascalCase('/react')).toBe('PageReact');
      expect(toPascalCase('/component')).toBe('PageComponent');
      expect(toPascalCase('/link')).toBe('PageLink');
    });

    it('handles empty and special cases', () => {
      expect(toPascalCase('')).toBe('Home');
      expect(toPascalCase('/index')).toBe('Home');
    });
  });

  describe('parseStyle', () => {
    it('parses simple style strings', () => {
      const result = parseStyle('color: red; font-size: 16px');
      expect(result).toContain('"color": "red"');
      expect(result).toContain('"fontSize": "16px"');
    });

    it('handles complex values with parentheses', () => {
      const result = parseStyle('transform: translate(10px, 20px); filter: blur(5px)');
      expect(result).toContain('"transform": "translate(10px, 20px)"');
      expect(result).toContain('"filter": "blur(5px)"');
    });

    it('handles quoted values', () => {
      const result = parseStyle('font-family: "Helvetica Neue", sans-serif; content: "\\"hello\\""');
      expect(result).toContain('fontFamily');
    });

    it('strips !important', () => {
      const result = parseStyle('color: red !important; margin: 0');
      expect(result).not.toContain('!important');
    });

    it('handles CSS variables', () => {
      const result = parseStyle('--my-color: #fff; --spacing: 1rem');
      expect(result).toContain('"--my-color": "#fff"');
      expect(result).toContain('"--spacing": "1rem"');
    });

    it('returns empty object for empty string', () => {
      expect(parseStyle('')).toBe('{}');
      expect(parseStyle('   ')).toBe('{}');
    });

    it('preserves url() values containing semicolons', () => {
      const result = parseStyle('background-image: url(data:image/svg+xml;utf8,<svg></svg>); color: red');
      expect(result).toContain('backgroundImage');
      expect(result).toContain('url(data:image/svg+xml;utf8,<svg></svg>)');
      expect(result).toContain('"color": "red"');
    });
  });

  describe('buildRouteComponentMap', () => {
    it('creates unique component names for routes', () => {
      const routes = ['/', '/about', '/contact', '/blog/post'];
      const map = buildRouteComponentMap(routes);

      expect(map.get('/')).toBe('Home');
      expect(map.get('/about')).toBe('About');
      expect(map.get('/contact')).toBe('Contact');
      expect(map.get('/blog/post')).toBe('BlogPost');
    });

    it('handles duplicate route names', () => {
      const routes = ['/page', '/page-2', '/page_3'];
      const map = buildRouteComponentMap(routes);

      const names = Array.from(map.values());
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('handles case-insensitive collisions', () => {
      const routes = ['/About', '/about'];
      const map = buildRouteComponentMap(routes);

      const names = Array.from(map.values());
      expect(names.length).toBe(2);
      expect(new Set(names.map(n => n.toLowerCase())).size).toBe(2);
    });
  });

  describe('constant maps', () => {
    it('svgTagMap contains expected mappings', () => {
      expect(svgTagMap.clippath).toBe('clipPath');
      expect(svgTagMap.lineargradient).toBe('linearGradient');
      expect(svgTagMap.fegaussianblur).toBe('feGaussianBlur');
    });

    it('svgCamelCaseMap contains expected mappings', () => {
      expect(svgCamelCaseMap['fill-rule']).toBe('fillRule');
      expect(svgCamelCaseMap['stroke-width']).toBe('strokeWidth');
      expect(svgCamelCaseMap['viewbox']).toBe('viewBox');
      expect(svgCamelCaseMap['xlink:href']).toBe('xlinkHref');
    });

    it('htmlAttrMap contains expected mappings', () => {
      expect(htmlAttrMap.class).toBe('className');
      expect(htmlAttrMap.for).toBe('htmlFor');
      expect(htmlAttrMap.tabindex).toBe('tabIndex');
      expect(htmlAttrMap.srcset).toBe('srcSet');
    });

    it('htmlAttrMap omits React 19-only attributes so React 18 exports stay warning-free', () => {
      expect(htmlAttrMap.fetchpriority).toBeUndefined();
      expect(htmlAttrMap.popovertarget).toBeUndefined();
      expect(htmlAttrMap.popovertargetaction).toBeUndefined();
    });

    it('nodeToJsx leaves fetchpriority lowercase (React 18 does not recognize fetchPriority)', () => {
      const $ = cheerio.load('<link rel="preload" fetchpriority="high" href="/x.css" />');
      const res = nodeToJsx($('link')[0], $, '', '/');
      expect(res.jsx).toContain('fetchpriority="high"');
      expect(res.jsx).not.toContain('fetchPriority');
    });

    it('booleanAttrs contains common boolean attributes', () => {
      expect(booleanAttrs.has('disabled')).toBe(true);
      expect(booleanAttrs.has('checked')).toBe(true);
      expect(booleanAttrs.has('readonly')).toBe(true);
      expect(booleanAttrs.has('hidden')).toBe(true);
    });

    it('voidElements contains self-closing tags', () => {
      expect(voidElements.has('img')).toBe(true);
      expect(voidElements.has('br')).toBe(true);
      expect(voidElements.has('input')).toBe(true);
      expect(voidElements.has('meta')).toBe(true);
      expect(voidElements.has('link')).toBe(true);
    });
  });
});