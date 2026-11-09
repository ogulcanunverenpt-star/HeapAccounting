const ogCache = new Map();

export async function fetchOpenGraph(url) {
  if (!url) return null;
  if (ogCache.has(url)) return ogCache.get(url);

  try {
    const api = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
    const res = await fetch(api);
    const json = await res.json();
    if (json && json.status === 'success' && json.data) {
      const ogData = {
        title: json.data.title || url,
        description: json.data.description || '',
        image: json.data.image?.url || json.data.logo?.url || null,
        url: url,
        publisher: json.data.publisher || new URL(url).hostname
      };
      ogCache.set(url, ogData);
      return ogData;
    }
  } catch (err) {
    console.warn('OpenGraph fetch error:', err);
  }
  return null;
}

export function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<">]+/i);
  return match ? match[0] : null;
}
