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

const normalizeName = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export async function findDeezerArtists(query) {
  const { data = [] } = await deezerJson('/search/artist', { q: query, limit: '16' });
  const name = normalizeName(query);
  const matches = data.filter(artist => artist.id && artist.name && normalizeName(artist.name).includes(name));
  matches.sort((a, b) => Number(normalizeName(b.name) === name) - Number(normalizeName(a.name) === name));
  const unique = new Map();
  for (const artist of matches) {
    const key = normalizeName(artist.name);
    if (!unique.has(key)) unique.set(key, deezerArtist(artist));
    if (unique.size === 2) break;
  }
  return [...unique.values()];
}
