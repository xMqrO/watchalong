// ── i18n (Spanish / English) ──────────────────────────────────────────────────
// The language is driven entirely by the URL: /es → Spanish, anything else → English.
// A MutationObserver-backed DOM translator replaces visible English strings with
// Spanish for /es, so every page & component is covered without per-string wiring.

const ES = {
  // ── global chrome ──────────────────────────────────────────────────────────
  "Home": "Inicio",
  "Downloads": "Descargas",
  "Settings": "Ajustes",
  "Library & History": "Biblioteca e historial",
  "Search (⌘F)": "Buscar (⌘F)",
  "Back (Ctrl+Z)": "Atrás (Ctrl+Z)",
  "Help & Shortcuts (?)": "Ayuda y atajos (?)",
  "Quit App": "Salir de la app",
  "Back": "Atrás",
  "Close": "Cerrar",
  "Cancel": "Cancelar",
  "Save": "Guardar",
  "✓ Saved": "✓ Guardado",
  "Save Layout": "Guardar diseño",
  "Retry": "Reintentar",
  "Try Again": "Reintentar",
  "Install Update": "Instalar actualización",
  "Dismiss": "Descartar",
  "Remove": "Eliminar",
  "Delete": "Eliminar",
  "More": "Más",
  "Reset": "Restablecer",
  "Download": "Descargar",
  "Search": "Buscar",
  "Downloads": "Descargas",
  "Watched": "Visto",
  "Series": "Serie",
  "Movie": "Película",
  "Playing": "Reproduciendo",
  "Unreleased": "No estrenada",
  "Trailer": "Tráiler",
  "Loading…": "Cargando…",
  "Laden…": "Cargando…",
  "seconds": "segundos",
  "Yes": "Sí",
  "No": "No",
  "Close (Esc)": "Cerrar (Esc)",
  "Open in Browser": "Abrir en el navegador",
  "Open in browser": "Abrir en el navegador",
  "Browse": "Examinar",
  "Browse…": "Examinar…",
  "Browse …": "Examinar…",
  "Minimize": "Minimizar",
  "Maximize": "Maximizar",

  // ── sidebar / nav ──────────────────────────────────────────────────────────
  "WatchAlong": "WatchAlong",
  "Search (⌘F)": "Buscar (⌘F)",
  "Search  (⌘F)": "Buscar  (⌘F)",
  "Search (Ctrl+K)": "Buscar (Ctrl+K)",

  // ── app shell / status ─────────────────────────────────────────────────────
  "This page doesn't exist.": "Esta página no existe.",
  "Back to home": "Volver al inicio",
  "Checking for new episodes…": "Comprobando si hay nuevos episodios…",
  "No new episodes found": "No hay nuevos episodios",
  "New episode": "Nuevo episodio",
  "New episodes": "Nuevos episodios",
  "Season": "Temporada",
  " available": " disponible",
  "Controller connected": "Mando conectado",
  "Added to watchlist": "Añadido a la lista",
  "Removed from watchlist": "Eliminado de la lista",

  // ── home page ──────────────────────────────────────────────────────────────
  "Watch Now": "Ver ahora",
  "More Info": "Más información",
  "Trending · Movie": "Tendencias · Películas",
  "Recommended for You": "Recomendado para ti",
  "Trending Movies": "Películas en tendencia",
  "Trending Series": "Series en tendencia",
  "Top Rated": "Mejor valoradas",
  "Continue Watching": "Continuar viendo",
  "No internet connection": "Sin conexión a internet",
  "ANIME": "ANIME",
  "🔒 Coming Soon": "🔒 Próximamente",
  "Previous": "Anterior",
  "Next": "Siguiente",
  "No Image": "Sin imagen",

  // ── movie / tv detail ──────────────────────────────────────────────────────
  "✓ Mark Watched": "✓ Marcar como visto",
  "✓ Mark as Watched": "✓ Marcar como visto",
  "Mark as Watched": "Marcar como visto",
  "↩ Mark as Unwatched": "↩ Marcar como no visto",
  "Mark as Unwatched": "Marcar como no visto",
  "⊘ Mark as Not Started": "⊘ Marcar como sin empezar",
  "⊘ Not Started": "⊘ Sin empezar",
  "🔒 Trailer": "🔒 Tráiler",
  "🔒 Restricted": "🔒 Restringido",
  "🔒 Unreleased": "🔒 No estrenada",
  "Inappropriate for your age rating setting": "No apto para tu configuración de edad",
  "Inappropriate for your age setting": "No apto para tu configuración de edad",
  "Inappropriate for your age": "No apto para tu edad",
  "This movie has not been released yet": "Esta película aún no se ha estrenado",
  "Download this movie": "Descargar esta película",
  "Download this episode": "Descargar este episodio",
  "Movie not found on AllManga": "Película no encontrada en AllManga",
  "Episode not found on AllManga": "Episodio no encontrado en AllManga",
  "Episodes": "Episodios",
  "Up Next": "A continuación",
  "Play Now": "Reproducir ahora",
  "SKIP": "OMITIR",
  "Intro": "Intro",
  "Outro": "Outro",
  "Right-click to mark season as watched/unwatched": "Clic derecho para marcar la temporada como vista/no vista",
  "Change source": "Cambiar fuente",
  "Toggle Sub/Dub": "Alternar sub/doblaje",
  "Resume player": "Reanudar reproductor",
  "Redirect blocked": "Redirección bloqueada",
  "Try a different source, or switch sub/dub.": "Prueba otra fuente o cambia de sub/doblaje.",
  "Mark progress:": "Marcar progreso:",
  "No automatic progress tracking for this source": "Sin seguimiento automático de progreso para esta fuente",
  "⚠ no tracking": "⚠ sin seguimiento",

  // ── library / history ──────────────────────────────────────────────────────
  "My Library": "Mi biblioteca",
  "Watch history, progress, and saved titles": "Historial, progreso y títulos guardados",
  "Watch History": "Historial",
  "Nothing here yet": "Aún no hay nada aquí",
  "Start watching a movie or series and your history will appear here.":
    "Empieza a ver una película o serie y tu historial aparecerá aquí.",
  "Remove from history": "Eliminar del historial",

  // ── downloads ──────────────────────────────────────────────────────────────
  "DOWNLOADS": "DESCARGAS",
  "Sort by": "Ordenar por",
  "Active": "Activo",
  "Local Files": "Archivos locales",
  "Local": "Local",
  "No downloads yet": "Aún no hay descargas",
  "File missing": "Archivo no encontrado",
  "View Log": "Ver registro",
  "Open error log": "Abrir registro de errores",
  "Filter downloads…": "Filtrar descargas…",
  "Folder to scan…": "Carpeta para escanear…",
  "Set watch progress": "Establecer progreso",
  "Show in folder": "Mostrar en carpeta",

  // ── search ─────────────────────────────────────────────────────────────────
  "Search for movies and series": "Buscar películas y series",
  "Search movie": "Buscar película",
  "Search movies and series...": "Buscar películas y series...",
  "Recent searches": "Búsquedas recientes",
  "Clear all": "Borrar todo",
  "Search for movies and series \u00A0·\u00A0": "Buscar películas y series \u00A0·\u00A0",
  "ESC": "ESC",
  "to close": "para cerrar",
  "🌐 No internet, search is unavailable offline.":
    "🌐 Sin internet, la búsqueda no está disponible sin conexión.",

  // ── settings ───────────────────────────────────────────────────────────────
  "SETTINGS": "AJUSTES",
  "App configuration for WatchAlong": "Configuración de la app WatchAlong",
  "Search settings…": "Buscar en ajustes…",
  "Jump to Section": "Ir a la sección",
  "Search on this page…": "Buscar en esta página…",
  "Previous match (Shift+Enter)": "Coincidencia anterior (Mayús+Intro)",
  "Next match (Enter)": "Siguiente coincidencia (Intro)",
  "Clear search": "Limpiar búsqueda",
  "General": "General",
  "Content": "Contenido",
  "Playback": "Reproducción",
  "Redirect & Popup Shield": "Escudo antirredirecciones y ventanas emergentes",
  "Subtitles": "Subtítulos",
  "Notifications": "Notificaciones",
  "Interface": "Interfaz",
  "Library": "Biblioteca",
  "Backup & Restore": "Copia de seguridad y restauración",
  "Storage & Data": "Almacenamiento y datos",
  "Shields": "Escudos",
  "trackers, ads, and more blocked": "rastreadores, anuncios y más bloqueados",
  "Advanced options": "Opciones avanzadas",
  "Learn more": "Más información",
  "Filter lists": "Listas de filtros",
  "Global Settings": "Configuración global",
  "Aggressively block trackers & ads": "Bloquear de forma agresiva rastreadores y anuncios",
  "Upgrade connections to HTTPS": "Actualizar conexiones a HTTPS",
  "Block scripts": "Bloquear scripts",
  "Block fingerprinting": "Bloquear la toma de huella",
  "Block third-party cookies": "Bloquear cookies de terceros",
  "Forget me when I close this site": "Olvidarme al cerrar este sitio",
  "Age Rating & Parental Controls": "Clasificación de edad y control parental",
  "No restriction": "Sin restricción",
  "Rating Country": "País de clasificación",
  "Maximum Allowed Age Rating": "Clasificación de edad máxima permitida",
  "you won't be able to play it.": "no podrás reproducirlo.",
  "to disable this feature entirely.": "para desactivar esta función por completo.",
  "Auto-Watched Threshold": "Umbral de visto automático",
  "Watched ✓": "Visto ✓",
  "Autoplay Next Episode": "Reproducir automáticamente el siguiente episodio",
  "Configure how the player behaves when an episode finishes.":
    "Configura cómo se comporta el reproductor al terminar un episodio.",
  "Enable Autoplay Next": "Activar reproducción automática",
  "Automatically play the next episode when the current one ends.":
    "Reproduce automáticamente el siguiente episodio al terminar el actual.",
  "Countdown Duration": "Duración de la cuenta atrás",
  "Overlay Position": "Posición de la superposición",
  "Download Folder": "Carpeta de descargas",
  "Install Location": "Ubicación de instalación",
  "Clear Cache": "Limpiar caché",
  "Clear Watch Progress": "Borrar progreso",
  "Delete All Downloads": "Eliminar todas las descargas",
  "CLEAR WATCH PROGRESS?": "¿BORRAR PROGRESO?",
  "DELETE ALL DOWNLOADS?": "¿ELIMINAR TODAS LAS DESCARGAS?",
  "RESET WATCHALONG?": "¿REINICIAR WATCHALONG?",
  "This action cannot be undone.": "Esta acción no se puede deshacer.",
  "Irreversible": "Irreversible",
  "Yes, Reset Everything": "Sí, restablecer todo",
  "App Version": "Versión de la app",
  "Current version": "Versión actual",
  "✓ You're up to date": "✓ Estás al día",
  "Check for updates on startup": "Buscar actualizaciones al iniciar",
  "Home Page Layout": "Diseño de la página de inicio",
  "Row display style": "Estilo de las filas",
  "Scheduled Backups": "Copias de seguridad programadas",
  "Automatically save a backup file on a schedule":
    "Guarda automáticamente una copia de seguridad según un programa",
  "Backup Folder": "Carpeta de copias",
  "Frequency": "Frecuencia",
  "Keep Last N Backups": "Conservar las últimas N copias",
  "⬆ Export Backup": "⬆ Exportar copia",
  "⬇ Import Backup": "⬇ Importar copia",
  "Appearance": "Apariencia",
  "Theme": "Tema",
  "Reset to defaults": "Restablecer valores predeterminados",
  "Accent Colour": "Color de acento",
  "Apply accent colour to streaming player": "Aplicar el color de acento al reproductor",
  "Font Size": "Tamaño de fuente",
  "Compact card grid": "Cuadrícula compacta",
  "Shows more titles per row by reducing card size.":
    "Muestra más títulos por fila reduciendo el tamaño de las tarjetas.",
  "Reduce animations": "Reducir animaciones",
  "Disables transitions and hover effects throughout the app.":
    "Desactiva transiciones y efectos al pasar el ratón en toda la app.",
  "Controller support": "Compatibilidad con mandos",
  "Library & Privacy": "Biblioteca y privacidad",
  "Watchlist sort order": "Orden de la lista de ver más tarde",
  "Record watch history": "Registrar historial",
  "Start Page": "Página de inicio",
  "Choose which page opens when you launch WatchAlong.":
    "Elige qué página se abre al iniciar WatchAlong.",
  "Metadata Language": "Idioma de los metadatos",
  "✓ Saved, cache cleared": "✓ Guardado, caché borrada",
  "Subtitle Downloads": "Descargas de subtítulos",
  "Default language": "Idioma predeterminado",
  "Desktop Notifications": "Notificaciones de escritorio",
  "Control which events trigger a desktop notification.":
    "Controla qué eventos generan una notificación.",
  "Notify when a download completes": "Notificar al completarse una descarga",
  "Notify about new episodes on startup": "Notificar nuevos episodios al iniciar",
  "Enable Discord Rich Presence": "Activar Discord Rich Presence",
  "Show cover art": "Mostrar carátula",
  "Show elapsed time": "Mostrar tiempo transcurrido",
  "Show source button": "Mostrar botón de fuente",

  // ── shields stats modal ────────────────────────────────────────────────────
  "Ads & Trackers Blocked": "Anuncios y rastreadores bloqueados",
  "No ads or trackers blocked yet, play something to start.":
    "Aún no hay anuncios ni rastreadores bloqueados, reproduce algo para empezar.",
  "All-time:\u00A0": "En total:\u00A0",
  "\u00A0blocked": "\u00A0bloqueados",

  // ── download modal ─────────────────────────────────────────────────────────
  "Get stream link": "Obtener enlace del stream",
  "Open in new tab": "Abrir en pestaña nueva",
  "Waiting for stream URL…": "Esperando la URL del stream…",
  "Want a local file?": "¿Quieres un archivo local?",
  "Use": "Usa",
  "or": "o",
  "Browsers cannot save these streams directly. Use a tool like":
    "Los navegadores no pueden guardar estos streams directamente. Usa una herramienta como",
  "Download file": "Descargar archivo",

  // ── close confirm modal ────────────────────────────────────────────────────
  "Keep Downloading": "Seguir descargando",
  "Cancel & Close App": "Cancelar y cerrar la app",

  // ── error boundary ─────────────────────────────────────────────────────────
  "SOMETHING WENT WRONG": "ALGO SALIÓ MAL",
  "Reload App": "Recargar la app",

  // ── keyboard shortcuts ─────────────────────────────────────────────────────
  "KEYBOARD SHORTCUTS": "ATAJOS DE TECLADO",
  "Controller": "Mando",
  "Press": "Pulsa",
  "to focus the player controls.": "para centrarte en los controles del reproductor.",

  // ── update modal ───────────────────────────────────────────────────────────
  "UPDATE AVAILABLE": "ACTUALIZACIÓN DISPONIBLE",
  "What's New": "Qué hay de nuevo",
  "No changelog available.": "No hay registro de cambios disponible.",
  "Download manually ↗": "Descargar manualmente ↗",
  "✓ Update downloaded, installer is running": "✓ Actualización descargada, el instalador se está ejecutando",

  // ── setup screen ───────────────────────────────────────────────────────────
  "Enter your": "Introduce tu",
  "free": "gratis",
  "Read Access Token": "Token de acceso de lectura",
  "to get started.": "para empezar.",
  "API Read Access Token": "Token de acceso de lectura de la API",
  "(the long JWT, not the shorter API Key below).": "(el JWT largo, no la clave de API más corta de abajo).",
  "Step-by-step guide on how to get that Token": "Guía paso a paso para conseguir ese token",
  "Checking…": "Comprobando…",
  "Let's go": "Vamos",
  "Skip for now": "Omitir por ahora",
  "Paste your TMDB Read Access Token (eyJ...)...": "Pega tu token de acceso de lectura de TMDB (eyJ...)...",

  // ── subtitles modal ────────────────────────────────────────────────────────
  "Downloaded subtitles": "Subtítulos descargados",
  "Download more:": "Descargar más:",
  "All languages": "Todos los idiomas",
  "No subtitle API key set.": "No hay clave de API de subtítulos configurada.",
  "Open Settings → Subtitles": "Abrir Ajustes → Subtítulos",
  "No subtitles found for this language": "No se encontraron subtítulos en este idioma",
  "already downloaded": "ya descargado",
  "✓ Subtitles downloaded!": "✓ ¡Subtítulos descargados!",
  "No file path, needs completed download": "Sin ruta de archivo, requiere descarga completada",
  "Delete this subtitle file": "Eliminar este archivo de subtítulos",
  "HI": "HI",
  "AI": "AI",

  // ── wyzie key modal ────────────────────────────────────────────────────────
  "Wyzie Subs requires an API key": "Wyzie Subs necesita una clave de API",
  "Free, no account required": "Gratis, sin necesidad de cuenta",
  "Get free key — opens redeem page": "Obtén una clave gratis — abre la página de canje",
  "I already have a key — enter manually": "Ya tengo una clave — introdúcela manualmente",
  "Skip — use without subtitles": "Omitir — usar sin subtítulos",
  "Confirm & validate": "Confirmar y validar",
  "Complete the captcha in the popup window": "Completa el captcha en la ventana emergente",
  "Please wait — key will be saved automatically…": "Espera — la clave se guardará automáticamente…",
  "Validating key…": "Validando la clave…",
  "API key saved! Loading subtitles…": "¡Clave guardada! Cargando subtítulos…",
  "No key received within 10 seconds.": "No se recibió ninguna clave en 10 segundos.",
  "The captcha may not have been completed, or the redirect failed.":
    "Puede que no hayas completado el captcha o que haya fallado la redirección.",
  "Try again": "Probar de nuevo",
  "Enter key manually": "Introducir la clave manualmente",
  "Skip": "Omitir",
  "Removed this file": "Archivo eliminado",

  // ── misc toasts / helper strings seen across pages ─────────────────────────
  "Removed": "Eliminado",
  "Watching": "Viendo",
  "Resume": "Reanudar",
  "Watch": "Ver",
  "Play": "Reproducir",
  "Reset": "Restablecer",
  "Active": "Activo",
  "completed": "completado",
  "downloading": "descargando",

  // ── everything else: options, labels, fragments seen in the live DOM ───────
  "New episodes available": "Hay nuevos episodios disponibles",
  "New episode available": "Hay un nuevo episodio disponible",
  "Left Side": "Lado izquierdo",
  "Right Side": "Lado derecho",
  "United States (MPAA / TV Parental)": "Estados Unidos (MPAA / TV Parental)",
  "Carousel": "Carrusel",
  "Grid": "Cuadrícula",
  "Scrollable spotlight with featured poster":
    "Foco principal desplazable con póster destacado",
  "Scrollable spotlight": "Foco principal desplazable",
  "Spotlight": "Foco principal",
  "Compact grid of all items": "Cuadrícula compacta de todos los títulos",
  "Compact": "Compacta",
  "Name (A-Z)": "Nombre (A-Z)",
  "Name": "Nombre",
  "Size": "Tamaño",
  "Progress": "Progreso",
  "Recently Added": "Añadidos recientemente",
  "Last Watched": "Visto por última vez",
  "Most Watched": "Más vistos",
  "Downloaded": "Descargado",
  "Newest first": "Más recientes primero",
  "Oldest first": "Más antiguos primero",
  "% Complete": "% Completado",
  "Show all": "Ver todo",
  "Show less": "Ver menos",
  "Seasons": "Temporadas",
  "Runtime": "Duración",
  "Released": "Estreno",
  "First air date": "Primera emisión",
  "Director": "Director",
  "Cast": "Reparto",
  "Genres": "Géneros",
  "Genre": "Género",
  "Status": "Estado",
  "Returning Series": "Serie en emisión",
  "Ended": "Finalizada",
  "In Production": "En producción",
  "Canceled": "Cancelada",
  "Planned": "Planificada",
  "Overview": "Resumen",
  "Tagline": "Eslogan",
  "Language": "Idioma",
  "Original Language": "Idioma original",
  "Most Popular": "Más populares",
  "Popular": "Populares",
  "Add to Watchlist": "Añadir a la lista",
  "Added to Watchlist": "Añadido a la lista",
  "Remove from Watchlist": "Quitar de la lista",
  "Watchlist": "Lista",
  "Copy link": "Copiar enlace",
  "Next episode in": "Siguiente episodio en",
  "of": "de",
  "minutes": "minutos",
  "min": "min",
  "hour": "hora",
  "hours": "horas",
  "Today": "Hoy",
  "Yesterday": "Ayer",
  "Upcoming": "Próximamente",
  "Now Playing": "En cartelera",
  "Offline": "Sin conexión",
  "Go Back": "Volver",
  "Go back": "Volver",
  "Skip Intro": "Omitir intro",
  "Skip Recap": "Omitir resumen",
  "Continue": "Continuar",
  "Pause": "Pausa",
  "Mute": "Silenciar",
  "Unmute": "Activar sonido",
  "Fullscreen": "Pantalla completa",
  "Exit Fullscreen": "Salir de pantalla completa",
  "Playback Speed": "Velocidad de reproducción",
  "Subtitles Off": "Subtítulos desactivados",
  "Settings & Privacy": "Ajustes y privacidad",
  "Network": "Red",
  "Appearance settings": "Ajustes de apariencia",
  "Language…": "Idioma…",
  "Report Dictionary": "Diccionario de datos",
  "Session": "Sesión",
  "Sign out": "Cerrar sesión",
  "Signed in": "Has iniciado sesión",
  "Support": "Soporte",
  "About": "Acerca de",
  "FAQ": "Preguntas frecuentes",
  "Give feedback": "Enviar comentarios",
  "Keyboard Shortcuts": "Atajos de teclado",
  "Open log folder": "Abrir carpeta de registros",
  "Show Downloads": "Mostrar descargas",
  "Cancel download": "Cancelar descarga",
  "Pause download": "Pausar descarga",
  "Resume download": "Reanudar descarga",
  "Retry download": "Reintentar descarga",
  "Clear": "Limpiar",
  "All": "Todo",
  "Movies": "Películas",
  "Episodes": "Episodios",
  "Results": "Resultados",
  "results": "resultados",
  "for": "para",
  "Search results": "Resultados de búsqueda",
  "No results found": "No se encontraron resultados",
  "Nothing found": "No se encontró nada",
  "Try a different search.": "Prueba otra búsqueda.",
  "Switch to English": "Cambiar a inglés",
  "Language of the app": "Idioma de la app",
  "Play All": "Reproducir todo",
  "Continue watching": "Continuar viendo",
  "Start over": "Empezar de nuevo",
  "Restart episode": "Reiniciar episodio",
  "Resume from": "Reanudar desde",
  "remaining": "restante",
  "left": "restante",
  "Loading subtitles…": "Cargando subtítulos…",
  "Audio": "Audio",
  "Video": "Vídeo",
  "Quality": "Calidad",
  "Auto": "Automático",
  "Default": "Predeterminado",
  "Original": "Original",
  "s": "",
  "in": "en",
  "App version, updates and Languages": "Versión de la app, actualizaciones e idiomas",
  "Parental controls and content filtering by age rating":
    "Controles parentales y filtrado de contenido por clasificación de edad",
  "Set a maximum age rating. Content rated above this age will still be visible but":
    "Establece una clasificación de edad máxima. El contenido con clasificación superior seguirá siendo visible, pero",
  "Set to": "Ajustado a",
  "Playing, auto-watched and skip behavior":
    "Comportamiento de reproducción, visto automático y omisión",
  "A movie or episode is automatically marked as":
    "Una película o episodio se marca automáticamente como",
  "when the remaining time drops to this value or below. Set between 1 and 300 seconds.":
    "cuando el tiempo restante llega a este valor o menos. Ajusta entre 1 y 300 segundos.",
  "Choose which side of the player the next episode thumbnail and details are shown.":
    "Elige en qué lado del reproductor se muestran la miniatura y los detalles del siguiente episodio.",
  "Preferred subtitle language for video downloads":
    "Idioma de subtítulos preferido para las descargas de vídeo",
  "Auto-download subtitles when downloading videos":
    "Descargar subtítulos automáticamente al descargar vídeos",
  "Desktop alerts for downloads and new episode releases":
    "Alertas de escritorio para descargas y nuevos episodios",
  "Shows a desktop notification when an item finishes downloading.":
    "Muestra una notificación de escritorio cuando una descarga finaliza.",
  "Home layout, start page, appearance, and display options":
    "Diseño de inicio, página de arranque, apariencia y opciones de visualización",
  "Default dark theme": "Tema oscuro predeterminado",
  ", applied to buttons, highlights, and indicators.":
    ", aplicado a botones, destacados e indicadores.",
  "Watchlist sort order and watch history preferences":
    "Orden de la lista y preferencias del historial",
  "Custom order": "Orden personalizado",
  "When off, nothing you watch will be added to history or \"Continue Watching\".":
    "Si está desactivado, nada de lo que veas se añadirá al historial ni a \"Continuar viendo\".",
  "Block ads, trackers and fingerprinting — Brave Shields on the web":
    "Bloquea anuncios, rastreadores y la toma de huella: los Escudos de Brave en la web",
  "Forces http:// links to their secure https:// version when available. 0 upgraded so far.":
    "Fuerza que los enlaces http:// usen su versión segura https:// cuando esté disponible. 0 actualizados hasta ahora.",
  "Refuses cookies on cross-site requests made from this page.":
    "Rechaza cookies en peticiones entre sitios hechas desde esta página.",
  "engine loading": "motor cargando",
  "Update lists": "Actualizar listas",
  "Clear cache, watch progress, downloads, or reset the entire app":
    "Borra la caché, el progreso, las descargas o restablece toda la app",
  "Opens the folder where WatchAlong is installed.":
    "Abre la carpeta donde está instalado WatchAlong.",
  "Open Folder": "Abrir carpeta",
  "Clear Progress": "Limpiar progreso",
  "Reset App": "Restablecer la app",
  "No active downloads": "No hay descargas activas",
  "No local files yet. Scan a folder or start a download.":
    "Aún no hay archivos locales. Escanea una carpeta o inicia una descarga.",
  "Date": "Fecha",
  "Type": "Tipo",
  "Untracked": "Sin registrar",
  "Small": "Pequeño",
  "Large": "Grande",
  "Font": "Fuente",
  "Hardware Concurrency": "Núcleos del procesador",
  "Screen": "Pantalla",
  "User Agent": "Agente de usuario",
  "Downloading…": "Descargando…",
  "Preparing download…": "Preparando la descarga…",
  "Fetching stream…": "Obteniendo el stream…",
  "Filename": "Nombre de archivo",
  "Next Episode": "Siguiente episodio",
  "Recently watched": "Visto recientemente",
  "Applies the selected accent colour to the streaming player when supported.":
    "Aplica el color de acento seleccionado al reproductor cuando sea compatible.",
  "Similar Titles": "Títulos similares",
  "More Like This": "Más como esto",
  "Related": "Relacionados",
  "Recommended": "Recomendados",
  "Your Next Watch": "Tu próxima película",
  "Plot": "Argumento",
  "Overview:": "Resumen:",
  "HD": "HD",
  "4K": "4K",
  "Auto-play": "Reproducción automática",
  "Play in fullscreen": "Reproducir a pantalla completa",
  "Picture-in-Picture": "Imagen en imagen",
  "Speed": "Velocidad",
  "Subtitle Size": "Tamaño de subtítulos",
  "Text Color": "Color del texto",
  "Text Outline": "Contorno del texto",
  "Subtitle position": "Posición de subtítulos",
};

