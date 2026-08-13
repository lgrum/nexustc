# Verificaci&oacute;n previa de Profile Customization

## Estado de la compuerta

`PROFILE_CUSTOMIZATION_ENABLED` debe permanecer en `false` durante el
despliegue inicial. La compuerta de lanzamiento est&aacute; **cerrada** hasta que
un propietario o responsable del despliegue revise la evidencia automatizada,
complete todas las comprobaciones manuales de este documento y registre su
aprobaci&oacute;n.

Esta compuerta pertenece al proceso de lanzamiento; no es una restricci&oacute;n
de runtime. Una persona autorizada puede cambiar la variable de entorno, por
lo que el control operativo y la revisi&oacute;n siguen siendo obligatorios.

## Evidencia automatizada requerida

Ejecutar desde la ra&iacute;z y adjuntar el log del despliegue candidato:

| Orden | Comando                                                                          | Resultado requerido                                                          |
| ----: | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
|     1 | Pruebas enfocadas de shared/API/cat&aacute;logo/ledger/showcases                 | Todas pasan                                                                  |
|     2 | Pruebas enfocadas del editor, renderer p&uacute;blico, cach&eacute; y boundaries | Todas pasan                                                                  |
|     3 | `bun run --cwd packages/db test -- src/migrations/migrations.test.ts`            | Mapeo exacto, sin backfill de cuentas y FKs correctas                        |
|     4 | `bun run check-types`                                                            | Pasa                                                                         |
|     5 | `bun run test`                                                                   | Pasa                                                                         |
|     6 | `bun run web:build`                                                              | Pasa con el entorno de producci&oacute;n candidato                           |
|     7 | `bun run check`                                                                  | Pasa; revisar sus cambios autom&aacute;ticos y repetir las pruebas afectadas |

La cobertura automatizada debe demostrar, como m&iacute;nimo:

- Default virtual sin escrituras, primera publicaci&oacute;n at&oacute;mica y conflicto
  de revisi&oacute;n;
- seis Showcases, Stack/Grid/Spotlight, Skin y Decorations, selecci&oacute;n
  guardada frente a configuraci&oacute;n efectiva, p&eacute;rdida/restauraci&oacute;n VIP y
  compra permanente;
- publicaci&oacute;n, retiro, deshabilitaci&oacute;n, restauraci&oacute;n, rollback,
  grant/revoke y correcci&oacute;n auditada del cat&aacute;logo;
- rechazo de save, purchase y cambios de visibilidad durante suplantaci&oacute;n;
- cach&eacute; p&uacute;blica limitada a datos p&uacute;blicos resueltos, estado de editor y
  propietario request-bound, e invalidaci&oacute;n inmediata de mutaciones;
- aislamiento de fuentes: una fuente fallida se omite, una configuraci&oacute;n
  efectiva fallida no expone datos, y las secciones no relacionadas siguen
  funcionando;
- orden sem&aacute;ntico &uacute;nico, alternativas de teclado al drag, retenci&oacute;n de
  foco, asociaci&oacute;n de errores, contraste, estilos acotados y reduced motion.

## Recorrido manual con la bandera encendida

Realizar en un entorno candidato aislado con datos representativos. Registrar
capturas o video, navegador/dispositivo, cuenta de prueba y resultado para cada
punto.

- [ ] Cuenta nunca personalizada: aparece el Default virtual sin crear filas;
      Library/Reviews/Streak/Eteris reflejan las preferencias can&oacute;nicas.
- [ ] Editor desktop: borrador, preview sticky, cambio de ancho, advertencia al
      salir, reset confirmado y publicaci&oacute;n at&oacute;mica.
