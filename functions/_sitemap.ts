// Shared sitemap logic — sitemap index + chunked child sitemaps
// Keeps every single sitemap file small & fast (Google limit: 50k URLs / 50MB)

export const SITE = 'https://kotobi.xyz';
export const SUPABASE_URL = 'https://kydmyxsgyxeubhmqzrgo.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0';

// Rows per child sitemap. Books produce 1 URL per row (canonical /book/<slug>),
// so 10000 rows = 10k URLs — well under the 50k limit.
export const BOOKS_PER_FILE = 10000;
export const ROWS_PER_FILE = 10000;

// Supabase/PostgREST hard-caps a single response at 1000 rows (max-rows).
// Anything above this MUST be fetched page by page with Range headers,
// otherwise sitemaps silently truncate to the first 1000 URLs.
export const PAGE_SIZE = 1000;



export const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

export function encodePathSegment(value: string) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

export function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function iso(value?: string | null) {
  const d = value ? new Date(value) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export interface Url {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export function xmlResponse(body: string, maxAge = 3600) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      // NOTE: never send "X-Robots-Tag: noindex" on a sitemap — Google can reject
      // the whole file and stop discovering the URLs inside it.

    },
  });
}

export function renderUrlset(urls: Url[]) {
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${xmlEscape(u.url)}</loc>${u.lastmod ? `
    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq || 'weekly'}</changefreq>
    <priority>${u.priority ?? 0.5}</priority>
  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export function renderIndex(entries: { loc: string; lastmod?: string }[]) {
  const body = entries
    .map(
      (e) => `  <sitemap>
    <loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `
    <lastmod>${e.lastmod}</lastmod>` : ''}
  </sitemap>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
}

/** Exact row count via PostgREST HEAD + Content-Range */
export async function countRows(table: string, filter = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id${filter}&limit=1`, {
    method: 'HEAD',
    headers: { ...headers, Prefer: 'count=exact' },
    signal: AbortSignal.timeout(8000),
  });
  const range = res.headers.get('content-range') || '';
  const total = parseInt(range.split('/')[1] || '0', 10);
  return isNaN(total) ? 0 : total;
}

export async function fetchRows(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  return (await res.json()) as any[];
}

/**
 * Fetches `count` rows starting at `offset`, transparently paginating around the
 * PostgREST 1000-row cap. `path` must NOT contain offset/limit.
 */
export async function fetchPaged(path: string, offset: number, count: number) {
  const out: any[] = [];
  for (let start = 0; start < count; start += PAGE_SIZE) {
    const from = offset + start;
    const to = Math.min(from + PAGE_SIZE, offset + count) - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...headers, 'Range-Unit': 'items', Range: `${from}-${to}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) break;
    const rows = (await res.json()) as any[];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

export const STATIC_PAGES: Url[] = [
  { url: `${SITE}/`, changefreq: 'daily', priority: 1.0 },
  { url: `${SITE}/categories`, changefreq: 'weekly', priority: 0.9 },
  { url: `${SITE}/authors`, changefreq: 'weekly', priority: 0.9 },
  { url: `${SITE}/quotes`, changefreq: 'daily', priority: 0.8 },
  { url: `${SITE}/reading-clubs`, changefreq: 'weekly', priority: 0.7 },
  { url: `${SITE}/suggestions`, changefreq: 'weekly', priority: 0.7 },
  { url: `${SITE}/upload-book`, changefreq: 'monthly', priority: 0.6 },
  { url: `${SITE}/leaderboard`, changefreq: 'weekly', priority: 0.6 },
  { url: `${SITE}/shop`, changefreq: 'weekly', priority: 0.5 },
  { url: `${SITE}/rewards`, changefreq: 'weekly', priority: 0.5 },
  { url: `${SITE}/cover-designer`, changefreq: 'monthly', priority: 0.5 },
  { url: `${SITE}/site-updates`, changefreq: 'weekly', priority: 0.5 },
  { url: `${SITE}/about-us`, changefreq: 'monthly', priority: 0.5 },
  { url: `${SITE}/contact-us`, changefreq: 'monthly', priority: 0.5 },
  { url: `${SITE}/donation`, changefreq: 'monthly', priority: 0.5 },
  { url: `${SITE}/privacy-policy`, changefreq: 'yearly', priority: 0.3 },
  { url: `${SITE}/terms-of-service`, changefreq: 'yearly', priority: 0.3 },
];

/** Newest approved books — small, refreshed often so Google picks up uploads fast */
export const LATEST_LIMIT = 500;