// Dynamic patterns where the number must survive translation.
const PATTERNS = [
  [/^Season\s*(.*)$/i, (m) => `Temporada ${m[1]}`.replace(/\s+$/, "")],
  [/^Episode\s*(.*)$/i, (m) => `Episodio ${m[1]}`.replace(/\s+$/, "")],
];

// ── phrase stitching ──────────────────────────────────────────────────────────
// Besides exact matches, translate() can rebuild a string out of consecutive
// known phrases (mixed with numbers / symbols / whitespace). It only rewrites
// when the WHOLE string is covered, so TMDB content or English data that isn't
// fully translatable is always left untouched.
let _segSource = null;
let _segCache = null;

function segs() {
  if (_segSource === ES) return _segCache;
  _segSource = ES;
  _segCache = Object.keys(ES)
    .filter((k) => ES[k] !== k && k.trim().length >= 2)
    .sort((a, b) => b.length - a.length)
    .map((k) => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const end = /[A-Za-z]$/.test(k) ? "\\b" : "";
      return { re: new RegExp("^" + esc + end, "i"), es: ES[k] };
    });
  return _segCache;
}

function translateSmart(key) {
  const out = [];
  let rest = key;
  let usedTranslation = false;
  for (let guard = 0; guard < 16 && rest; guard++) {
    const sym = rest.match(/^[^\p{L}\p{N}]/u);
    if (sym) {
      out.push(sym[0]);
      rest = rest.slice(sym[0].length);
      continue;
    }
    const num = rest.match(/^\d+(?:[.,]\d+)?/);
    if (num) {
      out.push(num[0]);
      rest = rest.slice(num[0].length);
      continue;
    }
    let hit = false;
    for (const { re, es } of segs()) {
      const m = rest.match(re);
      if (!m) continue;
      out.push(es);
      if (es !== m[0]) usedTranslation = true;
      rest = rest.slice(m[0].length);
      hit = true;
      break;
    }
    if (!hit) return null;
  }
  if (rest || !usedTranslation) return null;
  const joined = out.join("");
  return joined === key ? null : joined;
}

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEXTAREA",
  "INPUT",
  "NOSCRIPT",
  "CODE",
  "KBD",
  "IFRAME",
  "SELECT",
]);

