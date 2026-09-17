// The per-round calendar. ONE copy of the ten dates per round, mirroring the
// portal's CONFIG.ROUNDS in jaygptpro.com/wonka-bootcamp/index.html. If a date
// moves there it moves here in the same commit; the two are the same schedule.
//
// Why a table and not arithmetic: Wonka's ten days are not consecutive, and the
// SHAPE differs per round. Round 1 ran 4+3+3 (Tue-Fri, Tue-Thu, Tue-Thu); round 2
// runs 3+3+4 (Tue-Thu, Tue-Thu, Mon-Thu). So "the break email goes out after day 4"
// is a round 1 fact, not a rule. Each round says where its breaks fall.
//
// Email ids are stable across rounds EXCEPT the break email, whose id carries the
// day it follows (07-after-day-4 in round 1, 07-after-day-3 in round 2). The guard
// table wonka_email_recipients is keyed (round, email_id, recipient), and round 1
// already holds 80 rows under 07-after-day-4, so round 1's ids must never change.

export type RoundCal = {
  /** Ten dates, New York calendar, day 1 first. */
  days: string[];
  /** Day numbers after which the cohort has a break of one or more days. */
  breaksAfter: number[];
};

export const ROUNDS: Record<string, RoundCal> = {
  wonka_r1: {
    days: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
           "2026-09-08", "2026-09-09", "2026-09-10",
           "2026-09-15", "2026-09-16", "2026-09-17"],
    breaksAfter: [4, 7],
  },
  wonka_r2: {
    days: ["2026-09-22", "2026-09-23", "2026-09-24",
           "2026-09-29", "2026-09-30", "2026-10-01",
           "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"],
    breaksAfter: [3, 6],
  },
};

export type Due = { date: string; hour: number; id: string };

export const DAY_HOUR = 9;      // every day email, 09:00 New York, when the door opens
export const BREAK_HOUR = 17;   // the break email, the evening the break starts

/** The id of the email sent the evening a break starts. */
export function breakEmailId(afterDay: number): string {
  return `07-after-day-${afterDay}`;
}

/** The id of the day-N email. Two-digit prefix keeps the ids sortable. */
export function dayEmailId(day: number): string {
  const prefix = day <= 4 ? day + 2 : day + 3;   // 03..06 then 08..13, the break email is 07
  return `${String(prefix).padStart(2, "0")}-day-${day}`;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Every dated send for a round: the support email the day before day 1, the ten
 *  day emails at 09:00, and ONE break email at 17:00 after the first break only.
 *  (Round 1 handled its second break with a line inside the day-7 email, and the
 *  build moves that line to the right day for other rounds.) */
export function scheduleFor(round: string): Due[] {
  const cal = ROUNDS[round];
  if (!cal) return [];
  if (cal.days.length !== 10) throw new Error(`${round}: expected 10 days, got ${cal.days.length}`);
  const out: Due[] = [];
  out.push({ date: shiftDate(cal.days[0], -1), hour: DAY_HOUR, id: "02-support" });
  cal.days.forEach((date, i) => out.push({ date, hour: DAY_HOUR, id: dayEmailId(i + 1) }));
  const firstBreak = cal.breaksAfter[0];
  if (firstBreak) out.push({ date: cal.days[firstBreak - 1], hour: BREAK_HOUR, id: breakEmailId(firstBreak) });
  return out;
}

/** Which round's day-N date is `dateStr`; used by the build to word the copy. */
export function dayOn(round: string, dateStr: string): number {
  const i = (ROUNDS[round]?.days || []).indexOf(dateStr);
  return i < 0 ? 0 : i + 1;
}
