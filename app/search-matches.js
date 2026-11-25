export function normalizeSearch(value) {
  return (value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function sortSongMatches(tracks, query) {
  const input = normalizeSearch(query);
  if (!input) return tracks;
  const words = input.split(' ');
  function score(track) {
    const title = normalizeSearch(track.title);
    const artist = normalizeSearch(track.artist);
    if (title === input || artist === input) return 4;
    if (title.startsWith(input) || artist.startsWith(input)) return 3;
    if (words.every(word => title.includes(word) || artist.includes(word))) return 2;
    return 0;
  }
  return tracks.map((track, index) => ({ track, score: score(track) * 2 + 10 / (1 + index / 3) }))
    .sort((a, b) => b.score - a.score).map(entry => entry.track);
}
