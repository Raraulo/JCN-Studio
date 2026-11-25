'use client';

import '@fontsource-variable/dm-sans';
import { useEffect, useRef, useState } from 'react';
import { AudioLines, Clock3, Compass, Heart, House, ListMusic, Maximize2, Mic2, Music2, Pause, Play, Plus, RefreshCw, Repeat, Search, Shuffle, SkipBack, SkipForward, Sparkles, Volume2, VolumeX, X, ExternalLink } from 'lucide-react';
import { Howl } from 'howler';
import { localFiles } from './storage';
import fixedTracks from './mis-fijas.json';
import genres from './genres.json';
import genreDefaults from './canciones-por-genero.json';
import { chartSource } from './chart-source';
import { catalogTrackId, shareableTrackId, songParam } from './track-link';
import { normalizeSearch, sortSongMatches } from './search-matches';

const genresView = 'Explorar géneros';
const recentArtistsKey = 'jcn-recent-artists-v1';
const recentArtistsLimit = 10;
const nav = [[House, 'Inicio'], [Compass, genresView], [Heart, 'Favoritos'], [ListMusic, 'Guardados']];
const colors = ['#613339','#384a45','#49405e','#74494f','#665466','#39485e'];
const formatTime = seconds => seconds > 0 ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00';
const sameTrack = (left, right) => left && right &&
  (left.id === right.id || [left.title, left.artist].join('|').toLowerCase() === [right.title, right.artist].join('|').toLowerCase());
const fromRemovedCatalog = track => track?.id?.startsWith('jamendo-');
const isDeezerTrack = track => track?.id?.startsWith('deezer-');
const isPreviewTrack = track => !track?.local && Boolean(track?.preview || (track?.preview !== null && isDeezerTrack(track)));
const canPlayTrack = track => track.local || isPreviewTrack(track);

function replaceSongInAddress(id) {
  const url = new URL(window.location.href);
  if (url.searchParams.get(songParam) === id) return;
  if (id) url.searchParams.set(songParam, id);
  else url.searchParams.delete(songParam);
  window.history.replaceState(window.history.state, '', url);
}

