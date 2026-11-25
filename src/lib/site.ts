import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import imageSizes from '../generated/image-sizes.json';

export const SITE = 'https://asarav.github.io';
export const SITE_NAME = 'Avinash Saravanan, asarav';
export const AUTHOR = 'Avinash Saravanan';

/** Absolute, root-relative URL for an asset path declared in page data. */
export function asset(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}

/** Same, but leaves already-absolute links (external sites) untouched. */
export function assetOrUrl(value: string): string {
  return /^[a-z]+:/i.test(value) ? value : asset(value);
}

/**
 * width/height for a local image, read from the map scripts/build-assets.mjs
 * generates at build time. Reserving the box up front keeps images from
 * shifting the page as they arrive; remote images are not fetched at build
 * time, so they get no attributes.
 */
export function imageAttrs(src: string): Record<string, number> {
  const size = (imageSizes as Record<string, [number, number]>)[src];
  return size ? { width: size[0], height: size[1] } : {};
}

/** Absolute URL for a data-supplied asset path, as jekyll's absolute_url did. */
export function absolute(value: string): string {
  return `${SITE}${asset(value)}`;
}

/** Canonical URL for a route path (always trailing-slash style). */
export function canonical(pathname: string): string {
  return `${SITE}${pathname}`;
}

/** Title rule: the home page stands alone, every other page is suffixed. */
export function pageTitle(title: string, pathname: string): string {
  return pathname === '/' ? title : `${title} | asarav`;
}

/** The build date, in the format the blueprint page printed for `site.time`. */
export function buildDateLabel(now = new Date()): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

/** Read a Jekyll data file. Phase 4 moves these into src/data. */
function loadData<T>(file: string): T {
  return parse(fs.readFileSync(path.join(process.cwd(), 'src', 'data', file), 'utf8')) as T;
}

export interface CalendarEntry {
  month: string;
  day: number;
  page: string;
  label: string;
}

/**
 * Recurring anniversaries for the seasonal motion layer. Still read from the
 * Jekyll data file; Phase 4 moves it into src/data with a schema.
 */
export function calendarEntries(): CalendarEntry[] {
  const items = loadData<CalendarEntry[]>('calendar.yml');
  return items.map(({ month, day, page, label }) => ({ month, day, page, label }));
}

export interface Game {
  title: string;
  style: string;
  link: string;
  images: { src: string }[];
  explanation: string;
}

export function games(): Game[] {
  return loadData<Game[]>('games.yaml');
}

export interface LogEntry {
  date: string;
  explanation: string;
  image?: string;
  image2?: string;
}

export function logEntries(): LogEntry[] {
  return loadData<LogEntry[]>('log.yaml');
}

export interface Song {
  title: string;
  src: string;
  explanation: string;
}

export function songs(): Song[] {
  return loadData<Song[]>('music.yaml');
}

export interface MediumArticle {
  title: string;
  url: string;
  date: string;
  views?: string;
  image: string;
  blurb?: string;
}

export function mediumArticles(): MediumArticle[] {
  return loadData<MediumArticle[]>('medium.yml');
}

export interface ConsumptionEntry {
  type: string;
  completionDate: string;
  title: string;
  source: string;
  sourceDateAndInfo?: string;
  image: string;
  explanation: string;
}

export function consumptionEntries(): ConsumptionEntry[] {
  return loadData<ConsumptionEntry[]>('consumption.yaml');
}

/** jekyll's `date: '%b %Y'` for an ISO date string. */
export function shortMonthYear(iso: string): string {
  const [year, month] = iso.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(month) - 1]} ${year}`;
}

/** jekyll's default slugify, used for the status log entry anchors. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The subset of kramdown's `markdownify` the site relies on: folded data
 * strings become one paragraph and straight apostrophes become typographic
 * ones, with inline HTML passed through. Verified against the Jekyll output.
 */
export function markdownify(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/'/g, '\u2019')
    )
    .filter(Boolean)
    .map((block) => `<p>${block}</p>`);
  return paragraphs.join('\n');
}
