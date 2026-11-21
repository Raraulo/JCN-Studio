import { findLyrics } from '../../lyrics-service';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const title = params.get('title')?.slice(0, 150);
  const artist = params.get('artist')?.slice(0, 150);
  if (!title || !artist) return Response.json({});

  try {
    return Response.json(await findLyrics(title, artist));
  } catch {
    return Response.json({ error: 'El servicio de letras no respondió.' }, { status: 502 });
  }
}
