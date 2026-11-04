import { intlLocale } from "./i18n";
// Date helpers. All instants are stored as ISO UTC strings; display uses the user's timezone.
export const DEFAULT_TZ = "Asia/Seoul";

// Reuse expensive ICU formatters across calendar cells, rows and form keystrokes.
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    if (dateFormatters.size >= 64) dateFormatters.delete(dateFormatters.keys().next().value!);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/** YYYY-MM-DD for an instant in a given timezone. */
export function localDateOf(iso: string | Date, tz = DEFAULT_TZ): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return dateFormatter("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayLocal(tz = DEFAULT_TZ) {
  return localDateOf(new Date(), tz);
}

/**
 * Build an ISO instant from a local date + HH:mm in the timezone.
 * Repeated clocks use the earlier instant. Nonexistent clocks are rejected,
 * never silently moved to a different time. Use exactLocalInstant for inputs
 * that need a validation result rather than an exception.
 */
export function instantFromLocal(localDate: string, time: string, tz = DEFAULT_TZ): string {
  const [y = 0, m = 1, d = 1] = localDate.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const wallTime = (year: number, month: number, day: number, hour: number, minute: number) => {
    // Date.UTC treats years 0–99 as 1900–1999; retain the user's actual year.
    const value = new Date(0);
    value.setUTCFullYear(year, month - 1, day);
    value.setUTCHours(hour, minute, 0, 0);
    return value.getTime();
  };
  const guess = wallTime(y, m, d, hh, mm);
  const formatter = dateFormatter("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const localWallTime = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return wallTime(get("year"), get("month"), get("day"), get("hour"), get("minute"));
  };
  // The UTC guess can be on the opposite side of a clock change. Try both
  // surrounding offsets rather than trusting its offset for the desired clock.
  // Two days also covers full-day date-line transitions and UTC+14 zones.
  const offsets = new Set<number>();
  for (const days of [-2, -1, 0, 1, 2]) {
    const probe = guess + days * 86_400_000;
    offsets.add(localWallTime(probe) - probe);
  }
  const candidates = [...offsets].map((offset) => {
    const instant = guess - offset;
    return { instant, wall: localWallTime(instant) };
  });
  const exact = candidates.filter((candidate) => candidate.wall === guess);
  if (exact.length)
    return new Date(Math.min(...exact.map((candidate) => candidate.instant))).toISOString();
  throw new RangeError("nonexistent_local_time");
}

/**
 * Resolve an editable clock, rejecting DST gaps. Keep an existing instant when
 * it still matches both inputs in this timezone: minute-only controls must not
 * discard its seconds or choose a different occurrence of a repeated clock.
 */
export function exactLocalInstant(
  localDate: string,
  time: string,
  tz = DEFAULT_TZ,
  existingInstant?: string | null,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return null;
  try {
    if (
      existingInstant &&
      Number.isFinite(Date.parse(existingInstant)) &&
      localDateOf(existingInstant, tz) === localDate &&
      timeOf(existingInstant, tz) === time
    )
      return existingInstant;
    const instant = instantFromLocal(localDate, time, tz);
    return localDateOf(instant, tz) === localDate && timeOf(instant, tz) === time ? instant : null;
  } catch {
    return null;
  }
}

export function timeOf(iso: string, tz = DEFAULT_TZ) {
  return dateFormatter("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

const ld = (s: string) => new Date(s + "T12:00:00Z");

export function fmtMonthDay(localDate: string, locale = intlLocale()) {
  return dateFormatter(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(
    ld(localDate),
  );
}
export function fmtMonthDayWeekday(localDate: string, locale = intlLocale()) {
  return dateFormatter(locale, {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(ld(localDate));
}
export function fmtTime(iso: string, tz = DEFAULT_TZ, locale = intlLocale(), minutes = true) {
  return dateFormatter(locale, {
    timeZone: tz,
    hour: "numeric",
    ...(minutes ? { minute: "2-digit" } : {}),
  }).format(new Date(iso));
}
export function fmtYearMonth(y: number, m: number, locale = intlLocale()) {
  return dateFormatter(locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

/** Whole-day difference between two local dates (b - a). */
export function dayDiff(a: string, b: string) {
  return Math.round((ld(b).getTime() - ld(a).getTime()) / 86400000);
}

export function addDays(localDate: string, n: number) {
  const d = ld(localDate);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday-first month grid, 6 rows trimmed to needed weeks. */
export function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = addDays(first.toISOString().slice(0, 10), -offset);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDays(start, i);
    return {
      date,
      day: Number(date.slice(8)),
      inMonth: Number(date.slice(5, 7)) === month,
      weekday: i % 7,
    };
  });
}

/** Previous calendar week, Monday through Sunday, for a recorded local day. */
export function previousWeek(day: string) {
  const offset = (ld(day).getUTCDay() + 6) % 7;
  const monday = addDays(day, -offset);
  return { start: addDays(monday, -7), end: addDays(monday, -1) };
}

export function weekdayLabels(locale = intlLocale()) {
  return Array.from({ length: 7 }, (_, i) =>
    dateFormatter(locale, { weekday: "short", timeZone: "UTC" }).format(
      ld(addDays("2024-01-01", i)),
    ),
  );
}
