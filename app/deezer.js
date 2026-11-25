import { normalizeSearch } from './search-matches';

export async function deezerJson(path, params) {
  const url = new URL(path, 'https://api.deezer.com');
  if (params) url.search = new URLSearchParams(params);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5500),
    next: { revalidate: 1800 },
  });
  if (!response.ok) throw new Error('Deezer unavailable');
  const data = await response.json();
  if (data.error) throw new Error('Deezer item unavailable');
  return data;
}

export function deezerArtist(artist) {
  return { id: String(artist.id), name: artist.name, picture: artist.picture_big || artist.picture_medium || artist.picture || '' };
}

export function deezerTrack(track, album = track.album, artists = []) {
  return {
    id: 'deezer-' + track.id, title: track.title, artist: track.artist?.name || 'Desconocido',
    album: album?.title, art: album?.cover_big || album?.cover_medium,
    preview: track.preview || null, link: track.link || 'https://www.deezer.com/track/' + track.id,
    duration: track.duration || 0, previewFormat: 'mp3', artists,
  };
}

export async function findDeezerArtists(query, { preferExact = false } = {}) {
  const { data = [] } = await deezerJson('/search/artist', { q: query, limit: '16' });
  const name = normalizeSearch(query);
  if (!name) return [];
  const matches = data.filter(artist => artist.id && artist.name && normalizeSearch(artist.name).includes(name));
  const score = artist => {
    const match = normalizeSearch(artist.name);
    return (match.startsWith(name) ? 12 : 0) + (match === name ? (preferExact ? 100 : 6) : 0) + Math.log10(1 + (artist.nb_fan || 0)) * 4;
  };
  matches.sort((a, b) => score(b) - score(a));
  const unique = new Map();
  for (const artist of matches) {
    const key = normalizeSearch(artist.name);
    if (!unique.has(key)) unique.set(key, deezerArtist(artist));
    if (unique.size === 2) break;
  }
  return [...unique.values()];
}
