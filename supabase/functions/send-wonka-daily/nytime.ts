// Converting a New York wall-clock time to a UTC instant.
//
// Needed because the preparation email has a cutoff at "09:00 New York on the
// day the bootcamp starts", and the cron thinks in UTC. Hardcoding -4 would be
// wrong the moment a round runs across the DST change in November.

function partsIn(tz: string, ms: number) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(ms));
  const g = (t: string) => parseInt(p.find((x) => x.type === t)!.value, 10);
  // hourCycle h23 can report 24 for midnight in some runtimes
  const hour = g("hour") % 24;
  return { y: g("year"), m: g("month"), d: g("day"), h: hour, mi: g("minute"), s: g("second") };
}

/** Offset of `tz` at the given UTC instant, in ms. EDT returns -4h. */
export function tzOffsetMs(tz: string, atUtcMs: number): number {
  const p = partsIn(tz, atUtcMs);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - atUtcMs;
}

/**
 * The UTC instant of a wall-clock time in `tz`.
 * Two passes: the offset itself depends on the instant, so the first guess is
 * corrected once. That converges everywhere except inside the one ambiguous
 * hour of a fall-back transition, which 09:00 never is.
 */
export function wallClockToUtc(
  tz: string, y: number, m: number, d: number, h: number,
): number {
  let ms = Date.UTC(y, m - 1, d, h);
  for (let i = 0; i < 2; i++) ms = Date.UTC(y, m - 1, d, h) - tzOffsetMs(tz, ms);
  return ms;
}

/** "2026-09-01" + hour 9 -> the UTC epoch ms of 09:00 New York that day. */
export function nyDateAtHour(dateStr: string, hour: number): number {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  return wallClockToUtc("America/New_York", y, m, d, hour);
}
