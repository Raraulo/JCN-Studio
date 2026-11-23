# JCN Studio

Biblioteca musical personal hecha con Next.js, Tailwind CSS y Howler.js.

## Arranque local

```powershell
npm.cmd ci
npm.cmd run dev
```

Abre http://localhost:3000.

- **Favoritos** guarda en `localStorage` las canciones marcadas con un corazón.
- **Inicio** muestra las primeras 20 posiciones del Top 100 Global de Apple Music. La fuente publica su lista a diario y la app vuelve a consultarla cada 30 minutos.
- **Explorar géneros** muestra las colecciones. Al marcar una canción con el corazón se guarda en el género activo y en Favoritos. Puedes quitarla de cada lista por separado. El buscador superior guarda directamente en Favoritos. Las colecciones también se guardan en `localStorage`.
- Las canciones iniciales de cada género se editan en `app/canciones-por-genero.json`. Una vez que modificas una lista con el corazón, el navegador conserva tus cambios.
- **Mis fijas** lee sus canciones de `app/mis-fijas.json`, en el mismo orden en que aparecen en el archivo. Para cambiar una, reemplaza su entrada completa. Si usas Deezer, escribe el ID como `deezer-1065099142` con el número de la canción correspondiente. Puedes omitir `preview` en esa entrada porque el reproductor obtiene el fragmento al abrirla.
- Los buscadores consultan Deezer y también permiten elegir iTunes. Ambos reproducen fragmentos promocionales cuando están disponibles. El enlace junto a la canción abre su ficha en el catálogo.
- **Letra** (micrófono) busca en LRCLIB. Si el audio es completo y hay marcas LRC, el reproductor resalta la línea correspondiente.
- **Vibra** interpreta la canción activa desde la estrella y recomienda canciones debajo de cada género. Para generar recomendaciones consulta listas del catálogo de Deezer. La variable del servidor `GROQ_API_KEY` habilita Vibra.
- Haz clic en la carátula del reproductor inferior para abrir la vista que ocupa toda la página. Arrastra la barra para buscar un punto de la pista y usa el micrófono para mostrar las letras sobre el fondo animado, junto a la carátula. Pulsa **Esc** o el botón de cierre para volver.
- Al reproducir una canción del catálogo, puedes copiar la dirección de la página para compartirla. Quien abra el enlace verá el reproductor con esa canción lista para reproducir.
- Los favoritos pertenecen al navegador y al dominio donde abras la app. Si borras los datos del sitio, también se borran los favoritos.
