const SPANISH_UTC_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** Stable across server rendering and hydration for date-only collectible UI. */
export function formatCollectibleDate(value: Date | string) {
  return SPANISH_UTC_DATE_FORMATTER.format(
    value instanceof Date ? value : new Date(value)
  );
}
