// Cloudflare Pages Function — Category page meta injection
// Route: /category/*  (adds a unique title/description/canonical for crawlers)

const SITE = 'https://kotobi.xyz';
const SUPABASE_URL = 'https://kydmyxsgyxeubhmqzrgo.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function encodePathSegment(value: string) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

async function fetchCategory(slug: string) {
  const tries = [`slug=eq.${encodeURIComponent(slug)}`, `name=eq.${encodeURIComponent(slug)}`];
  for (const filter of tries) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/categories?select=*&${filter}&limit=1`,
        { headers, signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) continue;
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch (_) {}
  }
  return null;
}

async function countBooks(categoryName: string) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/book_submissions?select=id&status=eq.approved&category=eq.${encodeURIComponent(categoryName)}&limit=1`,
      {
        method: 'HEAD',
        headers: { ...headers, Prefer: 'count=exact' },
        signal: AbortSignal.timeout(6000),
      }
    );
    const total = parseInt((res.headers.get('content-range') || '').split('/')[1] || '0', 10);
    return isNaN(total) ? 0 : total;
  } catch (_) {
    return 0;
  }
}

export const onRequest = async (context: any) => {
  const { request, next } = context;
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';

  const isCrawler =
    /googlebot|google-inspectiontool|bingbot|yandexbot|duckduckbot|baiduspider|applebot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discord|slack|petalbot|semrushbot|ahrefsbot/i.test(
      ua
    );
  if (!isCrawler && !url.searchParams.has('_prerender')) return next();

  try {
    const parts = url.pathname.split('/').filter(Boolean);
    let slug = parts[parts.length - 1] || '';
    try {
      slug = decodeURIComponent(slug);
    } catch (_) {}
    if (!slug || slug === 'category') return next();

    const category = await fetchCategory(slug);
    if (!category) return next();

    const name = category.name || slug;
    const count = await countBooks(name);
    const canonical = `${SITE}/category/${encodePathSegment(category.slug || slug)}`;
    const countText = count > 0 ? `${count} كتاب` : 'كتب';
    const title = `${name} — ${countText} للتحميل والقراءة PDF | منصة كتبي`;
    const description = (
      category.description?.trim()
        ? `${String(category.description).replace(/\s+/g, ' ')} — ${countText} في قسم ${name} على منصة كتبي، قراءة وتحميل مجاناً.`
        : `تصفّح قسم ${name} في منصة كتبي: ${countText} عربية للقراءة أونلاين والتحميل بصيغة PDF مجاناً.`
    ).slice(0, 300);

    const response = await next();
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return response;

    let html = await response.text();
    const upsert = (attr: 'name' | 'property', key: string, value: string) => {
      const re = new RegExp(`<meta[^>]*\\s${attr}=["']${key}["'][^>]*>`, 'i');
      const tag = `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
      html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', `${tag}\n</head>`);
    };

    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    upsert('name', 'description', description);
    upsert('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large');
    upsert('property', 'og:title', title);
    upsert('property', 'og:description', description);
    upsert('property', 'og:url', canonical);
    upsert('property', 'og:type', 'website');
    upsert('name', 'twitter:title', title);
    upsert('name', 'twitter:description', description);

    const canonicalRe = /<link[^>]*\srel=["']canonical["'][^>]*>/i;
    const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonical)}">`;
    html = canonicalRe.test(html)
      ? html.replace(canonicalRe, canonicalTag)
      : html.replace('</head>', `${canonicalTag}\n</head>`);

    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'منصة كتبي', url: SITE },
    });
    html = html.replace('</head>', `<script type="application/ld+json">${schema}</script>\n</head>`);

    const outHeaders = new Headers(response.headers);
    outHeaders.delete('content-length');
    outHeaders.set('Cache-Control', 'public, max-age=300');
    return new Response(html, { status: response.status, headers: outHeaders });
  } catch (error) {
    console.error('category meta injection failed', error);
    return next();
  }
};