function Cover({ track, index = 0, className = '' }) {
  const [localArt, setLocalArt] = useState('');
  useEffect(() => {
    if (!track?.local) return;
    let active = true;
    let url;
    localFiles(track.id).then(files => {
      if (active && files?.cover) {
        url = URL.createObjectURL(files.cover);
        setLocalArt(url);
      }
    }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [track?.id, track?.local]);
  return <span className={'cover ' + className} style={{ '--cover': colors[index % colors.length] }}>
    <Music2 aria-hidden="true" />
    {(track?.art || (track?.local && localArt)) && <img key={track.id} src={track.art || localArt} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />}
  </span>;
}

function ArtistAvatar({ artist }) {
  const initials = artist.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className="artist-avatar" aria-hidden="true">
    <span>{initials || '♪'}</span>
    {artist.picture && <img src={artist.picture} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}

function Catalog({ onChoose, favorite, onPlay, playingId, genre, onClose, onArtist, onRememberArtist, searchMemory }) {
  const scope = genre || '';
  const previous = searchMemory.get(scope);
  const [query, setQuery] = useState(previous?.query || '');
  const [source, setSource] = useState(previous?.source || 'deezer');
  const [results, setResults] = useState(previous?.results || []);
  const [artists, setArtists] = useState(previous?.artists || []);
  const [status, setStatus] = useState('');
  const searchRequest = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => () => {
    clearTimeout(searchTimer.current);
    searchRequest.current?.abort();
  }, []);

  function queueSearch(text, provider) {
    clearTimeout(searchTimer.current);
    searchRequest.current?.abort();
    const term = text.trim();
    if (normalizeSearch(term).length < 2) {
      setResults([]);
      setArtists([]);
      setStatus('');
      searchMemory.delete(scope);
      return;
    }
    searchTimer.current = setTimeout(() => search(term, provider), 240);
  }

  async function search(text, provider, submitted = false) {
    clearTimeout(searchTimer.current);
    const term = text.trim();
    const normalized = normalizeSearch(term);
    if (normalized.length < 2) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setStatus('Buscando música…');
    async function find(path, params) {
      const response = await fetch(path + '?' + new URLSearchParams(params), { signal: controller.signal });
      if (!response.ok) throw new Error('Search unavailable');
      return response.json();
    }
    const [songs, profiles] = await Promise.allSettled([
      find('/api/catalog', { q: term, source: provider }).then(tracks => {
        const matches = sortSongMatches(tracks.filter(track => track.preview), term);
        if (!controller.signal.aborted) setResults(matches);
        return matches;
      }),
      find('/api/discografia', { q: term }).then(people => {
        if (!controller.signal.aborted) setArtists(people);
        return people;
      }),
    ]);
    if (controller.signal.aborted) return;
    const matches = songs.status === 'fulfilled' ? songs.value : [];
    const people = profiles.status === 'fulfilled' ? profiles.value : [];
    setResults(matches);
    setArtists(people);
    const knownArtist = people.find(artist => normalizeSearch(artist.name) === normalized);
    if (knownArtist || (submitted && people[0])) onRememberArtist(knownArtist || people[0]);
    searchMemory.set(scope, { query: term, source: provider, results: matches, artists: people });
    setStatus(matches.length || people.length ? '' : songs.status === 'rejected'
      ? 'La búsqueda falló. Intenta de nuevo.' : 'No encontré resultados para esa búsqueda.');
  }

  return <>
    <form className="search-form" onSubmit={event => { event.preventDefault(); search(query, source, true); }}>
      <div className="input-shell">
        <Search size={17} aria-hidden="true" />
        <input aria-label="Canción o artista" placeholder={genre ? 'Buscar para ' + genre : 'Canción o artista'} value={query} minLength={2} maxLength={150} onChange={event => {
          setQuery(event.target.value);
          if (!event.nativeEvent.isComposing) queueSearch(event.target.value, source);
        }} onCompositionEnd={event => queueSearch(event.currentTarget.value, source)} required autoFocus />
        <button type="button" className="icon search-close" aria-label="Cerrar buscador" title="Cerrar buscador" onClick={() => { searchMemory.delete(scope); onClose(); }}><X size={18} aria-hidden="true" /></button>
      </div>
      <select aria-label="Catálogo" value={source} onChange={event => { setSource(event.target.value); queueSearch(query, event.target.value); }}><option value="deezer">Deezer</option><option value="apple">iTunes</option></select>
      <button className="primary">Buscar</button>
    </form>
    {status && <p className="subtle" role="status">{status}</p>}
    {artists.length > 0 && <section className="artist-results" aria-label="Artistas">
      {artists.map(artist => <button key={artist.id} className="artist-result" onClick={() => { onRememberArtist(artist); onArtist(artist); }}>
        <ArtistAvatar artist={artist} />
        <span className="track-copy"><strong>{artist.name}</strong><small>Artista</small></span>
      </button>)}
    </section>}
    {results.map((track, index) => {
      const saved = favorite(track);
      const isPlaying = playingId === track.id;
      return <div className="result" key={track.id}>
        <button className={'result-play' + (isPlaying ? ' row-playing' : '')} type="button"
          aria-label={(isPlaying ? 'Pausar ' : 'Reproducir ') + track.title + ' de ' + track.artist}
          onClick={() => onPlay(track, results)}>
          <Cover track={track} index={index} />
          <span className="track-copy"><strong>{track.title}</strong><small>{track.artist}</small></span>
          <span className="result-play-icon" aria-hidden="true">{isPlaying ? <Pause size={17} /> : <Play size={17} />}</span>
        </button>
        <button className={'icon result-heart' + (saved ? ' accent' : '')} type="button"
          aria-pressed={saved} aria-label={(genre || 'Favoritos') + ': ' + track.title} title={(saved ? 'Quitar de ' : 'Guardar en ') + (genre || 'Favoritos')}
          onClick={() => onChoose(track)}><Heart size={19} fill={saved ? 'currentColor' : 'none'} /></button>
      </div>;
    })}
  </>;
}

function Lyrics({ track, time, synchronized, onClose, expanded = false }) {
  const [lyrics, setLyrics] = useState(null);
  const activeLine = useRef(null);
  const scrollArea = useRef(null);
  useEffect(() => {
    if (track.lyrics) { setLyrics({ plain: track.lyrics, synced: track.lyrics }); return; }
    const controller = new AbortController();
    fetch('/api/lyrics?' + new URLSearchParams({ title: track.title, artist: track.artist }), { signal: controller.signal })
      .then(response => response.json())
      .then(setLyrics)
      .catch(() => {
        if (!controller.signal.aborted) setLyrics({ error: 'No se pudo buscar la letra.' });
      });
    return () => controller.abort();
  }, [track]);

  const lines = lyrics?.synced?.split('\n').flatMap(line => {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    return match ? [{ time: Number(match[1]) * 60 + Number(match[2]), text: match[3] }] : [];
  }).sort((a, b) => a.time - b.time) || [];
  const current = synchronized ? lines.findLastIndex(line => line.time <= time) : -1;
  useEffect(() => {
    const area = scrollArea.current;
    const line = activeLine.current;
    if (!area) return;
    const top = line
      ? area.scrollTop + line.getBoundingClientRect().top - area.getBoundingClientRect().top - (area.clientHeight - line.offsetHeight) / 2
      : 0;
    const start = area.scrollTop;
    const end = Math.max(0, Math.min(top, area.scrollHeight - area.clientHeight));
    if (Math.abs(end - start) < 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(end - start) > area.clientHeight) {
      area.scrollTop = end;
      return;
    }
    const startedAt = performance.now();
    let frame;
    function follow(now) {
      const progress = Math.min((now - startedAt) / 145, 1);
      area.scrollTop = start + (end - start) * (1 - (1 - progress) ** 3);
      if (progress < 1) frame = requestAnimationFrame(follow);
    }
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [current]);

  return <aside className={expanded ? 'artwork-lyrics' : 'lyrics'} aria-label="Letra de la canción">
    {!expanded && <>
      <div className="dialog-head"><h2>Letra</h2><button className="icon" onClick={onClose} aria-label="Cerrar letra"><X /></button></div>
      <p className="subtle">{track.title} · {track.artist}</p>
    </>}
    <div className="lyrics-scroll" ref={scrollArea} tabIndex={expanded ? 0 : undefined} aria-label="Texto de la letra">{lines.length ? lines.map((line, index) => <p key={index} ref={index === current ? activeLine : null} className={index === current ? 'lyric-active' : ''} aria-current={index === current ? 'true' : undefined}>{line.text || '♪'}</p>) :
      <p className="plain-lyrics">{lyrics ? lyrics.plain || lyrics.error || (lyrics.instrumental ? 'Esta canción es instrumental.' : 'No encontré la letra de esta canción.') : 'Buscando letra…'}</p>}</div>
  </aside>;
}

function SongAnalysis({ track, cache, onClose, expanded = false }) {
  const cacheKey = 'story:' + track.id;
  const [result, setResult] = useState(() => cache.get(cacheKey));
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const cached = cache.get(cacheKey);
    if (cached) { setResult(cached); return; }
    const controller = new AbortController();
    const { id, title, artist, album, link } = track;
    fetch('/api/significado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ id, title, artist, album, link }),
    }).then(async response => {
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (response.ok) cache.set(cacheKey, data);
      setResult(data);
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ error: 'No se pudo consultar Vibra.' });
    });
    return () => controller.abort();
  }, [track, cache, cacheKey, retry]);

  return <aside className={expanded ? 'artwork-analysis' : 'lyrics analysis-panel'} aria-label="Significado de la canción">
    <div className="dialog-head">
      <h2>De qué va la canción</h2>
      <button className="icon" onClick={onClose} aria-label="Cerrar análisis"><X size={19} /></button>
    </div>
    <div className="analysis-scroll" tabIndex={0}>
      {!result ? <p role="status">Vibra está interpretando la canción…</p> : result.error ?
        <><p role="status">{result.error}</p><button className="secondary" onClick={() => { setResult(undefined); setRetry(retry + 1); }}>Reintentar</button></> :
        <>
          <p className="analysis-lead">{result.resumen}</p>
          <h3>Lo que se siente</h3><p>{result.significado}</p>
          {result.curiosidad && <><h3>¿Sabías que…?</h3><p>{result.curiosidad}</p></>}
          <h3>Cuándo pega más</h3><p>{result.momento}</p>
        </>}
    </div>
  </aside>;
}

