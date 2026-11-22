export const songParam = 'cancion';
const catalogId = /^(deezer|apple)-(\d{1,16})$/;

export function catalogTrackId(value) {
  const match = catalogId.exec(value || '');
  return match ? { source: match[1], id: match[2] } : null;
}

export function shareableTrackId(track) {
  if (!track || track.local) return null;
  if (catalogTrackId(track.id)) return track.id;
  if (!track.link) return null;
  try {
    const url = new URL(track.link);
    if (url.protocol !== 'https:' || !['music.apple.com', 'itunes.apple.com'].includes(url.hostname)) return null;
    const id = url.searchParams.get('i') || (/\/song\//.test(url.pathname) && url.pathname.split('/').at(-1));
    return /^\d{1,16}$/.test(id || '') ? 'apple-' + id : null;
  } catch {
    return null;
  }
}
