'use client';

import '@fontsource-variable/dm-sans';
import { useEffect, useRef, useState } from 'react';
import { AudioLines, Clock3, Heart, House, ListMusic, Maximize2, Mic2, Music2, Pause, Play, Plus, Repeat, Search, Shuffle, SkipBack, SkipForward, Sparkles, Volume2, VolumeX, X, ExternalLink } from 'lucide-react';
import { Howl } from 'howler';
import { localFiles } from './storage';
import fixedTracks from './mis-fijas.json';
import genres from './genres.json';
import genreDefaults from './canciones-por-genero.json';

const nav = [[House, 'Inicio'], [Heart, 'Favoritos'], [ListMusic, 'Mis fijas']];
const colors = ['#613339','#384a45','#49405e','#74494f','#665466','#39485e'];
const formatTime = seconds => seconds > 0 ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00';
const sameTrack = (left, right) => left && right &&
  (left.id === right.id || [left.title, left.artist].join('|').toLowerCase() === [right.title, right.artist].join('|').toLowerCase());
const fromRemovedCatalog = track => track?.id?.startsWith('jamendo-');
const isDeezerTrack = track => track?.id?.startsWith('deezer-');
const isPreviewTrack = track => !track?.local && Boolean(track?.preview || isDeezerTrack(track));

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

