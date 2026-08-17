# Operaciones de coleccionables

La consola administrativa usa `collectible_admin_action` como historial
append-only. Cada acción sensible conserva actor, fecha, motivo, versión
esperada, clave de idempotencia y snapshots privados antes/después. Los
enlaces a activos, ofertas y movimientos Eteris usan FKs restrictivas; un
cursor de `(created_at, id)` evita paginación inestable.

Las congelaciones son ortogonales a la propiedad: preservan el propietario y
el Mint Number y reciben una decisión explícita de custodiar o liberar. Al
liberar una custodia retenida por un Mercado, intercambio o regalo, el padre se
cierra administrativamente en la misma transacción para no dejar una oferta
activa sin reserva.

Las correcciones excepcionales requieren `collectibles:correct`, un actor
propietario real, motivo y versión. La emisión sigue validando el techo de
suministro. Una transferencia de propiedad y una reversión Eteris son
comandos independientes con auditorías enlazadas; una reversión solo acepta
movimientos de comercio con una falla de plataforma verificada y nunca reescribe
la propiedad.

Los informes agregados de `getCollectibleOperationalMetrics` cubren
congelamientos/restauraciones, correcciones, grants, reversiones, agotamiento
de revisiones, deriva de cuota, edad de custodia, liquidaciones fallidas,
renderizado y cola de notificaciones/caducidades. No incluyen cuentas, claves
de idempotencia, identificadores de activos ni resultados de Packs no abiertos.
