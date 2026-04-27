# Changelog

Todos los cambios notables serán documentados en este archivo.

## [0.2.3] - 2026-04-27

- Agregado estilo de identidad por rol en los nombres de usuario, con badge y gradiente propios para `owner` y `uploader`.
- Los estilos de rol ahora tienen prioridad sobre los badges y gradientes de Patreon cuando el usuario tiene un rol destacado.
- La API de perfiles y usuarios recientes ahora devuelve `role`, `roleBadge` y `roleGradient` para renderizar la identidad de usuario de forma consistente.
- La lista de usuarios recientes ahora se ordena por rol, luego por tier de Patreon de mayor a menor, y finalmente por usuarios comunes.
- La seccion "Juegos de la Semana" ahora combina selecciones manuales obligatorias con juegos destacados automaticamente por vistas y recencia, hasta un maximo de 7.

## [0.2.2] - 2026-04-27

- Agregada edicion de comentarios para owners, incluyendo dialogo de edicion y almacenamiento de fecha de edicion.
- Corregido el listado de resenas del perfil para que las resenas no lleven a la pagina del post.
- Corregida la seleccion de prompts de engagement para incluir correctamente todas las fuentes disponibles.
- Agregadas pruebas para validar el comportamiento de seleccion de prompts de engagement.

## [0.2.1] - 2026-04-26

- Agregada paginacion a las busquedas de juegos, comics y la busqueda unificada.
- Actualizada la API de busqueda para devolver resultados paginados con metadatos de pagina y total.
- Mejorados los controles de paginacion usando los componentes de paginacion del sistema de UI.

## [0.2.0] - 2026-04-26

- Rediseñadas las páginas de catálogo de juegos y cómics con una experiencia visual y de exploración más completa.
- Rediseñada la página de lectura de cómics con mejoras de presentación y navegación.
- Agregada una página de guías para reseñas y enlaces desde el sitio.
- Las calificaciones ahora requieren texto de reseña para fomentar opiniones más útiles.
- Mejorada la experiencia visual de las páginas informativas.

## [0.1.1] - 2026-04-26

- Agregado permiso `ratelimit: ["bypass"]` a `owner` para evadir ratelimits.
- Reducidos limites de tamaño mínimo para avatars (128x128 -> 64x64) y banners (640x160 -> 128x64).
- Ajustada relación de aspecto de imágenes de portada a 16:9 en todos los dispositivos. Se recomienda re-subir las portadas antiguas con relación de aspecto 21:9.
- Agregada compresión de imágenes en diálogo de "media" previo a la subida del post.

## [0.1.0] - 2026-04-25

- Las cuentas baneadas ahora son ignoradas en contenido y métricas públicas, incluyendo comentarios, reseñas, likes y favoritos.
- Agregada una nueva página de registro de cambios para administradores, renderizada a partir de este archivo.
