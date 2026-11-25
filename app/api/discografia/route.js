import { deezerArtist, deezerJson, deezerTrack, findDeezerArtists } from '../../deezer';

const numericId = /^\d{1,16}$/;
const mapAlbum = album => ({
  id: String(album.id), title: album.title, art: album.cover_big || album.cover_medium,
  released: album.release_date || '', type: album.record_type,
});

async function albumTracks(album) {
  const tracks = [];
  for (let index = 0; index < album.nb_tracks; index += 100) {
    const page = await deezerJson('/album/' + album.id + '/tracks', { limit: '100', index: String(index) });
    tracks.push(...page.data.filter(track => track.id && track.title).map(track => deezerTrack(track, album)));
    if (!page.next) break;
  }
  return tracks;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const query = params.get('q')?.trim().slice(0, 150);
  const artist = params.get('artist')?.trim().slice(0, 150);
  const album = params.get('album');
  if (album !== null && !numericId.test(album)) {
    return Response.json({ error: 'El álbum no es válido.' }, { status: 400 });
  }
  try {
    if (query) return Response.json(await findDeezerArtists(query));
    if (album) {
      const record = await deezerJson('/album/' + album);
      return Response.json({
        album: mapAlbum(record), artist: deezerArtist(record.artist),
        tracks: await albumTracks(record),
      });
    }
    if (artist) {
      const id = numericId.test(artist) ? artist : (await findDeezerArtists(artist, { preferExact: true }))[0]?.id;
      if (!id) return Response.json({ error: 'No encontré el perfil de este artista.' }, { status: 404 });
      const [profile, top, discography] = await Promise.all([
        deezerJson('/artist/' + id),
        deezerJson('/artist/' + id + '/top', { limit: '20' }),
        deezerJson('/artist/' + id + '/albums', { limit: '100' }),
      ]);
      const releases = discography.data.filter(item => item.id && item.title);
      const albums = releases.filter(item => item.record_type !== 'single');
      return Response.json({
        artist: deezerArtist(profile),
        tracks: top.data.filter(track => track.id && track.title && track.preview).slice(0, 5).map(track => deezerTrack(track)),
        albums: (albums.length ? albums : releases).map(mapAlbum),
      });
    }
    return Response.json({ error: 'Indica un artista o álbum.' }, { status: 400 });
  } catch {
    return Response.json({ error: 'No se pudo cargar la discografía. Intenta de nuevo.' }, { status: 502 });
  }
}