function PlaybackProgress({ time, duration, onSeek }) {
  return <div className="progress">
    <span>{formatTime(time)}</span>
    <input type="range" min="0" max={duration || 1} step="0.1" aria-label="Posición de reproducción"
      aria-valuetext={formatTime(time) + ' de ' + formatTime(duration)}
      disabled={!duration} value={Math.min(time, duration)}
      style={{ '--fill': (duration ? time / duration * 100 : 0) + '%' }}
      onChange={event => onSeek(Number(event.target.value))} />
    <span>{formatTime(duration)}</span>
  </div>;
}

function ArtistCredits({ track, onArtist }) {
  const [resolved, setResolved] = useState([]);
  const [offset, setOffset] = useState(0);
  const baseNames = track?.artists?.length
    ? track.artists
    : String(track?.artist || '')
      .split(/\s*(?:,|&|\bfeat\.?|\bx\b|\by\b)\s*/i)
      .map(name => name.trim())
      .filter(Boolean)
      .map(name => ({ name }));

  useEffect(() => {
    setOffset(0);
    let active = true;
    const controller = new AbortController();
    Promise.all(baseNames.map(async artist => {
      if (artist.id && artist.picture) return artist;
      try {
        const response = await fetch('/api/catalog?' + new URLSearchParams({ artist: artist.name }), { signal: controller.signal });
        if (!response.ok) return artist;
        const [match] = await response.json();
        return match ? { ...artist, id: match.id, picture: match.picture || artist.picture } : artist;
      } catch {
        return artist;
      }
    })).then(names => { if (active) setResolved(names); });
    return () => { active = false; controller.abort(); };
  }, [track?.id, track?.artist]);

  const names = resolved.length === baseNames.length ? resolved : baseNames;
  if (!names.length) return null;
  const visibleNames = names.slice(offset, offset + 3);
  const hasPrevious = offset > 0;
  const hasNext = offset + 3 < names.length;
  return <aside className="artwork-credits" aria-label="Intérpretes">
    <h3>Intérpretes</h3>
    <div className="artist-list">
      {visibleNames.map((artist, index) =>
        <button type="button" className="artist-item" key={artist.name + index} title={'Ver artista: ' + artist.name} onClick={() => onArtist(artist)}>
          <ArtistAvatar artist={artist} />
          <span className="artist-name">{artist.name}</span>
        </button>)}
    </div>
    {names.length > 3 && <div className="artist-credits-nav" aria-label="Cambiar intérpretes">
      <button type="button" aria-label="Intérpretes anteriores" disabled={!hasPrevious} onClick={() => setOffset(offset - 3)}>&lt;</button>
      <span>{Math.floor(offset / 3) + 1}/{Math.ceil(names.length / 3)}</span>
      <button type="button" aria-label="Más intérpretes" disabled={!hasNext} onClick={() => setOffset(offset + 3)}>&gt;</button>
    </div>}
  </aside>;
}