export function isSpanish() {
  try {
    return (window.location.pathname.split("/")[1] || "").toLowerCase() === "es";
  } catch {
    return false;
  }
}

export function translate(s) {
  if (!s) return s;
  const key = s.trim().replace(/&nbsp;/g, "\u00A0");
  if (ES[key] != null && ES[key] !== key) return ES[key];
  for (const [re, fn] of PATTERNS) {
    const m = key.match(re);
    if (m) {
      const out = fn(m);
      if (out !== key) return out;
    }
  }
  return translateSmart(key);
}

export function t(s) {
  if (!isSpanish()) return s;
  return translate(s) ?? s;
}

function translateNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const parent = node.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return;
  if (parent.dataset && parent.dataset.noI18n) return;
  const v = node.nodeValue;
  const out = translate(v);
  if (out == null || out === v.trim()) return;
  const lead = v.slice(0, v.length - v.trimStart().length);
  const trail = v.slice(v.trimEnd().length);
  node.nodeValue = lead + out + trail;
}

const ATTRS = ["placeholder", "aria-label", "title", "alt"];

function translateAttrs(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.dataset && node.dataset.noI18n) return;
  for (const a of ATTRS) {
    if (!node.hasAttribute(a)) continue;
    const v = node.getAttribute(a);
    const out = translate(v);
    if (out == null || out === v) continue;
    node.setAttribute(a, out);
  }
}

