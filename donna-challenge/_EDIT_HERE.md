# Source of Truth for the Live Portal

**This folder is the only place to edit the Claude Code Challenge portal and admin dashboard.**

| File | What it is | Edit? |
|---|---|---|
| `index.html` | LIVE participant portal (jaygptpro.com/donna-challenge/) | YES |
| `admin.html` | LIVE admin dashboard (jaygptpro.com/donna-challenge/admin.html) | YES |

## Rules for any session (human or Claude)

1. **NEVER copy from `_admin/projects/landing-pages/` over these files.** Those files are archived snapshots and may be stale. They are now renamed `_ARCHIVED_*.OLD_DO_NOT_EDIT` to prevent accidents.
2. **Always `git pull` before editing or deploying.** Another session may have pushed changes.
3. **Edit in place** with the Edit tool. Never use `cp` or `Write` over the whole file unless you JUST read the same path with Read.
4. **After commit, immediately push.** Don't leave commits sitting locally - other sessions won't see them.
5. **For risky changes, take a backup first**: `cp index.html index.html.bak.$(date +%s)` and remove only after verifying.

## What broke on 2026-04-20

A Claude session edited an old archived copy of `donna-challenge-portal.html` in `_admin/`, then `cp`'d it over the live `index.html`. This wiped out a more recent commit that had Day 1 video content. Took 2 minutes to revert but damaged user trust.

The old admin/portal copies are now renamed with `_ARCHIVED_...OLD_DO_NOT_EDIT` to prevent future accidents.

## How day unlocks work (READ THIS BEFORE "OPENING" A DAY)

**Day unlocks in the portal are MANUAL, not automatic.** Two subsystems interact and it is easy to break one while trying to fix the other. Read carefully.

### The two subsystems

1. **Portal gate** (what students see when they click a day tab). Defined in `isDayUnlocked()` in `index.html` (around line 4031). Current state:

   ```javascript
   if(dayNum === 1) return true;
   if(dayNum === 2) return true;
   return false;
   ```

   **This is manual.** To open Day N, add `if(dayNum === N) return true;` and push. To close a day, remove the line. The automatic date-based logic below the `return false` is commented out and should stay that way unless we explicitly decide to switch modes.

2. **Daily email cron** (the "Day N is open" emails that go out at 14:00 NY). Defined in the `send-daily-emails` Supabase Edge Function, scheduled by pg_cron job `challenge-daily-emails`. It computes which day to send purely from `rounds.start_date`:

   ```typescript
   const dayNum = daysBetween(startDate, todayNY) + 1;
   ```

   So if `round1.start_date = 2026-04-20`, then on 2026-04-22 it sends Day 3. There is a per-send record in `challenge_daily_emails` (round, day_num, sent_at) that prevents duplicate sends of the same day.

### THE TRAP (what broke on 2026-04-21)

A Claude session tried to "open Day 2" in the portal. Instead of editing `isDayUnlocked()`, it changed `rounds.start_date` from `2026-04-20` to `2026-04-19`, thinking it would shift the schedule forward. That did NOT open Day 2 in the portal (the gate is manual, ignores start_date), but it DID break the email cron. Result:

- 2026-04-20: Day 1 email sent (start_date was still 04-20 that morning)
- 2026-04-21: Day 3 email sent (start_date had been changed to 04-19, so computation was day 3). Day 2 email never went out.

Recovery: reverted `start_date` to `2026-04-20`, deleted the `challenge_daily_emails` row for `round1 day 3` so tomorrow's cron re-sends Day 3.

### Rules

- **Never touch `rounds.start_date` for a round that is currently running.** It directly controls the email cron. Only valid reason to change it: scheduling a future round that has not begun.
- **To open a day in the portal**, edit `isDayUnlocked()` in `index.html`. One line. Commit. Push.
- **To control what email goes out tomorrow**, the lever is `rounds.start_date` (with caution) and the `challenge_daily_emails` table (where each successful send is logged, keyed by round + day_num). Deleting a row there makes the cron re-send that day.
- **Do NOT uncomment the auto-date unlock logic in `isDayUnlocked()`** unless Jay explicitly asks to switch the portal from manual to automatic. If you uncomment it, it will unlock days 2-5 at 14:00 NY on their calculated dates, which may not match Jay's pacing.
- **The countdown banner** ("Day 3 opens in 35m") is force-hidden via an early `return` in `updateCountdown()`. That is intentional while we are on manual unlocks. If we switch to auto-date, remove the early return.