- [ ] Editor mobile: modos **Editar**/**Vista previa**, sin overflow horizontal
      ni controles ocultos.
- [ ] Stack, Grid y Spotlight conservan el mismo orden; Spotlight promueve el
      primer Showcase renderizable y Grid colapsa correctamente.
- [ ] Library, Reviews, Favorite Games, XP, Streak y Eteris muestran solo los
      campos p&uacute;blicos aprobados; vac&iacute;os, privados o fallidos no ocupan espacio.
- [ ] Teclado solamente: se recorren todos los controles, el foco es visible,
      los botones mueven y quitan elementos sin depender de drag, y el foco queda
      en una acci&oacute;n &uacute;til despu&eacute;s del cambio.
- [ ] Lector de pantalla representativo: `main`, regiones, headings, nombres de
      controles, estados selected/locked/pressed, errores y orden de lectura son
      comprensibles.
- [ ] Zoom del navegador al 320% en viewport desktop y viewport de 320 CSS px:
      lectura y acciones completas sin desplazamiento bidimensional.
- [ ] `prefers-reduced-motion: reduce`: los efectos usan fallback est&aacute;tico o se
      omiten; la selecci&oacute;n guardada no cambia.
- [ ] Skin y cada slot de Decoration se previsualizan sin cambiar App Theme,
      navegaci&oacute;n global, di&aacute;logos, foco ni badges de identidad protegidos.
- [ ] Item bloqueado: preview permitido y save rechazado; compra confirma precio
      exacto, descuenta una vez, no equipa hasta guardar y conserva propiedad al
      abandonar el borrador.
- [ ] Downgrade VIP: layout/skin vuelven al default efectivo, Decorations y
      Showcases no elegibles se omiten y Favorite Games usa el prefijo permitido;
      restaurar VIP recupera la selecci&oacute;n sin escritura.
- [ ] Owner: publicar y operar el ciclo de vida propaga el cambio; disable
      global retira el item inmediatamente y restore/rollback respeta historial.
- [ ] Suplantaci&oacute;n: save, reset-publication, purchase, gasto y cambios de
      visibilidad fallan; la correcci&oacute;n owner normal queda expl&iacute;cita y auditada.
- [ ] Cach&eacute;: save, purchase, grant/revoke, correction, cat&aacute;logo, Patreon,
      rol/identidad y visibilidad de fuentes aparecen frescos en una sesi&oacute;n
      an&oacute;nima ya abierta.
- [ ] Fallos inducidos independientes de Library, Reviews, XP, Streak y Eteris
      no muestran datos privados/stale ni derriban Profile Shell u otros Showcases.

## Verificaci&oacute;n con la bandera apagada y rollback

- [ ] Con `PROFILE_CUSTOMIZATION_ENABLED=false`, el perfil y los controles
      legacy funcionan sin manifest/editor/purchase de Profile Customization.
- [ ] Las configuraciones, selecciones, ownerships, compras, revisiones y
      auditor&iacute;a ya guardadas permanecen intactas.
- [ ] Volver a encender recupera la selecci&oacute;n guardada y vuelve a resolver la
      elegibilidad actual; no se ejecuta backfill ni dual write.

El rollback mediante la bandera restaura temporalmente el renderer y los
controles legacy. Puede mostrar preferencias legacy anteriores porque el
sistema no sincroniza ambas arquitecturas en paralelo. No revierte compras ni
movimientos Eteris, no borra configuraciones y no deshace publicaciones de
cat&aacute;logo. Si el incidente corresponde a un item, usar primero el disable
global del cat&aacute;logo; reservar la bandera para retirar la experiencia completa.

## Aprobaci&oacute;n

- Candidato/commit:
- Entorno y fecha:
- Evidencia automatizada:
- Evidencia manual:
- Incidencias aceptadas o bloqueantes:
- Propietario/revisor:
- Responsable del despliegue:
- Decisi&oacute;n: [ ] habilitar / [ ] mantener apagado

Solo despu&eacute;s de esta aprobaci&oacute;n se cambia la variable en el entorno elegido.
`ETERIS_SPENDING_ENABLED` sigue siendo una compuerta independiente y la
personalizaci&oacute;n no autoriza gasto por s&iacute; sola.

Tras una ventana estable y aprobaci&oacute;n operativa, continuar con el seguimiento
separado `.scratch/profile-customization-post-stability-cleanup.md`. Ese trabajo
retirar&aacute; el renderer y controles legacy y la bandera temporal; no forma parte
de esta habilitaci&oacute;n previa.
