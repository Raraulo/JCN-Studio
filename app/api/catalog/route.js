import { deezerArtist, deezerTrack, findDeezerArtists } from '../../deezer';

export async function GET(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim().slice(0, 150);
  const artistQuery = url.searchParams.get('artist')?.trim().slice(0, 150);
  const deezer = url.searchParams.get('source') === 'deezer';
  const trackId = url.searchParams.get('id');
  if (trackId !== null && !/^\d{1,16}$/.test(trackId)) {
    return Response.json({ error: 'Identificador de canción inválido.' }, { status: 400 });
  }
  if (artistQuery) {
    try {
      return Response.json((await findDeezerArtists(artistQuery, { preferExact: true })).slice(0, 1));
    } catch {
      return Response.json([]);
    }
  }
  if (!query && !trackId) return Response.json([]);
  const endpoint = deezer
    ? new URL(trackId ? 'https://api.deezer.com/track/' + trackId : 'https://api.deezer.com/search')
    : new URL(trackId ? 'https://itunes.apple.com/lookup' : 'https://itunes.apple.com/search');
  const params = deezer
    ? { q: query, limit: '20' }
    : trackId ? { id: trackId, country: 'US' } : { term: query, media: 'music', entity: 'song', country: 'US', limit: '20' };
  if (!trackId || !deezer) endpoint.search = new URLSearchParams(params);
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
      ? await Promise.all(deezerTracks.filter(track => track.id && track.title && track.preview).map(async track => {
          const contributorIds = (track.contributors || [])
            .filter(artist => artist?.id && artist?.name)
            .slice(0, 8);
          const artists = await Promise.all(contributorIds.map(async artist => {
            try {
              const response = await fetch('https://api.deezer.com/artist/' + artist.id, {
                signal: AbortSignal.timeout(2500),
                cache: 'no-store',
              });
              if (!response.ok) return deezerArtist(artist);
              const profile = await response.json();
              return deezerArtist(profile.id ? profile : artist);
            } catch {
              return deezerArtist(artist);
            }
          }));
          return deezerTrack(track, track.album, artists);
        }))
      : data.results.filter(track => track.trackId && track.trackName && (!trackId || String(track.trackId) === trackId)).map(track => ({
          id: 'apple-' + track.trackId, title: track.trackName, artist: track.artistName,
          album: track.collectionName, art: track.artworkUrl100?.replace('100x100', '600x600'),
          preview: track.previewUrl, link: track.trackViewUrl, duration: track.trackTimeMillis / 1000,
        }));
    return Response.json(results);
  } catch {
    return Response.json({ error: 'El catálogo está temporalmente ocupado. Intenta de nuevo.' }, { status: 502 });
  }
}
