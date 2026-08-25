import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { STATIC_EXTENSIONS } from './constants.js';

const RESERVED_NAMES = new Set([
  'Function', 'Object', 'Boolean', 'Number', 'String', 'Symbol',
  'Array', 'Date', 'Error', 'Map', 'Set', 'Promise', 'RegExp',
  'Package', 'Default', 'Import', 'Export', 'Switch', 'Case',
  'React', 'Link', 'Helmet', 'Component', 'Fragment'
]);

// Helper to camelCase CSS properties and SVG attributes
export function toCamelCase(str: string): string {
  if (str.startsWith('--')) return str; // Keep CSS variables as-is
  return str.replace(/-([a-z])/g, (g) => {
    const char = g[1];
    return char ? char.toUpperCase() : '';
  });
}

export function toPascalCase(str: string): string {
  if (!str || str === '/' || str === '/index') return 'Home';
  let name = str.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  if (!name) return 'Page';
  let pascal = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  if (/^[0-9]/.test(pascal)) pascal = 'Page' + pascal;
  if (RESERVED_NAMES.has(pascal)) pascal = 'Page' + pascal;
  return pascal;
}

export function buildRouteComponentMap(routes: string[]): Map<string, string> {
  const routeComponentMap = new Map<string, string>();
  const usedLowerNames = new Set<string>();

  for (const route of routes) {
    let compName = toPascalCase(route);
    if (!compName || /^\d/.test(compName)) {
      compName = `Page${compName || 'Home'}`;
    }
    if (usedLowerNames.has(compName.toLowerCase())) {
      let counter = 2;
      while (usedLowerNames.has(`${compName}${counter}`.toLowerCase())) {
        counter++;
      }
      compName = `${compName}${counter}`;
    }
    usedLowerNames.add(compName.toLowerCase());
    routeComponentMap.set(route, compName);
  }

  return routeComponentMap;
}

// Convert inline style string to React style object
export function parseStyle(styleStr: string): string {
  const rules: string[] = [];
  let cur = '';
  let inParen = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < styleStr.length; i++) {
    const ch = styleStr[i];
    if ((ch === '"' || ch === "'") && styleStr[i - 1] !== '\\') {
      if (!inQuote) { inQuote = true; quoteChar = ch; }
      else if (quoteChar === ch) { inQuote = false; }
    } else if (ch === '(' && !inQuote) {
      inParen++;
    } else if (ch === ')' && !inQuote) {
      inParen--;
    }
    
    if (ch === ';' && !inQuote && inParen === 0) {
      if (cur.trim()) rules.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) rules.push(cur.trim());

  const styleObj: string[] = [];
  for (const rule of rules) {
    const splitIndex = rule.indexOf(':');
    if (splitIndex === -1) continue;
    
    let key = rule.substring(0, splitIndex).trim();
    let value = rule.substring(splitIndex + 1).trim();
    if (!key || !value) continue;
    
    // React inline style objects do not support !important — strip only from end of value
    value = value.replace(/\s*!important\s*$/i, '').trim();

    if (key.startsWith('--')) {
      styleObj.push(`${JSON.stringify(key)}: ${JSON.stringify(value)}`);
    } else {
      let prop: string;
      if (key.startsWith('-ms-')) {
        prop = toCamelCase(key.slice(1));
      } else if (key.startsWith('-webkit-') || key.startsWith('-moz-') || key.startsWith('-o-')) {
        const c = toCamelCase(key.slice(1));
        prop = c.charAt(0).toUpperCase() + c.slice(1);
      } else {
        prop = toCamelCase(key);
      }

      styleObj.push(`${JSON.stringify(prop)}: ${JSON.stringify(value)}`);
    }
  }
  
  return `{${styleObj.join(', ')}}`;



}

