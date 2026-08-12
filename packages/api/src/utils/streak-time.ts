type LocalDateParts = {
  day: number;
  month: number;
  year: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string) {
  const cached = formatterCache.get(timezone);
  if (cached) {
    return cached;
  }
  const candidate = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const canonicalTimezone = candidate.resolvedOptions().timeZone;
  const formatter = formatterCache.get(canonicalTimezone);
  if (formatter) {
    return formatter;
  }
  formatterCache.set(canonicalTimezone, candidate);
  return candidate;
}

function getLocalParts(instant: Date, timezone: string) {
  const parts = Object.fromEntries(
    getFormatter(timezone)
      .formatToParts(instant)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)])
  ) as Record<string, number>;
  return {
    day: parts.day!,
    hour: parts.hour === 24 ? 0 : parts.hour!,
    minute: parts.minute!,
    month: parts.month!,
    second: parts.second!,
    year: parts.year!,
  };
}

function localMidnightToUtc(date: LocalDateParts, timezone: string) {
  const target = Date.UTC(date.year, date.month - 1, date.day);
  const searchWindow = 48 * 60 * 60_000;
  let lower = target - searchWindow;
  let upper = target + searchWindow;

  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const local = getLocalParts(new Date(middle), timezone);
    const localDate = Date.UTC(local.year, local.month - 1, local.day);
    if (localDate < target) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }

  return new Date(lower);
}

function addLocalDays(date: LocalDateParts, days: number): LocalDateParts {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    day: next.getUTCDate(),
    month: next.getUTCMonth() + 1,
    year: next.getUTCFullYear(),
  };
}

function formatLocalDate({ day, month, year }: LocalDateParts) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseLocalDate(localDate: string): LocalDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new RangeError("Fecha local invalida.");
  }
  const date = {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
  if (formatLocalDate(addLocalDays(date, 0)) !== localDate) {
    throw new RangeError("Fecha local invalida.");
  }
  return date;
}

export function isValidIanaTimezone(timezone: string) {
  return getCanonicalIanaTimezone(timezone) !== null;
}

export function getCanonicalIanaTimezone(timezone: string) {
  try {
    return getFormatter(timezone).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function getStreakDayPeriod(now: Date, timezone: string) {
  if (!isValidIanaTimezone(timezone)) {
    throw new RangeError("Zona horaria IANA invalida.");
  }

  const local = getLocalParts(now, timezone);
  const date = { day: local.day, month: local.month, year: local.year };
  return {
    endsAt: localMidnightToUtc(addLocalDays(date, 1), timezone),
    localDate: formatLocalDate(date),
    startsAt: localMidnightToUtc(date, timezone),
  };
}

export function getTimezoneChangeEffectiveAt(
  now: Date,
  currentTimezone: string,
  nextTimezone: string
) {
  const currentDayEndsAt = getStreakDayPeriod(now, currentTimezone).endsAt;
  const destinationDay = getStreakDayPeriod(currentDayEndsAt, nextTimezone);
  return destinationDay.startsAt.getTime() === currentDayEndsAt.getTime()
    ? currentDayEndsAt
    : destinationDay.endsAt;
}

export function getStreakDayPeriodForLocalDate(
  localDate: string,
  timezone: string
) {
  if (!isValidIanaTimezone(timezone)) {
    throw new RangeError("Zona horaria IANA invalida.");
  }
  const date = parseLocalDate(localDate);
  return {
    endsAt: localMidnightToUtc(addLocalDays(date, 1), timezone),
    localDate,
    startsAt: localMidnightToUtc(date, timezone),
  };
}

export function getNextLocalDate(localDate: string) {
  return formatLocalDate(addLocalDays(parseLocalDate(localDate), 1));
}

export function getPreviousLocalDate(localDate: string) {
  return formatLocalDate(addLocalDays(parseLocalDate(localDate), -1));
}