/** Builds the sitemap index (small, instant to load) */
export async function buildIndex() {
  const [books, authors, categories, clubs, users] = await Promise.all([
    countRows('book_submissions', '&status=eq.approved'),
    countRows('authors'),
    countRows('categories'),
    countRows('reading_clubs', '&is_public=eq.true'),
    countRows('profiles', '&username=not.is.null&author_slug=is.null'),
  ]);

  // No <lastmod> here: it would only reflect sitemap generation time, not real
  // content changes, which makes crawlers distrust it.
  const entries: { loc: string; lastmod?: string }[] = [
    { loc: `${SITE}/sitemaps/pages.xml` },
    { loc: `${SITE}/sitemaps/latest.xml` },
  ];

  const chunks = (total: number, per: number) => Math.max(1, Math.ceil(total / per));

  for (let i = 1; i <= chunks(books, BOOKS_PER_FILE); i++) {
    entries.push({ loc: `${SITE}/sitemaps/books-${i}.xml` });
  }
  for (let i = 1; i <= chunks(authors, ROWS_PER_FILE); i++) {
    entries.push({ loc: `${SITE}/sitemaps/authors-${i}.xml` });
  }
  for (let i = 1; i <= chunks(categories, ROWS_PER_FILE); i++) {
    entries.push({ loc: `${SITE}/sitemaps/categories-${i}.xml` });
  }
  if (clubs > 0) {
    for (let i = 1; i <= chunks(clubs, ROWS_PER_FILE); i++) {
      entries.push({ loc: `${SITE}/sitemaps/clubs-${i}.xml` });
    }
  }
  if (users > 0) {
    for (let i = 1; i <= chunks(users, ROWS_PER_FILE); i++) {
      entries.push({ loc: `${SITE}/sitemaps/users-${i}.xml` });
    }
  }

  return renderIndex(entries);
}


/** Builds one child sitemap: type + 1-based page number */
export async function buildChild(type: string, page: number): Promise<string | null> {
  const urls: Url[] = [];

  if (type === 'pages') {
    return renderUrlset(STATIC_PAGES);
  }

  if (type === 'latest') {
    const rows = await fetchRows(
      `book_submissions?select=id,slug,reviewed_at,created_at&status=eq.approved&order=created_at.desc&limit=${LATEST_LIMIT}`
    );
    for (const book of rows) {
      const slug = encodePathSegment(book.slug || book.id);
      const lastmod = iso(book.reviewed_at || book.created_at);
      urls.push({ url: `${SITE}/book/${slug}`, lastmod, changefreq: 'daily', priority: 0.9 });

    }
    return renderUrlset(urls);
  }



  if (type === 'books') {
    const offset = (page - 1) * BOOKS_PER_FILE;
    const rows = await fetchPaged(
      `book_submissions?select=id,slug,reviewed_at,created_at&status=eq.approved&order=created_at.desc`,
      offset,
      BOOKS_PER_FILE
    );
    for (const book of rows) {
      const slug = encodePathSegment(book.slug || book.id);
      const lastmod = iso(book.reviewed_at || book.created_at);
      // Only the canonical book page is submitted. /tahmil, /qiraa and /molakhas
      // are near-duplicate landings — keeping them out of the sitemap focuses
      // Google's crawl budget on the pages we actually want indexed.
      urls.push({ url: `${SITE}/book/${slug}`, lastmod, changefreq: 'monthly', priority: 0.8 });
    }

    return renderUrlset(urls);
  }

  const offset = (page - 1) * ROWS_PER_FILE;

  if (type === 'authors') {
    const rows = await fetchPaged(
      `authors?select=id,slug,name,created_at&order=created_at.desc`,
      offset,
      ROWS_PER_FILE
    );
    for (const a of rows) {
      const p = a.slug && a.slug.trim() !== '' ? a.slug : a.name;
      if (!p) continue;
      urls.push({
        url: `${SITE}/author/${encodePathSegment(p)}`,
        lastmod: iso(a.created_at),
        changefreq: 'weekly',
        priority: 0.7,
      });
    }
    return renderUrlset(urls);
  }

  if (type === 'categories') {
    const rows = await fetchPaged(
      `categories?select=name,created_at&order=created_at.desc`,
      offset,
      ROWS_PER_FILE
    );
    for (const c of rows) {
      if (!c.name) continue;
      urls.push({
        url: `${SITE}/category/${encodePathSegment(c.name)}`,
        lastmod: iso(c.created_at),
        changefreq: 'weekly',
        priority: 0.7,
      });
    }
    return renderUrlset(urls);
  }

  // Public member profiles. Profiles that own books redirect to /author/... ,
  // so they are excluded here to avoid redirect duplicates in the sitemap.
  if (type === 'users') {
    const rows = await fetchPaged(
      `profiles?select=id,username,last_seen,created_at&username=not.is.null&author_slug=is.null&order=created_at.desc`,
      offset,
      ROWS_PER_FILE
    );
    for (const u of rows) {
      if (!u.username) continue;
      urls.push({
        url: `${SITE}/user/${encodePathSegment(u.username)}`,
        lastmod: iso(u.last_seen || u.created_at),
        changefreq: 'weekly',
        priority: 0.5,
      });
    }
    return renderUrlset(urls);
  }

  if (type === 'clubs') {
    const rows = await fetchPaged(
      `reading_clubs?select=id,updated_at,created_at&is_public=eq.true&order=created_at.desc`,
      offset,
      ROWS_PER_FILE
    );
    for (const c of rows) {
      urls.push({
        url: `${SITE}/reading-clubs/${c.id}`,
        lastmod: iso(c.updated_at || c.created_at),
        changefreq: 'weekly',
        priority: 0.5,
      });
    }
    return renderUrlset(urls);
  }



  return null;
}