function Catalog({ onChoose, favorite, onPlay, playingId, genre, onClose }) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('deezer');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  const searchRequest = useRef(null);

  useEffect(() => () => searchRequest.current?.abort(), []);

  async function search(event) {
    event.preventDefault();
    if (!query.trim()) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setStatus('Buscando canciones…');
    try {
      const response = await fetch('/api/catalog?' + new URLSearchParams({ q: query, source }), { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const matches = data.filter(track => track.preview);
      setResults(matches);
      setStatus(matches.length ? '' : 'No encontré canciones con fragmentos disponibles.');
    } catch (error) {
      if (controller.signal.aborted) return;
      setResults([]);
      setStatus(error.message || 'La búsqueda falló.');
    }
  }

  return <>
    <form className="search-form" onSubmit={search}>
      <div className="input-shell">
        <Search size={17} aria-hidden="true" />
        <input aria-label="Canción o artista" placeholder={genre ? 'Buscar para ' + genre : 'Canción o artista'} value={query} onChange={event => setQuery(event.target.value)} required autoFocus />
        <button type="button" className="icon search-close" aria-label="Cerrar buscador" title="Cerrar buscador" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <select aria-label="Catálogo" value={source} onChange={event => { searchRequest.current?.abort(); setSource(event.target.value); setResults([]); setStatus(''); }}><option value="deezer">Deezer</option><option value="apple">iTunes</option></select>
      <button className="primary">Buscar</button>
    </form>
    {status && <p className="subtle" role="status">{status}</p>}
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
      if (!controller.signal.aborted) setResult({ error: 'No se pudo consultar Groq.' });
    });
    return () => controller.abort();
  }, [track, cache, cacheKey, retry]);

  return <aside className={expanded ? 'artwork-analysis' : 'lyrics analysis-panel'} aria-label="Significado de la canción">
    <div className="dialog-head">
      <h2>De qué va la canción</h2>
      <button className="icon" onClick={onClose} aria-label="Cerrar análisis"><X size={19} /></button>
    </div>
    <div className="analysis-scroll" tabIndex={0}>
      {!result ? <p role="status">Groq está interpretando la canción…</p> : result.error ?
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

export default function Home() {
  const [favorites, setFavorites] = useState([]);
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
  const autoNext = useRef(null);
  const repeatRef = useRef(false);
  const volumeRef = useRef(volume);
  const queue = useRef([]);
  const artworkClose = useRef(null);
  const coverButton = useRef(null);
  const analysisCache = useRef(new Map());
  const genreTracks = { ...genreDefaults, ...genreOverrides };
  const searchOrigin = useRef({ view: 'Inicio', genreSearch: false });
  const searchButton = useRef(null);
  const genreSearchButton = useRef(null);

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
      clearInterval(interval);
      sequence.current++;
      player.current?.unload();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);

  function navigate(nextView) {
    setView(nextView);
    setGenreSearch(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function openSearch() {
    if (view === 'Buscar') return;
    searchOrigin.current = { view, genreSearch };
    navigate('Buscar');
  }

  function closeSearch() {
    const origin = searchOrigin.current;
    navigate(origin.view);
    setGenreSearch(origin.genreSearch);
    requestAnimationFrame(() => {
      if (!origin.genreSearch) searchButton.current?.focus();
    });
  }

  function closeGenreSearch() {
    setGenreSearch(false);
    genreSearchButton.current?.focus();
  }

  const isFavorite = track => favorites.some(item => sameTrack(item, track));
  function toggleSaved(track, genreId) {
    const list = genreId ? genreTracks[genreId] || [] : favorites;
    const next = list.some(item => sameTrack(item, track))
      ? list.filter(item => !sameTrack(item, track))
      : [...list, track];
    const nextFavorites = genreId ? favorites : next;
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
    if (!restart && active?.id === track.id && player.current) {
      if (player.current.playing()) player.current.pause();
      else player.current.play();
      return;
    }
    const version = ++sequence.current;
    queue.current = list.some(item => item.id === track.id) ? list : [track];
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
          if (fresh?.preview) source = fresh.preview;
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
      onplay: () => { if (version === sequence.current) setPlaying(true); },
      onpause: () => { if (version === sequence.current) setPlaying(false); },
      onloaderror: () => { if (version === sequence.current) reportError(); },
      onplayerror: () => { if (version === sequence.current) reportError(); },
      onend: () => {
        if (version !== sequence.current) return;
        setPlaying(false);
        setTime(0);
        if (repeatRef.current) sound.play();
        else if (!isPreviewTrack(track) && queue.current.length > 1) autoNext.current?.();
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
  const isFixed = view === 'Mis fijas';
  const genre = genres.find(item => item.id === view);
  const tracks = genre ? genreTracks[genre.id] || [] : isFixed ? fixedTracks : favorites;
  const viewTitle = genre?.name || view;
  const isSavedHere = genre ? track => tracks.some(item => sameTrack(item, track)) : isFavorite;
  const firstTrack = tracks[0];
  const firstIsPlaying = playing && active?.id === firstTrack?.id;
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
          const selected = view === name || (name === 'Inicio' && Boolean(genre));
          return <button key={name} className={selected ? 'selected' : ''} aria-label={name} aria-current={selected ? 'page' : undefined} onClick={() => navigate(name)}><Icon size={19} /> <span>{name}</span></button>;
        })}
      </nav>
    </aside>

    <main className="main">
      <header className="library-top"><button ref={searchButton} className="icon library-search" aria-label="Buscar música" title="Buscar música" aria-current={view === 'Buscar' ? 'page' : undefined} onClick={openSearch}><Search size={21} aria-hidden="true" /></button></header>
      <div className="view-content" key={view}>
      {view === 'Inicio' ? <section aria-labelledby="genres-title">
        <h1 id="genres-title">Mis géneros</h1>
        <div className="genre-grid">{genres.map((item, index) => <button className="genre-card" key={item.id} onClick={() => navigate(item.id)} style={{ '--cover-delay': -(index % 5) * 1.9 + 's', '--entrance-delay': Math.min(index, 8) * 24 + 'ms' }}>
          <Cover track={item} index={index} className="genre-cover" />
          <span className="genre-name">{item.name}{genreTracks[item.id]?.length > 0 && <small>{genreTracks[item.id].length} guardadas</small>}</span>
        </button>)}</div>
      </section> : view === 'Buscar' ? <section className="content-section">
        <h1>Buscar música</h1>
        <p className="subtle catalog-scope">Los corazones de estos resultados guardan en Favoritos.</p>
        <Catalog onChoose={toggleSaved} favorite={isFavorite} onPlay={playTrack} playingId={playing ? active?.id : undefined} onClose={closeSearch} />
      </section> : <>
        <section className={'hero' + (genre ? ' genre-hero' : '')}>
          {genre && <div className="genre-hero-cover" aria-hidden="true"><img key={genre.id} src={genre.art} alt="" /></div>}
          <div className="hero-content">
            <h1>{viewTitle}<span>.</span></h1>
            <p>{tracks.length} {tracks.length === 1 ? 'canción' : 'canciones'}</p>
            <div className="hero-actions">
              {firstTrack && <button className="primary" onClick={() => playTrack(firstTrack, tracks)}>{firstIsPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />} {firstIsPlaying ? 'Pausar' : 'Reproducir'}</button>}
              {genre ? <button ref={genreSearchButton} className={firstTrack ? 'secondary' : 'primary'} aria-expanded={genreSearch} aria-controls="genre-search" onClick={() => setGenreSearch(!genreSearch)}><Plus size={18} /> Buscar canciones</button>
                : <button className={firstTrack ? 'secondary' : 'primary'} onClick={openSearch}><Search size={17} /> Buscar música</button>}
            </div>
          </div>
        </section>
        {genre && genreSearch && <section className="content-section" id="genre-search" aria-label={'Buscar canciones para ' + genre.name}>
          <p className="subtle catalog-scope">Guarda con el corazón las canciones que quieras en {genre.name}.</p>
          <Catalog key={genre.id} genre={genre.name} onChoose={track => toggleSaved(track, genre.id)} favorite={isSavedHere} onPlay={playTrack} playingId={playing ? active?.id : undefined} onClose={closeGenreSearch} />
        </section>}
        <section className="playlist" aria-label={viewTitle}>
          {tracks.length ? <div className="track-table">
            <div className="track-row track-header"><span>#</span><span>CANCIÓN</span><span>ÁLBUM</span><span><Clock3 size={15} aria-label="Duración" /></span><span /></div>
            {tracks.map((track, index) => {
              const isPlaying = active?.id === track.id && playing;
              const playbackLabel = (isPlaying ? 'Pausar ' : 'Reproducir ') + track.title;
              const saved = isSavedHere(track);
              const collection = genre?.name || 'Favoritos';
              return <div className={'track-row' + (isPlaying ? ' row-playing' : '')} key={track.id}>
                <button className="row-number" onClick={() => playTrack(track, tracks)} aria-label={playbackLabel}><span>{index + 1}</span>{isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
                <button className="row-title" onClick={() => playTrack(track, tracks)}><Cover track={track} index={index} /><span className="track-copy"><strong>{track.title}</strong><small>{track.artist}</small></span></button>
                <span className="album">{track.album || '—'}</span><span className="time">{track.duration > 0 ? formatTime(track.duration) : '—'}</span>
                <div className="row-actions"><button className={'icon' + (saved ? ' accent' : '')} title={(saved ? 'Quitar de ' : 'Guardar en ') + collection} aria-label={collection + ': ' + track.title} aria-pressed={saved} onClick={() => toggleSaved(track, genre?.id)}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button></div>
              </div>;
            })}
          </div> : isFixed ? <p className="subtle">Todavía no hay canciones fijas.</p> : <div className="empty"><Heart size={29} /><h2>{genre ? 'Todavía no hay canciones en ' + genre.name : 'Tus favoritos empiezan aquí'}</h2><p className="subtle">Toca el corazón junto a una canción para guardarla aquí.</p></div>}
        </section>
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
      <div className="extras"><button className={'icon ' + (lyricsOpen && !analysisOpen ? 'accent' : '')} aria-label="Mostrar letra" title="Letra" aria-pressed={lyricsOpen && !analysisOpen} disabled={!active} onClick={() => { setLyricsOpen(analysisOpen || !lyricsOpen); setAnalysisOpen(false); }}><Mic2 size={18} /></button><button className={'icon ' + (analysisOpen ? 'accent' : '')} aria-label="Significado con Groq" title="Significado con Groq" aria-pressed={analysisOpen} disabled={!active} onClick={() => setAnalysisOpen(!analysisOpen)}><Sparkles size={18} /></button><button className="icon volume-icon" aria-label={volume ? 'Silenciar' : 'Activar sonido'} onClick={() => changeVolume(volume ? 0 : 0.72)}>{volume ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><input className="volume-slider" type="range" min="0" max="1" step="0.01" value={volume} aria-label="Volumen" style={{'--fill': volume * 100 + '%'}} onChange={event => changeVolume(Number(event.target.value))} /></div>
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
              <button className="icon artwork-tool" aria-label="Mostrar letra" title="Letra" aria-pressed={artworkLyricsOpen && !analysisOpen} onClick={() => { setArtworkLyricsOpen(analysisOpen || !artworkLyricsOpen); setAnalysisOpen(false); }}><Mic2 size={20} /></button>
              <button className="icon artwork-tool" aria-label="Significado con Groq" title="Significado con Groq" aria-pressed={analysisOpen} onClick={() => setAnalysisOpen(!analysisOpen)}><Sparkles size={20} /></button>
            </div>
          </div>
          <div className="artwork-meta"><h2>{active.title}</h2><p>{active.artist}</p>
            {promo && active.link && <a className="promo" href={active.link} target="_blank" rel="noreferrer">Fragmento cortesía de {previewProvider} <ExternalLink size={12} /></a>}
          </div>
          <PlaybackProgress time={time} duration={duration} onSeek={seekPlayback} />
          <div className="transport artwork-transport">{transport}</div>
          {message && <p className="artwork-status" role="status">{message}</p>}
        </div>
        {analysisOpen ? <SongAnalysis key={active.id} track={active} cache={analysisCache.current} onClose={() => setAnalysisOpen(false)} expanded />
          : artworkLyricsOpen && <Lyrics key={active.id} track={active} time={time} synchronized={!promo} expanded />}
      </div>
    </section>}
  </div>;
}