function PlayCollection({ tracks, playingId, onPlay }) {
  const queue = tracks.filter(canPlayTrack);
  const first = queue[0];
  if (!first) return null;
  const isPlaying = playingId === first.id;
  return <button type="button" className="primary" onClick={() => onPlay(first, queue)}>
    {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
    {isPlaying ? 'Pausar' : 'Reproducir'}
  </button>;
}

function TrackTable({ tracks, playingId, onPlay, isSaved, onSave, collection = 'Favoritos' }) {
  const playable = tracks.filter(canPlayTrack);
  return <div className="track-table">
    <div className="track-row track-header"><span>#</span><span>CANCIÓN</span><span>ÁLBUM</span><span><Clock3 size={15} aria-label="Duración" /></span><span /></div>
    {tracks.map((track, index) => {
      const isPlaying = playingId === track.id;
      const playbackLabel = (isPlaying ? 'Pausar ' : 'Reproducir ') + track.title;
      const available = canPlayTrack(track);
      const saved = isSaved(track);
      const details = <><Cover track={track} index={index} /><span className="track-copy"><strong>{track.title}</strong><small>{track.artist || 'Apple Music'}</small></span></>;
      return <div className={'track-row' + (isPlaying ? ' row-playing' : '')} key={track.id}>
        {available ? <button className="row-number" onClick={() => onPlay(track, playable)} aria-label={playbackLabel}><span>{index + 1}</span>{isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
          : <span className="chart-rank">{index + 1}</span>}
        {available ? <button className="row-title" onClick={() => onPlay(track, playable)}>{details}</button>
          : <a className="row-title" href={track.link} target="_blank" rel="noreferrer" title={isDeezerTrack(track) ? 'Abrir en Deezer' : 'Abrir en Apple Music'}>{details}<ExternalLink size={14} /></a>}
        <span className="album">{track.album || '—'}</span><span className="time">{track.duration > 0 ? formatTime(track.duration) : '—'}</span>
        <div className="row-actions"><button className={'icon' + (saved ? ' accent' : '')} title={(saved ? 'Quitar de ' : 'Guardar en ') + collection} aria-label={collection + ': ' + track.title} aria-pressed={saved} onClick={() => onSave(track)}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button></div>
      </div>;
    })}
  </div>;
}

function GenreRecommendations({ genre, savedTracks, cache, playingId, onPlay, favorite, onSave }) {
  const [selection, setSelection] = useState(() => cache.get(genre.id));
  const [request, setRequest] = useState(() => {
    const recent = cache.get(genre.id);
    return recent && Date.now() - recent.updatedAt < 30 * 60 * 1000 ? null : { saved: savedTracks, recent: [] };
  });
  const [loading, setLoading] = useState(Boolean(request));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    const saved = request.saved.map(({ id, title, artist }) => ({ id, title, artist }));
    fetch('/api/recomendaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ genre: genre.id, saved, recent: request.recent }),
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (controller.signal.aborted) return;
      const next = { ...data, recent: request.recent, updatedAt: Date.now() };
      cache.set(genre.id, next);
      setSelection(next);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message || 'Vibra no pudo cargar las recomendaciones.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [request, cache, genre.id]);

  function refresh() {
    const recent = [...(selection?.tracks.map(track => track.id) || []), ...(selection?.recent || [])];
    setLoading(true);
    setError('');
    setRequest({ saved: savedTracks, recent: [...new Set(recent)].slice(0, 15) });
  }

  return <section className="genre-recommendations" aria-labelledby="genre-recommendations-title" aria-busy={loading}>
    <div className="genre-recommendations-heading">
      <div>
        <h2 id="genre-recommendations-title">Las mejores de {genre.name}</h2>
        <p className="subtle">{selection?.source === 'deezer' ? 'Selección del catálogo de Deezer' : 'Recomendaciones de Vibra · Deezer'}</p>
      </div>
      <button type="button" className="icon recommendations-refresh" title="Renovar recomendaciones" aria-label="Renovar recomendaciones" disabled={loading} onClick={refresh}>
        <RefreshCw size={19} aria-hidden="true" />
      </button>
    </div>
    {error && <p className="subtle" role="status">{error}</p>}
    {selection ? <TrackTable tracks={selection.tracks} playingId={playingId} onPlay={onPlay} isSaved={favorite} onSave={onSave} collection={genre.name} />
      : loading && <p className="subtle" role="status">Vibra está buscando canciones para ti…</p>}
  </section>;
}

function Discography({ kind, id, onBack, onAlbum, onArtist, onPlay, playingId, favorite, onSave }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/discografia?' + new URLSearchParams({ [kind]: id }), { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (!controller.signal.aborted) setData(payload);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message || 'No se pudo cargar esta página.'); });
    return () => controller.abort();
  }, [kind, id, retry]);

  const album = data?.album;
  const artist = data?.artist;
  const title = album?.title || artist?.name;
  return <section className="discography" aria-label={title || 'Discografía'}>
    <button className="secondary discography-back" onClick={onBack}>Volver</button>
    {!data ? error ? <div className="empty">
      <p role="status">{error}</p>
      <button className="secondary" onClick={() => { setError(''); setRetry(retry + 1); }}>Reintentar</button>
    </div> : <p className="subtle chart-loading" role="status">Cargando {kind === 'artist' ? 'el artista' : 'el álbum'}…</p> : <>
      <header className="discography-hero">
        {album ? <Cover track={album} className="discography-cover" /> : <ArtistAvatar artist={artist} />}
        <div>
          <p className="subtle">{album ? 'Álbum' : 'Artista'}</p>
          <h1>{title}</h1>
          {album && <div className="discography-meta">
            <button onClick={() => onArtist(artist)}>{artist.name}</button>
            {/^[1-9]\d{3}/.test(album.released) && <span>{album.released.slice(0, 4)}</span>}
          </div>}
          {data.tracks.some(canPlayTrack) && <div className="discography-actions">
            <PlayCollection tracks={data.tracks} playingId={playingId} onPlay={onPlay} />
          </div>}
        </div>
      </header>
      <section className="playlist">
        <h2>{album ? 'Canciones' : 'Canciones destacadas'}</h2>
        {data.tracks.length > 0 ? <TrackTable tracks={data.tracks} playingId={playingId} onPlay={onPlay} isSaved={favorite} onSave={onSave} />
          : <p className="subtle">No hay canciones disponibles en este catálogo.</p>}
      </section>
      {!album && <section className="discography-albums">
        <h2>Álbumes</h2>
        {data.albums.length > 0 ? <div className="album-grid">{data.albums.map((record, index) => <button className="album-card" key={record.id} onClick={() => onAlbum(record.id)}>
          <Cover track={record} index={index} className="album-art" />
          <strong>{record.title}</strong>
          {/^[1-9]\d{3}/.test(record.released) && <small>{record.released.slice(0, 4)}</small>}
        </button>)}</div> : <p className="subtle">No hay álbumes disponibles en este catálogo.</p>}
      </section>}
    </>}
  </section>;
}

function WorldChart({ onPlay, playingId, favorite, onSave }) {
  const [chart, setChart] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function loadChart() {
      try {
        const response = await fetch('/api/top-mundial', { signal: controller.signal });
        if (!response.ok) throw new Error('Chart unavailable');
        const data = await response.json();
        if (controller.signal.aborted) return;
        setChart(data);
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    loadChart();
    const timer = setInterval(loadChart, 30 * 60 * 1000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [retry]);

  const published = chart?.publishedAt && new Date(chart.publishedAt);
  return <section className="world-chart" aria-labelledby="world-chart-title">
    <h1 id="world-chart-title">Top 20 Mundial</h1>
    <p className="subtle chart-source">
      <a href={chartSource} target="_blank" rel="noreferrer">Apple Music <ExternalLink size={13} aria-hidden="true" /></a>
      {published && !Number.isNaN(published.getTime()) && <time dateTime={chart.publishedAt}>
        {new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeZone: 'America/Guayaquil' }).format(published)}
      </time>}
    </p>
    {chart ? <div className="playlist"><TrackTable tracks={chart.tracks} playingId={playingId} onPlay={onPlay} isSaved={favorite} onSave={onSave} /></div>
      : error ? <div className="empty"><p role="status">El Top Mundial no está disponible en este momento.</p><button className="secondary" onClick={() => { setError(false); setRetry(retry + 1); }}>Reintentar</button></div>
      : <p className="subtle chart-loading" role="status">Cargando el Top Mundial…</p>}
  </section>;
}

export default function Home() {
  const [favorites, setFavorites] = useState([]);
  const [recentArtists, setRecentArtists] = useState([]);
  const recentArtistHistory = useRef([]);
  const [genreOverrides, setGenreOverrides] = useState({});
  const [view, setView] = useState('Inicio');
  const [genreSearch, setGenreSearch] = useState(false);
  const [active, setActive] = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [artworkLyricsOpen, setArtworkLyricsOpen] = useState(true);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [message, setMessage] = useState('');
  const player = useRef(null);
  const audioUrl = useRef(null);
  const sequence = useRef(0);
  const songInAddress = useRef(null);
  const autoNext = useRef(null);
  const repeatRef = useRef(false);
  const volumeRef = useRef(volume);
  const queue = useRef([]);
  const artworkClose = useRef(null);
  const coverButton = useRef(null);
  const analysisCache = useRef(new Map());
  const recommendationCache = useRef(new Map());
  const catalogSearches = useRef(new Map());
  const genreTracks = { ...genreDefaults, ...genreOverrides };
  const searchOrigin = useRef({ view: 'Inicio', genreSearch: false });
  const searchButton = useRef(null);
  const genreSearchButton = useRef(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(recentArtistsKey));
      if (!Array.isArray(stored)) return;
      const artists = stored.filter(artist => typeof artist?.id === 'string' && typeof artist?.name === 'string' && artist.name.trim());
      recentArtistHistory.current = artists.slice(0, recentArtistsLimit);
      setRecentArtists(recentArtistHistory.current);
    } catch {}
  }, []);

  function rememberArtist(artist) {
    const next = [artist, ...recentArtistHistory.current.filter(item => item.id !== artist.id)].slice(0, recentArtistsLimit);
    recentArtistHistory.current = next;
    setRecentArtists(next);
    try { localStorage.setItem(recentArtistsKey, JSON.stringify(next)); } catch {}
  }

  useEffect(() => {
    if (artworkOpen) artworkClose.current?.focus();
  }, [artworkOpen]);

  useEffect(() => {
    if (!playing || !active) return;
    const previousTitle = document.title;
    document.title = `${active.title} — ${active.artist} | JCN Studio`;
    return () => { document.title = previousTitle; };
  }, [playing, active]);

  function closeArtwork() {
    setArtworkOpen(false);
    requestAnimationFrame(() => coverButton.current?.focus());
  }

  useEffect(() => {
    songInAddress.current = new URL(window.location.href).searchParams.get(songParam);
    if (!window.history.state?.jcnGuard) {
      window.history.replaceState({ jcnGuard: true, jcnView: 'Inicio' }, '', window.location.href);
      window.history.pushState({ jcnGuard: true, jcnView: 'Inicio' }, '', window.location.href);
    }
    function handlePopState(event) {
      replaceSongInAddress(songInAddress.current);
      setView(event.state?.jcnView || 'Inicio');
      setGenreSearch(Boolean(event.state?.jcnGenreSearch));
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    window.addEventListener('popstate', handlePopState);
    try {
      const saved = JSON.parse(localStorage.getItem('jcn-library-v1'));
      const savedFavorites = Array.isArray(saved?.favorites) ? saved.favorites.filter(track => !fromRemovedCatalog(track)) : [];
      const savedGenres = Object.fromEntries(genres.flatMap(({ id }) => {
        const tracks = saved?.genres?.[id] ?? (id === 'indie' ? saved?.genres?.funk : undefined);
        if (!Array.isArray(tracks)) return [];
        if (saved.genreDefaultsApplied) return [[id, tracks]];
        const defaults = genreDefaults[id] || [];
        const extras = tracks.filter(track => !defaults.some(item => sameTrack(item, track)));
        return extras.length ? [[id, [...defaults, ...extras]]] : [];
      }));
      setFavorites(savedFavorites);
      setGenreOverrides(savedGenres);
      setActive(savedFavorites[0] || null);
    } catch {}
    const interval = setInterval(() => {
      if (player.current?.playing()) setTime(Number(player.current.seek()) || 0);
    }, 100);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearInterval(interval);
      sequence.current++;
      player.current?.unload();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);

  useEffect(() => {
    const requested = songInAddress.current;
    if (!requested) return;
    const details = catalogTrackId(requested);
    if (!details) {
      setMessage('El enlace de la canción no es válido.');
      return;
    }
    const controller = new AbortController();
    const playbackVersion = sequence.current;
    fetch('/api/catalog?' + new URLSearchParams(details), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Track unavailable');
        const [track] = await response.json();
        if (!track?.preview) throw new Error('Preview unavailable');
        if (controller.signal.aborted || sequence.current !== playbackVersion) return;
        setActive(track);
        setArtworkOpen(true);
      })
      .catch(() => {
        if (!controller.signal.aborted && sequence.current === playbackVersion) {
          setMessage('Este fragmento compartido no está disponible por ahora.');
        }
      });
    return () => controller.abort();
  }, []);

  function navigate(nextView, replace = false) {
    if (!replace && view !== nextView) {
      window.history.pushState({ jcnView: nextView }, '', window.location.href);
    } else if (replace) {
      window.history.replaceState({ jcnView: nextView }, '', window.location.href);
    }
    setView(nextView);
    setGenreSearch(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function openArtist(artist) {
    if (!artist?.name) return;
    if (artworkOpen) setArtworkOpen(false);
    if (genreSearch) {
      window.history.replaceState({ ...window.history.state, jcnGenreSearch: true }, '', window.location.href);
    }
    navigate('artist:' + encodeURIComponent(artist.id || artist.name));
  }

  function openSearch() {
    if (view === 'Buscar') return;
    searchOrigin.current = { view, genreSearch };
    navigate('Buscar');
  }

  function closeSearch() {
    const origin = searchOrigin.current;
    navigate(origin.view, true);
    setGenreSearch(origin.genreSearch);
    requestAnimationFrame(() => {
      if (!origin.genreSearch) searchButton.current?.focus();
    });
  }

  function closeGenreSearch() {
    setGenreSearch(false);
    if (window.history.state?.jcnGenreSearch) {
      window.history.replaceState({ ...window.history.state, jcnGenreSearch: false }, '', window.location.href);
    }
    genreSearchButton.current?.focus();
  }

  const isFavorite = track => favorites.some(item => sameTrack(item, track));
  const activeIsFavorite = isFavorite(active);
  function toggleSaved(track, genreId) {
    const list = genreId ? genreTracks[genreId] || [] : favorites;
    const wasSaved = list.some(item => sameTrack(item, track));
    const next = wasSaved
      ? list.filter(item => !sameTrack(item, track))
      : [...list, track];
    let nextFavorites = favorites;
    if (!genreId) nextFavorites = next;
    else if (!wasSaved && !isFavorite(track)) nextFavorites = [...favorites, track];
    const nextGenres = genreId ? { ...genreOverrides, [genreId]: next } : genreOverrides;
    try {
      localStorage.setItem('jcn-library-v1', JSON.stringify({
        favorites: nextFavorites, genres: nextGenres, genreDefaultsApplied: true,
      }));
      setFavorites(nextFavorites);
      setGenreOverrides(nextGenres);
    } catch {
      setMessage('No se pudo guardar la biblioteca en este navegador.');
    }
  }

  async function playTrack(track, list = favorites, restart = false) {
    if (!track) return;
    queue.current = list.some(item => item.id === track.id) ? list : [track];
    if (!restart && active?.id === track.id && player.current) {
      if (player.current.playing()) player.current.pause();
      else player.current.play();
      return;
    }
    const version = ++sequence.current;
    player.current?.unload();
    player.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    setActive(track);
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setMessage('');
    let source = track.preview;
    let format = track.previewFormat || (isDeezerTrack(track) ? 'mp3' : 'm4a');
    if (isDeezerTrack(track)) {
      try {
        const response = await fetch('/api/catalog?' + new URLSearchParams({ source: 'deezer', id: track.id.slice(7) }), { cache: 'no-store' });
        if (response.ok) {
          const [fresh] = await response.json();
          if (fresh?.preview && version === sequence.current) {
            source = fresh.preview;
            setActive(current => current?.id === track.id ? { ...current, ...fresh } : current);
          }
        }
      } catch {}
      if (version !== sequence.current) return;
    }
    if (track.local) {
      try {
        const files = await localFiles(track.id);
        if (version !== sequence.current) return;
        if (files?.audio) {
          source = audioUrl.current = URL.createObjectURL(files.audio);
          format = files.audio.name?.split('.').pop()?.toLowerCase() || 'mp3';
        }
      } catch {}
    }
    if (!source) { setMessage('Esta canción no tiene audio disponible.'); return; }
    const reportError = () => {
      setPlaying(false);
      setMessage('No se pudo reproducir el audio. Prueba otra canción o vuelve a intentarlo.');
    };
    const sound = new Howl({
      src: [source], format: [format], html5: true, volume: volumeRef.current,
      onload: () => { if (version === sequence.current) setDuration(sound.duration()); },
      onplay: () => {
        if (version !== sequence.current) return;
        songInAddress.current = shareableTrackId(track);
        replaceSongInAddress(songInAddress.current);
        setPlaying(true);
      },
      onpause: () => { if (version === sequence.current) setPlaying(false); },
      onloaderror: () => { if (version === sequence.current) reportError(); },
      onplayerror: () => { if (version === sequence.current) reportError(); },
      onend: () => {
        if (version !== sequence.current) return;
        setPlaying(false);
        setTime(0);
        if (repeatRef.current) sound.play();
        else if (queue.current.length > 1) autoNext.current?.();
      },
    });
    player.current = sound;
    sound.play();
  }

  function advance(direction) {
    const list = queue.current.length ? queue.current : favorites;
    if (!list.length) return;
    const index = list.findIndex(track => track.id === active?.id);
    const offset = shuffle && list.length > 1 ? 1 + Math.floor(Math.random() * (list.length - 1)) : direction;
    const next = index < 0 ? 0 : (index + offset + list.length) % list.length;
    playTrack(list[next], list, true);
  }
  useEffect(() => { autoNext.current = () => advance(1); });

  function changeVolume(value) {
    volumeRef.current = value;
    setVolume(value);
    player.current?.volume(value);
  }

  const promo = isPreviewTrack(active);
  const isFixed = view === 'Guardados';
  const genre = genres.find(item => item.id === view);
  const discography = /^(artist|album):(.+)$/.exec(view);
  const tracks = genre ? genreTracks[genre.id] || [] : isFixed ? fixedTracks : favorites;
  const viewTitle = genre?.name || view;
  const isSavedHere = genre ? track => tracks.some(item => sameTrack(item, track)) : isFavorite;
  const previewProvider = isDeezerTrack(active) ? 'Deezer' : 'iTunes';
  const togglePlayback = () => playTrack(active, queue.current.length ? queue.current : favorites);
  const playbackLabel = playing ? 'Pausar' : 'Reproducir';
  const playbackIcon = playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />;
  const seekPlayback = value => {
    player.current?.seek(value);
    setTime(value);
  };
  const transport = <>
    <button className={'icon ' + (shuffle ? 'accent' : '')} aria-label="Modo aleatorio" aria-pressed={shuffle} onClick={() => setShuffle(!shuffle)}><Shuffle size={17} /></button>
    <button className="icon" aria-label="Anterior" onClick={() => advance(-1)}><SkipBack size={19} fill="currentColor" /></button>
    <button className="main-play" disabled={!active} aria-label={playbackLabel} onClick={togglePlayback}>{playbackIcon}</button>
    <button className="icon" aria-label="Siguiente" onClick={() => advance(1)}><SkipForward size={19} fill="currentColor" /></button>
    <button className={'icon ' + (repeat ? 'accent' : '')} aria-label="Repetir canción" aria-pressed={repeat} onClick={() => { repeatRef.current = !repeat; setRepeat(!repeat); }}><Repeat size={17} /></button>
  </>;

  return <div className="app-shell">
    <div inert={artworkOpen}>
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('Inicio')} aria-label="JCN Studio, inicio"><span className="brand-icon"><AudioLines size={23} /></span><span>JCN<strong> Studio</strong></span></button>
      <nav aria-label="Navegación principal">
        {nav.map(([Icon, name]) => {
          const selected = view === name || (name === genresView && Boolean(genre));
          return <button key={name} className={selected ? 'selected' : ''} aria-label={name} aria-current={selected ? 'page' : undefined} onClick={() => navigate(name)}><Icon size={19} /> <span>{name}</span></button>;
        })}
      </nav>
    </aside>

    <main className="main">
      <header className="library-top"><button ref={searchButton} className="icon library-search" aria-label="Buscar música" title="Buscar música" aria-current={view === 'Buscar' ? 'page' : undefined} onClick={openSearch}><Search size={21} aria-hidden="true" /></button></header>
      <div className="view-content" key={view}>
      {discography ? <Discography kind={discography[1]} id={decodeURIComponent(discography[2])} onBack={() => window.history.back()} onAlbum={id => navigate('album:' + id)} onArtist={openArtist} onPlay={playTrack} playingId={playing ? active?.id : undefined} favorite={isFavorite} onSave={toggleSaved} />
        : view === 'Inicio' ? <>
          {recentArtists.length > 0 && <section className="recent-artists" aria-labelledby="recent-artists-title">
            <h2 id="recent-artists-title">Volver a escuchar</h2>
            <div className="recent-artists-list">
              {recentArtists.map(artist => <button key={artist.id} type="button" className="recent-artist" onClick={() => openArtist(artist)} title={artist.name}>
                <ArtistAvatar artist={artist} />
                <span>{artist.name}</span>
              </button>)}
            </div>
          </section>}
          <WorldChart onPlay={playTrack} playingId={playing ? active?.id : undefined} favorite={isFavorite} onSave={toggleSaved} />
        </>
        : view === genresView ? <section aria-labelledby="genres-title">
        <h1 id="genres-title">{genresView}</h1>
        <div className="genre-grid">{genres.map((item, index) => <button className="genre-card" key={item.id} onClick={() => navigate(item.id)} style={{ '--cover-delay': -(index % 5) * 1.9 + 's', '--entrance-delay': Math.min(index, 8) * 24 + 'ms' }}>
          <Cover track={item} index={index} className="genre-cover" />
          <span className="genre-name">{item.name}{genreTracks[item.id]?.length > 0 && <small>{genreTracks[item.id].length} guardadas</small>}</span>
        </button>)}</div>
      </section> : view === 'Buscar' ? <section className="content-section">
        <h1>Buscar música</h1>
        <p className="subtle catalog-scope">Los corazones de estos resultados guardan en Favoritos.</p>
        <Catalog onChoose={toggleSaved} favorite={isFavorite} onPlay={playTrack} playingId={playing ? active?.id : undefined} onClose={closeSearch} onArtist={openArtist} onRememberArtist={rememberArtist} searchMemory={catalogSearches.current} />
      </section> : <>
        <section className={'hero' + (genre ? ' genre-hero' : '')}>
          {genre ? <div className="genre-hero-cover" aria-hidden="true"><img key={genre.id} src={genre.art} alt="" /></div>
            : <div className="hero-vinyl" aria-hidden="true"><span className="vinyl-record"><span className="vinyl-label" /></span></div>}
          <div className="hero-content">
            <h1>{viewTitle}<span>.</span></h1>
            <p>{tracks.length} {tracks.length === 1 ? 'canción' : 'canciones'}</p>
            <div className="hero-actions">
              <PlayCollection tracks={tracks} playingId={playing ? active?.id : undefined} onPlay={playTrack} />
              {genre && <button ref={genreSearchButton} className={tracks.some(canPlayTrack) ? 'secondary' : 'primary'} aria-expanded={genreSearch} aria-controls="genre-search" onClick={() => genreSearch ? closeGenreSearch() : setGenreSearch(true)}><Plus size={18} /> Buscar canciones</button>}
            </div>
          </div>
        </section>
        {genre && genreSearch && <section className="content-section" id="genre-search" aria-label={'Buscar canciones para ' + genre.name}>
          <p className="subtle catalog-scope">El corazón guarda la canción en {genre.name} y también en Favoritos.</p>
          <Catalog key={genre.id} genre={genre.name} onChoose={track => toggleSaved(track, genre.id)} favorite={isSavedHere} onPlay={playTrack} playingId={playing ? active?.id : undefined} onClose={closeGenreSearch} onArtist={openArtist} onRememberArtist={rememberArtist} searchMemory={catalogSearches.current} />
        </section>}
        <section className="playlist" aria-label={viewTitle}>
          {tracks.length ? <TrackTable tracks={tracks} playingId={playing ? active?.id : undefined} onPlay={playTrack} isSaved={isSavedHere} onSave={track => toggleSaved(track, genre?.id)} collection={genre?.name} />
            : isFixed ? <p className="subtle">Todavía no hay canciones fijas.</p> : <div className="empty"><Heart size={29} /><h2>{genre ? 'Todavía no hay canciones en ' + genre.name : 'Tus favoritos empiezan aquí'}</h2><p className="subtle">Toca el corazón junto a una canción para guardarla aquí.</p></div>}
        </section>
        {genre && <GenreRecommendations key={genre.id} genre={genre} savedTracks={tracks} cache={recommendationCache.current} playingId={playing ? active?.id : undefined} onPlay={playTrack} favorite={isSavedHere} onSave={track => toggleSaved(track, genre.id)} />}
      </>}
      </div>
    </main>

    {!artworkOpen && active && (analysisOpen
      ? <SongAnalysis key={active.id} track={active} cache={analysisCache.current} onClose={() => setAnalysisOpen(false)} />
      : lyricsOpen && <Lyrics key={active.id} track={active} time={time} synchronized={!promo} onClose={() => setLyricsOpen(false)} />)}
    {message && <div className="toast" role="status">{message}<button className="icon" aria-label="Cerrar aviso" onClick={() => setMessage('')}><X size={17} /></button></div>}
    <footer className="player">
      <div className="now"><button ref={coverButton} className="now-cover" type="button" aria-label="Abrir reproductor a pantalla completa" title="Abrir reproductor a pantalla completa" disabled={!active} onClick={() => setArtworkOpen(true)}><Cover key={active?.id} track={active} /><Maximize2 className="cover-expand" size={18} aria-hidden="true" /></button><div className="track-copy"><strong>{active?.title || 'Elige una canción'}</strong><small>{active?.artist || 'JCN Studio'}</small>
        {promo && active.link && <a className="promo" href={active.link} target="_blank" rel="noreferrer" title={'Fragmento cortesía de ' + previewProvider}>{previewProvider} · fragmento <ExternalLink size={10} /></a>}</div>
        {active && <button className={'icon now-heart ' + (isSavedHere(active) ? 'accent' : '')} aria-label={genre ? 'Guardar o quitar de ' + genre.name : 'Cambiar favorito'} aria-pressed={isSavedHere(active)} onClick={() => toggleSaved(active, genre?.id)}><Heart size={18} fill={isSavedHere(active) ? 'currentColor' : 'none'} /></button>}</div>
      <div className="player-center"><div className="transport">{transport}</div><PlaybackProgress time={time} duration={duration} onSeek={seekPlayback} /></div>
      <div className="extras"><button className={'icon ' + (lyricsOpen && !analysisOpen ? 'accent' : '')} aria-label="Mostrar letra" title="Letra" aria-pressed={lyricsOpen && !analysisOpen} disabled={!active} onClick={() => { setLyricsOpen(analysisOpen || !lyricsOpen); setAnalysisOpen(false); }}><Mic2 size={18} /></button><button className={'icon ' + (analysisOpen ? 'accent' : '')} aria-label="Significado con Vibra" title="Significado con Vibra" aria-pressed={analysisOpen} disabled={!active} onClick={() => setAnalysisOpen(!analysisOpen)}><Sparkles size={18} /></button><button className="icon volume-icon" aria-label={volume ? 'Silenciar' : 'Activar sonido'} onClick={() => changeVolume(volume ? 0 : 0.72)}>{volume ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><input className="volume-slider" type="range" min="0" max="1" step="0.01" value={volume} aria-label="Volumen" style={{'--fill': volume * 100 + '%'}} onChange={event => changeVolume(Number(event.target.value))} /></div>
    </footer>
    </div>
    {artworkOpen && active && <section className="artwork-stage" aria-label="Reproductor a pantalla completa" onKeyDown={event => {
      if (event.key === 'Escape') closeArtwork();
    }}>
      <button ref={artworkClose} className="icon artwork-close" aria-label="Volver a la biblioteca" onClick={closeArtwork}><X size={24} /></button>
      <div className="artwork-backdrop" key={active.id} aria-hidden="true"><Cover track={active} /><Cover track={active} /></div>
      <div className={'artwork-content' + (artworkLyricsOpen || analysisOpen ? ' with-lyrics' : '')}>
        <div className="artwork-record">
          <div className="artwork-cover-area">
            <Cover key={active.id} track={active} className="artwork-large" />
            <div className="artwork-tools">
              <button type="button" className="icon artwork-tool" aria-label="Favorito de la canción" title={activeIsFavorite ? 'Quitar de Favoritos' : 'Guardar en Favoritos'} aria-pressed={activeIsFavorite} onClick={() => toggleSaved(active)}><Heart size={20} fill={activeIsFavorite ? 'currentColor' : 'none'} /></button>
              <button className="icon artwork-tool" aria-label="Mostrar letra" title="Letra" aria-pressed={artworkLyricsOpen && !analysisOpen} onClick={() => { setArtworkLyricsOpen(analysisOpen || !artworkLyricsOpen); setAnalysisOpen(false); }}><Mic2 size={20} /></button>
              <button className="icon artwork-tool" aria-label="Significado con Vibra" title="Significado con Vibra" aria-pressed={analysisOpen} onClick={() => setAnalysisOpen(!analysisOpen)}><Sparkles size={20} /></button>
            </div>
          </div>
          <div className="artwork-meta"><h2>{active.title}</h2><button className="artwork-artist-link" onClick={() => openArtist({ name: active.artist })}>{active.artist}</button>
            {promo && active.link && <a className="promo" href={active.link} target="_blank" rel="noreferrer">Fragmento cortesía de {previewProvider} <ExternalLink size={12} /></a>}
          </div>
          <PlaybackProgress time={time} duration={duration} onSeek={seekPlayback} />
          <div className="transport artwork-transport">{transport}</div>
          {message && <p className="artwork-status" role="status">{message}</p>}
        </div>
        {!artworkLyricsOpen && !analysisOpen && <ArtistCredits key={active.id} track={active} onArtist={openArtist} />}
        {analysisOpen ? <SongAnalysis key={active.id} track={active} cache={analysisCache.current} onClose={() => setAnalysisOpen(false)} expanded />
          : artworkLyricsOpen && <Lyrics key={active.id} track={active} time={time} synchronized={!promo} expanded />}
      </div>
    </section>}
  </div>;
}
