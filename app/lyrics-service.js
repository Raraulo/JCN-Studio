export async function findLyrics(title, artist) {
  const endpoint = new URL('https://lrclib.net/api/get');
  endpoint.search = new URLSearchParams({ track_name: title, artist_name: artist });
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'JCN Studio/1.0 (personal music library)' },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 3600 },
  });
  if (response.status === 404) return {};
  if (!response.ok) throw new Error('Lyrics unavailable');
  const data = await response.json();
  return { plain: data.plainLyrics, synced: data.syncedLyrics, instrumental: data.instrumental };
}
