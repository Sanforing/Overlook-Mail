/**
 * Client-side EPUB parser.
 * Extracts readable plain text and TOC chapter entries from an EPUB Blob.
 * Uses JSZip loaded lazily from CDN — no install required.
 *
 * Exports:
 *   isEpubSource(name, type) → boolean
 *   parseEpubBlob(blob)      → { text: string, chapters: [{title, line}] }
 */

const EPUB_JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
let jsZipModulePromise = null;

export function isEpubSource(name = '', type = '') {
  return /\.epub(?:$|[?#])/i.test(String(name)) || String(type).toLowerCase().includes('epub');
}

export async function parseEpubBlob(blob) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const containerXml = await readZipText(zip, 'META-INF/container.xml');
  const containerDoc = parseXml(containerXml, 'container.xml');
  const rootfile = containerDoc.querySelector('rootfile[full-path]')?.getAttribute('full-path');
  if (!rootfile) throw new Error('EPUB package file not found');

  const opfXml = await readZipText(zip, rootfile);
  const opfDoc = parseXml(opfXml, rootfile);
  const opfDir = dirName(rootfile);
  const manifest = new Map();
  opfDoc.querySelectorAll('manifest item[id][href]').forEach(item => {
    manifest.set(item.getAttribute('id'), {
      href: item.getAttribute('href'),
      path: resolveEpubPath(opfDir, item.getAttribute('href')),
      mediaType: item.getAttribute('media-type') || '',
      properties: item.getAttribute('properties') || ''
    });
  });

  const spineItems = [...opfDoc.querySelectorAll('spine itemref[idref]')]
    .map(item => manifest.get(item.getAttribute('idref')))
    .filter(Boolean);
  if (!spineItems.length) throw new Error('EPUB spine is empty');

  const tocTitles = await readEpubToc(zip, opfDoc, manifest, opfDir);
  const sections = [];
  const chapters = [];
  let lineOffset = 0;

  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];
    const html = await readZipText(zip, item.path).catch(() => '');
    if (!html) continue;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fallbackTitle = doc.querySelector('h1,h2,h3,title')?.textContent?.trim() || `Chapter ${i + 1}`;
    const title = tocTitles.get(stripHash(item.path)) || fallbackTitle;
    const bodyText = htmlDocumentToText(doc).trim();
    const sectionText = [title, bodyText].filter(Boolean).join('\n\n');
    if (!sectionText) continue;
    chapters.push({ title, line: lineOffset });
    sections.push(sectionText);
    lineOffset += sectionText.split('\n').length + 2;
  }

  const text = sections.join('\n\n').trim();
  return { text: text || '(empty EPUB document)', chapters };
}

async function loadJSZip() {
  if (!jsZipModulePromise) jsZipModulePromise = import(/* @vite-ignore */ EPUB_JSZIP_URL);
  const mod = await jsZipModulePromise;
  return mod.default || mod;
}

async function readEpubToc(zip, opfDoc, manifest, opfDir) {
  const toc = new Map();
  const navItem = [...manifest.values()].find(item => /\bnav\b/.test(item.properties));
  if (navItem) {
    const navHtml = await readZipText(zip, navItem.path).catch(() => '');
    if (navHtml) {
      const navDoc = new DOMParser().parseFromString(navHtml, 'text/html');
      const navDir = dirName(navItem.path);
      navDoc.querySelectorAll('nav a[href], [epub\\:type="toc"] a[href], a[href]').forEach(a => {
        const title = a.textContent?.trim();
        const href = a.getAttribute('href');
        if (title && href) toc.set(stripHash(resolveEpubPath(navDir, href)), title);
      });
    }
  }

  const spineTocId = opfDoc.querySelector('spine')?.getAttribute('toc');
  const ncxItem = (spineTocId && manifest.get(spineTocId))
    || [...manifest.values()].find(item => item.mediaType === 'application/x-dtbncx+xml');
  if (ncxItem) {
    const ncxXml = await readZipText(zip, ncxItem.path).catch(() => '');
    if (ncxXml) {
      const ncxDoc = parseXml(ncxXml, ncxItem.path);
      const ncxDir = dirName(ncxItem.path);
      ncxDoc.querySelectorAll('navPoint').forEach(point => {
        const title = point.querySelector('navLabel text')?.textContent?.trim();
        const src = point.querySelector('content[src]')?.getAttribute('src');
        if (title && src) toc.set(stripHash(resolveEpubPath(ncxDir, src)), title);
      });
    }
  }
  return toc;
}

async function readZipText(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error(`Missing EPUB file: ${path}`);
  return file.async('text');
}

function parseXml(xml, label) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`Invalid EPUB XML: ${label}`);
  return doc;
}

function htmlDocumentToText(doc) {
  doc.querySelectorAll('script,style,svg,audio,video,iframe,nav').forEach(node => node.remove());
  const blocks = new Set(['ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','BR','DD','DIV','DL','DT','FIGCAPTION','FIGURE','FOOTER','H1','H2','H3','H4','H5','H6','HEADER','HR','LI','MAIN','OL','P','PRE','SECTION','TABLE','TR','UL']);
  const out = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.replace(/\s+/g, ' ');
      if (text.trim()) out.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const isBlock = blocks.has(node.tagName);
    if (isBlock) out.push('\n');
    node.childNodes.forEach(walk);
    if (isBlock) out.push('\n');
  };
  walk(doc.body || doc.documentElement);
  return out.join('').replace(/\u00a0/g, ' ').split('\n').map(line => line.trim()).filter(Boolean).join('\n');
}

function dirName(path) {
  const idx = String(path).lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

function resolveEpubPath(base, href) {
  const cleanHref = String(href || '').split('#')[0];
  const url = new URL(cleanHref, `https://epub.local/${base ? `${base}/` : ''}`);
  return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
}

function stripHash(path) {
  return String(path || '').split('#')[0];
}