// Known SVG tags that are lowercased by Cheerio but require camelCase in JSX
export const svgTagMap: Record<string, string> = {
  clippath: 'clipPath',
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  textpath: 'textPath',
  foreignobject: 'foreignObject',
  fegaussianblur: 'feGaussianBlur',
  fecolormatrix: 'feColorMatrix',
  fecomponenttransfer: 'feComponentTransfer',
  fecomposite: 'feComposite',
  feconvolvematrix: 'feConvolveMatrix',
  fediffuselighting: 'feDiffuseLighting',
  fedisplacementmap: 'feDisplacementMap',
  fedistantlight: 'feDistantLight',
  fedropshadow: 'feDropShadow',
  feflood: 'feFlood',
  fefunca: 'feFuncA',
  fefuncb: 'feFuncB',
  fefuncg: 'feFuncG',
  fefuncr: 'feFuncR',
  feimage: 'feImage',
  femerge: 'feMerge',
  femergenode: 'feMergeNode',
  femorphology: 'feMorphology',
  feoffset: 'feOffset',
  fepointlight: 'fePointLight',
  fespecularlighting: 'feSpecularLighting',
  fespotlight: 'feSpotLight',
  fetile: 'feTile',
  feturbulence: 'feTurbulence',
  feblend: 'feBlend',
  glyphref: 'glyphRef',
  animatemotion: 'animateMotion',
  animatetransform: 'animateTransform',
};

// Known SVG attributes that must be camelCased in React
export const svgCamelCaseMap: Record<string, string> = {
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-width': 'strokeWidth',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'clip-path': 'clipPath',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'vector-effect': 'vectorEffect',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'text-anchor': 'textAnchor',
  'alignment-baseline': 'alignmentBaseline',
  'dominant-baseline': 'dominantBaseline',
  'color-interpolation-filters': 'colorInterpolationFilters',
  'color-interpolation': 'colorInterpolation',
  'flood-color': 'floodColor',
  'flood-opacity': 'floodOpacity',
  'lighting-color': 'lightingColor',
  'mask-type': 'maskType',
  'maskcontentunits': 'maskContentUnits',
  'marker-start': 'markerStart',
  'marker-mid': 'markerMid',
  'marker-end': 'markerEnd',
  'shape-rendering': 'shapeRendering',
  'text-rendering': 'textRendering',
  'image-rendering': 'imageRendering',
  'pointer-events': 'pointerEvents',
  'primitiveunits': 'primitiveUnits',
  'specularconstant': 'specularConstant',
  'specularexponent': 'specularExponent',
  'surfacescale': 'surfaceScale',
  'diffuseconstant': 'diffuseConstant',
  'kernelmatrix': 'kernelMatrix',
  'kernelunitlength': 'kernelUnitLength',
  'keytimes': 'keyTimes',
  'keysplines': 'keySplines',
  'repeatdur': 'repeatDur',
  'stitchtiles': 'stitchTiles',
  'attributetype': 'attributeType',
  'calcmode': 'calcMode',
  'lengthadjust': 'lengthAdjust',
  'xmlns:xlink': 'xmlnsXlink',
  'xmlns:svg': 'xmlnsSvg',
  'xml:space': 'xmlSpace',
  'xml:lang': 'xmlLang',
  'xlink:href': 'xlinkHref',
  'xlink:title': 'xlinkTitle',
  'viewbox': 'viewBox',
  'preserveaspectratio': 'preserveAspectRatio',
  'patternunits': 'patternUnits',
  'patterntransform': 'patternTransform',
  'gradientunits': 'gradientUnits',
  'gradienttransform': 'gradientTransform',
  'clippathunits': 'clipPathUnits',
  'maskunits': 'maskUnits',
  'spreadmethod': 'spreadMethod',
  'startoffset': 'startOffset',
  'stddeviation': 'stdDeviation',
  'basefrequency': 'baseFrequency',
  'numoctaves': 'numOctaves',
  'repeatcount': 'repeatCount',
  'attributename': 'attributeName',
  'pathlength': 'pathLength',
  'tablevalues': 'tableValues',
  'edgemode': 'edgeMode',
  'filterunits': 'filterUnits',
  'targetx': 'targetX',
  'targety': 'targetY',
  'markerwidth': 'markerWidth',
  'markerheight': 'markerHeight',
  'refx': 'refX',
  'refy': 'refY',
};

