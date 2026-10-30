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

/** Build an ISO instant from a local date + HH:mm in the timezone. */
export function instantFromLocal(localDate: string, time: string, tz = DEFAULT_TZ): string {
  const [y = 0, m = 1, d = 1] = localDate.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // offset of tz at that moment
  const parts = dateFormatter("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asTz = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asTz - guess)).toISOString();
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
