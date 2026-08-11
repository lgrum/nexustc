# Activaci&oacute;n de Account XP y Eteris

La activaci&oacute;n de producci&oacute;n est&aacute; bloqueada. `XP_ECONOMY_ENABLED`,
`XP_ACCRUAL_ENABLED` y `ETERIS_SPENDING_ENABLED` deben permanecer apagadas por
defecto durante el despliegue y la verificaci&oacute;n previa al lanzamiento.

No se pueden habilitar hasta que exista un sumidero de Eteris de producci&oacute;n
especificado por separado, sus precios hayan sido revisados contra la emisi&oacute;n
esperada de niveles y Patreon, y el informe diario se haya ejercitado con datos
representativos. Este cambio no agrega ni aprueba ese sumidero.

Los intervalos con acumulaci&oacute;n deshabilitada y los meses VIP perdidos no se
reprocesan. La primera solicitud admitida despu&eacute;s de habilitar la acumulaci&oacute;n
registra la activaci&oacute;n y parte de nivel 1, 0 Account XP y 0 Eteris, sin concesi&oacute;n
hist&oacute;rica masiva.

## Racha diaria

`DAILY_STREAK_ENABLED` tambi&eacute;n permanece apagada por defecto. La Racha solo
est&aacute; disponible cuando `XP_ECONOMY_ENABLED`, `XP_ACCRUAL_ENABLED` y
`DAILY_STREAK_ENABLED` est&aacute;n habilitadas y `progression_system.activated_at`
ya existe. Las acciones anteriores a esa activaci&oacute;n no crean estado, cola ni
recompensas y no se reprocesan.

Despu&eacute;s del lanzamiento, antes de pausar la acumulaci&oacute;n o la Racha, el
operador debe declarar el intervalo protegido auditado que cubra la pausa y su
recuperaci&oacute;n. Al reanudar, el d&iacute;a parcial solo conserva continuidad: la
primera recompensa posible corresponde al siguiente d&iacute;a local completo.

La declaraci&oacute;n se realiza mediante la operaci&oacute;n de propietario
`streak.declareProtectionWindow`, antes de cambiar las banderas, con un motivo
y un intervalo UTC semiabierto `[inicio, fin)`. El intervalo de tipo `pause`
debe incluir el margen de recuperaci&oacute;n necesario para cubrir los vencimientos
locales del d&iacute;a de reanudaci&oacute;n. Estas pausas no crean progreso, XP, cola ni
reprocesamiento; solo preservan la continuidad cuando el vencimiento local de
un d&iacute;a incompleto cae dentro del intervalo declarado.
