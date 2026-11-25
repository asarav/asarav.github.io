import fs from 'node:fs';
import path from 'node:path';
import { SITE } from '../lib/site';

export const prerender = true;

const PAGES_DIR = path.join(process.cwd(), 'src/pages');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

/**
 * One URL per real page. The list comes from the files themselves: a page opts
 * out with `export const sitemap = false;` (the consumption ledger does), and
 * 404 is never listed. Static .html files under public/ are listed too, because
 * the Jekyll sitemap plugin listed the verification file.
 */
function urls(): { loc: string; lastmod?: string }[] {
  // Pages first, ordered by the file they emit (so the home page sorts as
  // index.html, where jekyll-sitemap put it), then static .html files.
  const pages: { loc: string; key: string }[] = [];

  for (const file of fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.astro')).sort()) {
    if (file === '404.astro') continue;
    const source = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
    if (/export const sitemap = false;/.test(source)) continue;
    const base = file.slice(0, -'.astro'.length);
    const key = base === 'index' ? 'index.html' : `${base}/index.html`;
    pages.push({ loc: `${SITE}${base === 'index' ? '/' : `/${base}/`}`, key });
  }

  pages.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const statics = fs
    .readdirSync(PUBLIC_DIR)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((file) => ({
      loc: `${SITE}/${file}`,
      lastmod: fs.statSync(path.join(PUBLIC_DIR, file)).mtime.toISOString()
    }));

  return [...pages.map(({ loc }) => ({ loc })), ...statics];
}

export function GET() {
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd" xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls().flatMap(({ loc, lastmod }) => [
      '<url>',
      `<loc>${loc}</loc>`,
      ...(lastmod ? [`<lastmod>${lastmod}</lastmod>`] : []),
      '</url>'
    ]),
    '</urlset>',
    ''
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' }
  });
}
