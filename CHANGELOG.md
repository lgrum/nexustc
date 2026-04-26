# Changelog

Todos los cambios notables serán documentados en este archivo.

## [0.1.1] - 2026-04-26

- Agregado permiso `ratelimit: ["bypass"]` a `owner` para evadir ratelimits.
- Reducidos limites de tamaño mínimo para avatars (128x128 -> 64x64) y banners (640x160 -> 128x64).
- Ajustada relación de aspecto de imágenes de portada a 16:9 en todos los dispositivos. Se recomienda re-subir las portadas antiguas con relación de aspecto 21:9.

## [0.1.0] - 2026-04-25

- Las cuentas baneadas ahora son ignoradas en contenido y métricas públicas, incluyendo comentarios, reseñas, likes y favoritos.
- Agregada una nueva página de registro de cambios para administradores, renderizada a partir de este archivo.
