export async function GET(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim().slice(0, 150);
  const deezer = url.searchParams.get('source') === 'deezer';
  const trackId = deezer ? url.searchParams.get('id') : null;
  if (trackId !== null && !/^\d{1,16}$/.test(trackId)) {
    return Response.json({ error: 'Identificador de canción inválido.' }, { status: 400 });
  }
  if (!query && !trackId) return Response.json([]);
  const endpoint = deezer
    ? new URL(trackId ? 'https://api.deezer.com/track/' + trackId : 'https://api.deezer.com/search')
    : new URL('https://itunes.apple.com/search');
  const params = deezer
    ? { q: query, limit: '20' }
    : { term: query, media: 'music', entity: 'song', country: 'US', limit: '20' };
  if (!trackId) endpoint.search = new URLSearchParams(params);
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(trackId ? 4000 : 9000),
      ...(trackId ? { cache: 'no-store' } : { next: { revalidate: 3600 } }),
    });
    if (!response.ok) throw new Error('Catalog unavailable');
    const data = await response.json();
    const deezerTracks = trackId ? [data] : data.data;
    if (deezer && (data.error || !Array.isArray(deezerTracks))) throw new Error('Deezer unavailable');
    const results = deezer
      ? deezerTracks.filter(track => track.id && track.title && track.preview).map(track => ({
          id: 'deezer-' + track.id, title: track.title, artist: track.artist?.name || 'Desconocido',
          album: track.album?.title, art: track.album?.cover_big || track.album?.cover_medium,
          preview: track.preview, link: track.link, duration: track.duration || 30,
          previewFormat: 'mp3',
        }))
      : data.results.filter(track => track.trackId && track.trackName).map(track => ({
          id: 'apple-' + track.trackId, title: track.trackName, artist: track.artistName,
          album: track.collectionName, art: track.artworkUrl100?.replace('100x100', '600x600'),
          preview: track.previewUrl, link: track.trackViewUrl, duration: track.trackTimeMillis / 1000,
        }));
    return Response.json(results);
  } catch {
    return Response.json({ error: 'El catálogo está temporalmente ocupado. Intenta de nuevo.' }, { status: 502 });
  }
}
