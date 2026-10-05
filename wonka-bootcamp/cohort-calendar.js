/* Wonka evergreen cohort calendar. THE one place the weekly schedule is computed.

   Read by four things, so they can never disagree about a date:
     - the sales page (/wonka/), to show the next cohort and its ten days
     - the student portal (/wonka-bootcamp/), to open each day for a cohort
     - stripe-webhook, to file a buyer into a cohort and print its dates
     - send-wonka-daily, to time each email
   The edge functions import this file by URL, which is bundled at deploy time, so a
   change here reaches them only when they are redeployed. Pages pick it up on the
   next load (bump the ?v= on their script tags).

   Shape (Jay, 5.10.2026): a cohort starts every Monday. Week 1 Mon-Thu = days 1-4,
   week 2 Mon-Wed = days 5-7, week 3 Mon-Wed = days 8-10. A lesson that lands on a
   major US holiday opens the next weekday and the rest of THAT week moves with it,
   so the next week still starts on its own Monday.
   Holidays: New Year, Memorial Day, July 4, Labor Day, Thanksgiving, Christmas, each
   on its observed weekday. Columbus Day, MLK Day and Presidents' Day are not skipped.

   A purchase up to Sunday 23:59 New York joins the coming Monday; a purchase on a
   Monday joins the Monday after. No cohort starts before FIRST_COHORT.

   Plain script, no modules: it sets globalThis.WonkaCalendar so a <script> tag and a
   Deno side-effect import both work. Dates are 'YYYY-MM-DD' strings throughout. */
(function (root) {
  'use strict';

  var WEEKS = [4, 3, 3];
  var FIRST_COHORT = '2026-10-12';
  var ID_PREFIX = 'wonka_wk_';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  function utc(y, m, d) { return new Date(Date.UTC(y, m, d)); }
  function iso(dt) { return dt.toISOString().slice(0, 10); }
  function parse(s) {
    var p = String(s).slice(0, 10).split('-').map(Number);
    return utc(p[0], p[1] - 1, p[2]);
  }
  function addDays(dt, n) { return utc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + n); }

  // n >= 1: the nth such weekday of the month; n = -1: the last one.
  function nthWeekday(y, month, weekday, n) {
    if (n > 0) {
      var first = utc(y, month, 1);
      return utc(y, month, 1 + (weekday - first.getUTCDay() + 7) % 7 + (n - 1) * 7);
    }
    var last = utc(y, month + 1, 0);
    return utc(y, month, last.getUTCDate() - (last.getUTCDay() - weekday + 7) % 7);
  }
  // A Saturday holiday is observed on the Friday before, a Sunday one on the Monday after.
  function observed(dt) {
    var w = dt.getUTCDay();
    return w === 6 ? addDays(dt, -1) : w === 0 ? addDays(dt, 1) : dt;
  }
  function holidays(y) {
    return [
      observed(utc(y, 0, 1)),        // New Year's Day
      nthWeekday(y, 4, 1, -1),       // Memorial Day, last Monday of May
      observed(utc(y, 6, 4)),        // Independence Day
      nthWeekday(y, 8, 1, 1),        // Labor Day, first Monday of September
      nthWeekday(y, 10, 4, 4),       // Thanksgiving, fourth Thursday of November
      observed(utc(y, 11, 25)),      // Christmas
    ].map(iso);
  }
  var holidayCache = {};
  function isHoliday(dt) {
    var y = dt.getUTCFullYear();
    if (!holidayCache[y]) {
      // New Year of y+1 can be observed on 31 December of y.
      holidayCache[y] = holidays(y).concat(holidays(y + 1));
    }
    return holidayCache[y].indexOf(iso(dt)) !== -1;
  }
  function isOff(dt) {
    var w = dt.getUTCDay();
    return w === 0 || w === 6 || isHoliday(dt);
  }

  // The ten lesson dates of the cohort that starts on Monday `start`.
  function days(start) {
    var monday = parse(start);
    var out = [];
    var cursor = monday;
    for (var w = 0; w < WEEKS.length; w++) {
      var weekStart = addDays(monday, 7 * w);
      if (cursor < weekStart) cursor = weekStart;
      for (var k = 0; k < WEEKS[w]; k++) {
        while (isOff(cursor)) cursor = addDays(cursor, 1);
        out.push(iso(cursor));
        cursor = addDays(cursor, 1);
      }
    }
    return out;
  }

  // Today's calendar date in New York.
  function nyToday(now) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now || new Date());
    var get = function (t) { return parts.filter(function (p) { return p.type === t; })[0].value; };
    return get('year') + '-' + get('month') + '-' + get('day');
  }

  // The Monday a purchase made at `now` belongs to.
  function nextCohortStart(now) {
    var today = parse(nyToday(now));
    var add = (8 - today.getUTCDay()) % 7 || 7;   // Sunday -> +1, Monday -> +7
    var start = iso(addDays(today, add));
    return start < FIRST_COHORT ? FIRST_COHORT : start;
  }

  function cohortId(start) { return ID_PREFIX + String(start).slice(0, 10).replace(/-/g, '_'); }
  // A real date that is a Monday. A typed id like wonka_wk_2026_10_13 (a Tuesday) would
  // otherwise build a calendar that starts on the wrong day.
  function isEvergreenId(id) {
    var m = /^wonka_wk_(\d{4})_(\d{2})_(\d{2})$/.exec(String(id || ''));
    if (!m) return false;
    var dt = utc(+m[1], +m[2] - 1, +m[3]);
    return iso(dt) === m[1] + '-' + m[2] + '-' + m[3] && dt.getUTCDay() === 1;
  }
  function startFromId(id) {
    if (!isEvergreenId(id)) return null;
    return String(id).slice(ID_PREFIX.length).replace(/_/g, '-');
  }

  // "October 12 to 15, 19 to 21 and 26 to 28, 2026": one range per week.
  function display(start) {
    var d = days(start);
    var weeks = [], i = 0;
    for (var w = 0; w < WEEKS.length; w++) { weeks.push(d.slice(i, i + WEEKS[w])); i += WEEKS[w]; }
    var prevMonth = -1;
    var parts = weeks.map(function (wk) {
      var a = parse(wk[0]), b = parse(wk[wk.length - 1]);
      // The month is dropped only when this week sits wholly inside the month just named.
      var head = (a.getUTCMonth() === prevMonth && b.getUTCMonth() === a.getUTCMonth()) ? String(a.getUTCDate())
        : MONTHS[a.getUTCMonth()] + ' ' + a.getUTCDate();
      var tail = b.getUTCMonth() === a.getUTCMonth() ? String(b.getUTCDate())
        : MONTHS[b.getUTCMonth()] + ' ' + b.getUTCDate();
      prevMonth = b.getUTCMonth();
      return head + ' to ' + tail;
    });
    var year = parse(d[d.length - 1]).getUTCFullYear();
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] + ', ' + year;
  }

  root.WonkaCalendar = {
    WEEKS: WEEKS,
    FIRST_COHORT: FIRST_COHORT,
    days: days,
    display: display,
    holidays: holidays,
    nyToday: nyToday,
    nextCohortStart: nextCohortStart,
    cohortId: cohortId,
    isEvergreenId: isEvergreenId,
    startFromId: startFromId,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
