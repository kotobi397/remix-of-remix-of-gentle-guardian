// Cloudflare Pages Function — IndexNow ping
// Route: /api/indexnow

const INDEXNOW_KEY = '3d863015f0376ebda16b767a3c4c01aa';
const SITE_HOST = 'kotobi.xyz';

interface Body {
  urls?: string[];
  url?: string;
}

export const onRequest = async (context: any) => {
  const { request } = context;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const urls =
    body.urls && body.urls.length > 0
      ? body.urls
      : body.url
        ? [body.url]
        : [`https://${SITE_HOST}/`, `https://${SITE_HOST}/sitemap.xml`];

  const validUrls = urls.filter((u) => {
    try {
      return new URL(u).hostname === SITE_HOST;
    } catch {
      return false;
    }
  });

  if (validUrls.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid URLs' }), { status: 400 });
  }

  const results: Record<string, any> = {};

  try {
    const indexNowRes = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`,
        urlList: validUrls,
      }),
    });
    results.indexnow = { status: indexNowRes.status, ok: indexNowRes.ok };
  } catch (e: any) {
    results.indexnow = { error: e?.message };
  }

  try {
    const bingRes = await fetch(
      `https://www.bing.com/indexnow?url=${encodeURIComponent(validUrls[0])}&key=${INDEXNOW_KEY}`
    );
    results.bing = { status: bingRes.status };
  } catch (e: any) {
    results.bing = { error: e?.message };
  }

  // Google's sitemap ping endpoint was retired in 2023 and now returns 404.
  // Google discovers new URLs via robots.txt -> /sitemap.xml (lastmod) instead.
  try {
    const yandexRes = await fetch('https://yandex.com/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`,
        urlList: validUrls,
      }),
    });
    results.yandex = { status: yandexRes.status };
  } catch (e: any) {
    results.yandex = { error: e?.message };
  }


  return new Response(JSON.stringify({ submitted: validUrls.length, results }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