let observer = null;

function sweep(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) translateNode(n);
    else translateAttrs(n);
  }
}

// Translate an entire added subtree (text nodes + element attributes).
function translateSubtree(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) translateNode(n);
    else translateAttrs(n);
  }
}

const sweepTimers = [];

function scheduleSweep() {
  if (document.readyState !== "complete") {
    const h = () => {
      sweep(document.body);
      window.removeEventListener("load", h);
    };
    window.addEventListener("load", h);
    return;
  }
  // Late-added React subtrees sometimes bypass the observer callback;
  // run a few trailing sweeps to catch them.
  const fire = () => {
    if (isSpanish()) sweep(document.body);
    sweepTimers.shift();
  };
  for (const delay of [400, 1200, 3000]) {
    const t = setTimeout(fire, delay);
    sweepTimers.push(t);
  }
}

export function enableSpanishTranslator() {
  if (observer || !isSpanish()) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes") {
        translateAttrs(m.target);
        continue;
      }
      if (m.type === "characterData") {
        translateNode(m.target);
        continue;
      }
      for (const added of m.addedNodes) {
        if (added.nodeType === Node.TEXT_NODE) translateNode(added);
        else if (added.nodeType === Node.ELEMENT_NODE) translateSubtree(added);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  sweep(document.body);
  scheduleSweep();
}

export function disableSpanishTranslator() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  for (const t of sweepTimers) clearTimeout(t);
  sweepTimers.length = 0;
}

export function syncSpanishTranslator() {
  if (isSpanish()) enableSpanishTranslator();
  else disableSpanishTranslator();
}