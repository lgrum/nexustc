const SPANISH_UTC_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const SPANISH_UTC_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Stable across server rendering and hydration for date-only collectible UI. */
export function formatCollectibleDate(value: Date | string) {
  return SPANISH_UTC_DATE_FORMATTER.format(
    value instanceof Date ? value : new Date(value)
  );
}

/**
 * Same hydration-stable contract as {@link formatCollectibleDate} for expiry
 * and availability moments where the UTC hour matters to the user.
 */
export function formatCollectibleDateTime(value: Date | string) {
  return SPANISH_UTC_DATE_TIME_FORMATTER.format(
    value instanceof Date ? value : new Date(value)
  );
}
