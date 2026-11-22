import { chartSource } from '../../chart-source';

const refreshSeconds = 1800;

async function lookupSongs(ids) {
  const url = new URL('https://itunes.apple.com/lookup');
  url.search = new URLSearchParams({ id: ids.join(','), country: 'US' });
  const response = await fetch(url, {
    signal: AbortSignal.timeout(4500),
    next: { revalidate: refreshSeconds },
  });
  if (!response.ok) return new Map();
  const payload = await response.json();
  return new Map((payload.results || []).map(song => [String(song.trackId), song]));
}

export async function GET() {
  try {
    const response = await fetch(chartSource, {
      signal: AbortSignal.timeout(6500),
      next: { revalidate: refreshSeconds },
    });
    if (!response.ok) throw new Error('Playlist unavailable');
    const html = await response.text();
    const schema = html.match(/<script\b[^>]*\bid=["']?schema:music-playlist["']?(?=\s|>)[^>]*>([\s\S]*?)<\/script>/i);
    const playlist = JSON.parse(schema?.[1] || '{}');
    const recordings = playlist.track?.slice(0, 20);
    if (recordings?.length !== 20) throw new Error('Incomplete chart');
    const ids = recordings.map(entry => /^https:\/\/music\.apple\.com\/[^/]+\/song\/(?:[^/]+\/)?(\d+)(?:\?.*)?$/.exec(entry.url)?.[1]);
    if (ids.some(id => !id) || new Set(ids).size !== 20) throw new Error('Invalid chart entries');

    const songs = await lookupSongs(ids).catch(() => new Map());
    const tracks = recordings.map((entry, index) => {
      const id = ids[index];
      const song = songs.get(id);
      const duration = /^PT(?:(\d+)M)?(?:(\d+)S)?$/.exec(entry.duration);
      return {
        id: 'apple-' + id,
        title: song?.trackName || entry.name,
        artist: song?.artistName || '',
        album: song?.collectionName || '',
        art: song?.artworkUrl100?.replace('100x100', '600x600') || entry.audio?.thumbnailUrl,
        preview: song?.previewUrl,
        link: song?.trackViewUrl || entry.url,
        duration: song?.trackTimeMillis ? song.trackTimeMillis / 1000 : Number(duration?.[1] || 0) * 60 + Number(duration?.[2] || 0),
      };
    });
    return Response.json({ tracks, publishedAt: playlist.datePublished || null });
  } catch {
    return Response.json({ error: 'El Top Mundial no está disponible en este momento.' }, { status: 502 });
  }
}