// HTML attribute name normalizations for React
export const htmlAttrMap: Record<string, string> = {
  'class': 'className',
  'for': 'htmlFor',
  'autocomplete': 'autoComplete',
  'autofocus': 'autoFocus',
  'contenteditable': 'contentEditable',
  'spellcheck': 'spellCheck',
  'novalidate': 'noValidate',
  'maxlength': 'maxLength',
  'minlength': 'minLength',
  'colspan': 'colSpan',
  'rowspan': 'rowSpan',
  'playsinline': 'playsInline',
  'datetime': 'dateTime',
  'http-equiv': 'httpEquiv',
  'charset': 'charSet',
  'enctype': 'encType',
  'allowfullscreen': 'allowFullScreen',
  'frameborder': 'frameBorder',
  'usemap': 'useMap',
  'srcdoc': 'srcDoc',
  'srclang': 'srcLang',
  'inputmode': 'inputMode',
  'srcset': 'srcSet',
  'crossorigin': 'crossOrigin',
  'tabindex': 'tabIndex',
  'readonly': 'readOnly',
  'autoplay': 'autoPlay',
  'ismap': 'isMap',
  'itemscope': 'itemScope',
  'itemprop': 'itemProp',
  'itemtype': 'itemType',
  'itemid': 'itemId',
  'itemref': 'itemRef',
  'nomodule': 'noModule',
  'accesskey': 'accessKey',
  'autocapitalize': 'autoCapitalize',
  'popovertarget': 'popoverTarget',
  'popovertargetaction': 'popoverTargetAction',
  'fetchpriority': 'fetchPriority',
  'imagesrcset': 'imageSrcSet',
  'imagesizes': 'imageSizes',
  'referrerpolicy': 'referrerPolicy',
};


// Standard boolean attributes in HTML
export const booleanAttrs = new Set([
  'disabled', 'checked', 'readonly', 'autoplay', 'loop', 'muted',
  'required', 'multiple', 'open', 'autofocus', 'novalidate', 'playsinline',
  'controls', 'default', 'defer', 'async', 'hidden', 'ismap', 'itemscope',
  'nomodule', 'reversed', 'selected', 'allowfullscreen', 'formnovalidate', 'inert', 'download'
]);

// Self-closing tags in JSX
export const voidElements = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

