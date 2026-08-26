# Activación simultánea de coleccionables

La activación de producción es una decisión operativa única. El código y los
despliegues mantienen `COLLECTIBLES_ENABLED=false` por defecto; no se debe
activar una tienda, un Gachapon, el Mercado, Packs, Cartas o Showcase de forma
aislada. La bandera de coleccionables se habilita únicamente después de
firmar esta lista y completar la revisión independiente de Eteris.

## Evidencia previa al lanzamiento

- [ ] Cada Card Template y Pack Revision que se publicará tiene configuración
      válida, una revisión publicada inmutable, variantes renderizadas, límites de
      suministro, binding y disponibilidad revisados.
- [ ] Las concesiones, ofertas de la tienda, máquinas, pesos, stock, límites
      por cuenta, fechas y precios de lanzamiento están calibrados y tienen dueño
      operativo. Las revisiones futuras se validan contra la regla de “última
      revisión publicada”.
- [ ] El sink de Eteris, precios, Listing Fee, límites de gasto y proyección de
      emisión fueron revisados con el equipo de economía. `XP_ECONOMY_ENABLED` y
      `ETERIS_SPENDING_ENABLED` siguen apagadas hasta que esa revisión termine.
- [ ] Se ejercitaron los límites de tasa para apertura, adquisición,
      intercambio, regalo, publicación, compra, moderación y reintentos de
      notificación en un entorno no productivo.
- [ ] Se verificó el cierre de cuenta: custodia, billetera opaca, historial,
      notificaciones y reconciliación quedan consistentes y no se reutiliza una
      identidad pública eliminada.
- [ ] Se revisaron los runbooks de corrección, congelamiento/restauración,
      reversión autorizada de Eteris, agotamiento, deadlock, fallo de render,
      expiración y apagado de emergencia.
- [ ] Se comprobó la accesibilidad de inventario, Packs, Mercado y perfil:
      teclado, touch, foco, etiquetas, alt text, movimiento reducido, seguridad
      frente a destellos, Skip/recovery, estados vacíos/carga/error en español y
      layouts responsive.

## Guardas y observabilidad

- [ ] Una comprobación con `COLLECTIBLES_ENABLED=false` confirma que todas las
      mutaciones rechazan de manera consistente, mientras los reads públicos y
      personalizados siguen siendo request-bound y disponibles.
- [ ] La matriz concurrente cubre apertura, intercambio, regalo, publicación,
      compra, congelamiento, expiración, cancelación y corrección del mismo asset:
      una sola custodia activa, un solo dueño/localización, historial append-only y
      respuesta replay estable.
- [ ] Los postings de Eteris se conservan en shop, Gachapon, Listing Fee,
      venta, reversión y corrección; un fallo intermedio deja settlement y supply
      sin cambios.
- [ ] El dashboard de operaciones muestra latencia de emisión, reintentos de
      deadlock/rollback, agotamiento de supply/revision, deriva de cupos, fallos
      de billetera, Listing Fee emitida/revertida, ventas, edad de custodia,
      expiraciones, backlog/fallos de notificación y render.
- [ ] La entrega de notificaciones ocurre después del commit, usa dedupe y
      tiene un retry seguro. El backlog se calcula a partir de eventos económicos
      comprometidos sin exponer owners, balances, ofertas privadas ni resultados
      de Packs.
- [ ] La expiración lazy y programada es idempotente, el cron exige su secreto,
      procesa lotes acotados, libera custodia, reintenta notificaciones y publica
      métricas agregadas.

## Verificación reproducible

Ejecutar desde la raíz del repositorio, en este orden:

```text
bun run --cwd packages/shared test -- src/collectibles.test.ts
bun run --cwd packages/db test -- src/migrations/migrations.test.ts
bun run --cwd packages/api test -- src/services/collectibles.test.ts src/services/gachapon-activation.test.ts src/services/economy-report.test.ts
bun run --cwd apps/web test -- src/app/port-boundaries.test.ts
bun run fmt:check
bun run lint
bun run check-types
bun run test
bun run web:build
```

No se copian valores de archivos `.env` en este documento. La habilitación de
producción, el cambio de secreto del cron y cualquier ajuste de precios son
acciones explícitas posteriores a la firma; un apagado de emergencia vuelve a
`COLLECTIBLES_ENABLED=false` y conserva las lecturas para recuperación y
auditoría.