export function nodeToJsx(el: any, $: any, indent = '', currentRoute = '/'): { jsx: string; usesLink: boolean } {
  if (el.type === 'text') {
    const text = (el.data || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/{/g, '&#123;')
      .replace(/}/g, '&#125;');
    return { jsx: text, usesLink: false };
  }
  
  if (el.type === 'comment') {
    const safeComment = (el.data || '').replace(/\*\//g, '* /');
    return { jsx: `${indent}{/* ${safeComment} */}\n`, usesLink: false };
  }
  
  // domhandler types <script> nodes as 'script' (not 'tag'); let them through so
  // the script branch below can emit inline body scripts
  if (el.type !== 'tag' && el.type !== 'style' && el.type !== 'script') {
    return { jsx: '', usesLink: false };
  }


  let rawTagName = el.tagName || '';
  let lowerTagName = rawTagName.toLowerCase();
  let tagName = svgTagMap[lowerTagName] || rawTagName;
  const isInsideSvg = $(el).parents('svg').length > 0;

  let attrs = '';
  let usesLink = false;
  let isInternalLink = false;

  const rawAttribs = el.attribs || {};
  for (const [key, rawVal] of Object.entries(rawAttribs)) {
    const lowerKey = key.toLowerCase();
    
    // Strip inline on* event handlers to avoid React compile/runtime crashes
    if (/^on[a-z]+/i.test(lowerKey)) {
      continue;
    }

    const value = String(rawVal ?? '');
    let propName = htmlAttrMap[lowerKey] || key;
    let propValue = JSON.stringify(value);

    // Form elements: convert static controlled attributes to uncontrolled defaults
    if ((lowerTagName === 'input' || lowerTagName === 'textarea' || lowerTagName === 'select')) {
      if (lowerKey === 'value') propName = 'defaultValue';
      if (lowerKey === 'checked') propName = 'defaultChecked';
    }

    // Option element: strip selected attribute (handled on parent select defaultValue)
    if (lowerTagName === 'option' && lowerKey === 'selected') {
      continue;
    }

    if (key.startsWith('data-') || key.startsWith('aria-')) {
      propName = key;
    } else if (lowerKey === 'style') {
      propValue = `{${parseStyle(value)}}`;
    } else if (lowerKey === 'tabindex') {
      const parsed = parseInt(value, 10);
      propValue = isNaN(parsed) ? '{undefined}' : `{${parsed}}`;
    } else if (isInsideSvg || svgCamelCaseMap[lowerKey]) {
      propName = svgCamelCaseMap[lowerKey] || htmlAttrMap[lowerKey] || toCamelCase(key);
    }

    if (tagName === 'a' && lowerKey === 'href') {
      const isDownload = 'download' in rawAttribs;
      const isExternal = 
        value.startsWith('http://') || 
        value.startsWith('https://') || 
        value.startsWith('//') || 
        value.startsWith('mailto:') || 
        value.startsWith('tel:') || 
        value.startsWith('sms:') || 
        value.startsWith('blob:') || 
        value.startsWith('data:') || 
        value.startsWith('#') || 
        value.startsWith('javascript:');

      const isStaticAsset = value.startsWith('/assets/') || Array.from(STATIC_EXTENSIONS).some(ext => value.toLowerCase().endsWith(`.${ext}`));


      if (!isExternal && !isDownload && !isInsideSvg && !isStaticAsset) {
        isInternalLink = true;
        propName = 'to';

        let targetRoute = value.trim();
        const hashMatch = targetRoute.match(/^([^#]*)(#.*)$/);
        let pathPart = (hashMatch ? hashMatch[1] : targetRoute) || '';
        const hashPart = (hashMatch ? hashMatch[2] : '') || '';

        // Resolve relative links (e.g. "../about", "./team") against current page route
        if (!pathPart.startsWith('/')) {
          try {
            const base = currentRoute.startsWith('/') ? currentRoute : '/' + currentRoute;
            const resolved = new URL(pathPart, `http://dummy.com${base}`);
            pathPart = resolved.pathname;
          } catch {}
        }

        pathPart = pathPart.replace(/^\.?\//, '').replace(/^\/+/, '');
        if (pathPart === '' || pathPart === '.' || pathPart === 'index' || pathPart === 'index.html') {
          targetRoute = '/' + hashPart;
        } else {
          pathPart = pathPart.replace(/\.html$/i, '');
          targetRoute = '/' + pathPart + hashPart;
        }
        propValue = JSON.stringify(targetRoute);
      }
    }


    if (booleanAttrs.has(lowerKey)) {
      if (value === '' || value.toLowerCase() === lowerKey || value === 'true') {
        attrs += ` ${propName}`;
      } else if (value === 'false') {
        attrs += ` ${propName}={false}`;
      } else {
        // Valued attribute like hidden="until-found" or download="file.pdf"
        attrs += ` ${propName}=${JSON.stringify(value)}`;
      }
    } else if (propValue.startsWith('{') && propValue.endsWith('}')) {
      attrs += ` ${propName}=${propValue}`;
    } else {
      let finalStr = value;
      try {
        finalStr = JSON.parse(propValue);
      } catch {}
      if (/[\\"{}\n\r]/.test(finalStr)) {
        attrs += ` ${propName}={${JSON.stringify(finalStr)}}`;
      } else {
        attrs += ` ${propName}="${finalStr}"`;
      }
    }


  }

  const hasValueAttr = 'value' in rawAttribs || 'defaultvalue' in rawAttribs || 'defaultValue' in rawAttribs;

  // Handle select defaultValue from selected child option if not explicitly set
  if (lowerTagName === 'select' && !hasValueAttr) {
    const selectedOption = $(el).find('option[selected]').first();
    if (selectedOption.length > 0) {
      const selectedVal = selectedOption.attr('value') ?? selectedOption.text();
      attrs += ` defaultValue={${JSON.stringify(selectedVal)}}`;
    }
  }

  // Handle textarea defaultValue from text content and render without children
  if (lowerTagName === 'textarea') {
    if (!hasValueAttr) {
      const textContent = $(el).text();
      if (textContent) {
        attrs += ` defaultValue={${JSON.stringify(textContent)}}`;
      }
    }
    return { jsx: `${indent}<textarea${attrs} />`, usesLink: false };
  }


  if (el.tagName === 'style') {
    const css = $(el).html() || '';
    return { jsx: `${indent}<style${attrs} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(css)} }} />\n`, usesLink: false };
  }

  if (el.tagName === 'script') {
    const js = $(el).html() || '';
    if (js.trim()) {
      return { jsx: `${indent}<script${attrs} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(js)} }} />\n`, usesLink: false };
    }
    return { jsx: `${indent}<script${attrs}></script>\n`, usesLink: false };
  }

  if (tagName === 'a' && isInternalLink) {
    tagName = 'Link';
    usesLink = true;
  }

  const isVoid = voidElements.has(lowerTagName);
  if (isVoid) {
    return { jsx: `${indent}<${tagName}${attrs} />`, usesLink };
  }


  const children = $(el).contents().toArray();
  if (children.length === 0) {
    // Self-close empty SVG tags
    if (isInsideSvg || ['path', 'circle', 'rect', 'line', 'polygon', 'stop', 'use'].includes(lowerTagName)) {
      return { jsx: `${indent}<${tagName}${attrs} />`, usesLink };
    }
    return { jsx: `${indent}<${tagName}${attrs}></${tagName}>`, usesLink };
  }

  let innerJsx = '';
  for (const child of children) {
    const res = nodeToJsx(child, $, indent + '  ', currentRoute);
    innerJsx += res.jsx;
    if (res.usesLink) usesLink = true;
  }

  if (children.length === 1 && children[0].type === 'text') {
    return { jsx: `${indent}<${tagName}${attrs}>${innerJsx}</${tagName}>`, usesLink };
  }

  return { jsx: `${indent}<${tagName}${attrs}>\n${innerJsx}\n${indent}</${tagName}>`, usesLink };
}

export async function compileToReact(
  outputDir: string, 
  pages: Record<string, string>, 
  options: { typescript?: boolean } = { typescript: true }
): Promise<void> {
  const isTs = options.typescript !== false;
  const ext = isTs ? 'tsx' : 'jsx';
  console.log(`  [Compiler] Translating HTML to React ${isTs ? 'TSX' : 'JSX'}...`);
  
  const pagesDir = path.join(outputDir, 'src', 'pages');
  await fs.mkdir(pagesDir, { recursive: true });

  const routeMap = buildRouteComponentMap(Object.keys(pages));

  for (const [route, htmlContent] of Object.entries(pages)) {
    const $ = cheerio.load(htmlContent);
    const body = $('body');
    
    let jsxContent = '';
    let pageUsesLink = false;
    const bodyChildren = body.contents().toArray();
    
    for (const child of bodyChildren) {
      if (child.type === 'text' && !child.data?.trim()) continue;
      const res = nodeToJsx(child, $, '        ', route);
      jsxContent += res.jsx;
      if (res.usesLink) pageUsesLink = true;
    }

    let helmetContent = '';
    let usesHelmet = false;
    const headChildren = $('head').contents().toArray();
    for (const child of headChildren) {
      if (child.type === 'tag') {
        const tagName = child.tagName.toLowerCase();
        // Keep SEO tags, stylesheets, styles, and noscript in Helmet
        if (tagName === 'title' || tagName === 'meta' || tagName === 'style' || tagName === 'noscript') {
          const res = nodeToJsx(child, $, '          ', route);
          if (res.jsx.trim()) {
            helmetContent += res.jsx;
            usesHelmet = true;
          }
        } else if (tagName === 'link') {
          // Keep all link tags (stylesheets, canonical, icons, preloads, etc.)
          const res = nodeToJsx(child, $, '          ', route);
          if (res.jsx.trim()) {
            helmetContent += res.jsx;
            usesHelmet = true;
          }
        }
      }
    }

    const componentName = routeMap.get(route) || toPascalCase(route);

    const typeAnnotation = isTs ? ': React.FC' : '';

    const reactComponent = `import React from 'react';
${pageUsesLink ? "import { Link } from 'react-router-dom';\n" : ""}${usesHelmet ? "import { Helmet } from 'react-helmet-async';\n" : ""}
export const ${componentName}${typeAnnotation} = () => {
  return (
    <>
${usesHelmet ? `      <Helmet>\n${helmetContent}      </Helmet>\n` : ''}${jsxContent}
    </>
  );
};

export default ${componentName};
`;


    await fs.writeFile(path.join(pagesDir, `${componentName}.${ext}`), reactComponent);
    console.log(`        Generated src/pages/${componentName}.${ext}`);
  }
}
