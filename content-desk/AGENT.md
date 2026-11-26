# Desk agent: how Chandler writes to the Content Desk

Chandler, the content AI employee, is a writer on the Desk as `chandler@agent.jaygptpro.com`.
He cannot sign in with Google, so he calls one narrow endpoint, `desk-agent`, with his own secret.
Every call runs inside the database as that writer, so the Desk rules hold for him exactly as for
Denisa: he cannot approve, move a card to another column, change a published post, or touch the
main WhatsApp text after Jay approved it. His cards carry a small "Chandler" badge on the board.
Like the email today, the other channel versions (the Hebrew group included) stay open after
Jay's approval: they are adaptations written once the post is approved.

## Calling it

```
POST https://sjdcvjunibwxkwqzjitw.supabase.co/functions/v1/desk-agent
x-desk-agent-token: <DESK_AGENT_TOKEN>
Content-Type: application/json

{ "action": "list" }
```

From Chandler's folder the client does this for you: `python3 scripts/desk.py list` (see `--help`).

## Actions

| action | what it does | fields |
|---|---|---|
| `list` | Posts on the board, latest change first. Rejected posts and posts published more than 14 days ago only with `all`. | `stage`, `all`, `limit` (default 100) |
| `queue` | What waits on Jay: ideas, drafts and finals waiting for his answer (oldest first), and Ready posts without a date. `waiting_days` counts from the post's last change. | |
| `show` | One post with every version of every channel and its open notes. | `post_id` |
| `cap` | Open ideas against the cap of 7, and how many more fit. | |
| `add_idea` | A new card in the ideas column, waiting for Jay. | `title` (required), `idea`, `category` (news, tip, skill, deals, other; default tip), `score` (1 to 10), `covered_before`, `news_date` (2026-11-26), `dry_run` |
| `add_version` | The next version of one channel on a post. | `post_id`, `channel`, `body` (required), `headlines`, `previews` (email only), `sources` (links), `writer_note`, `dry_run` |

Channels for `add_version`: `linkedin`, `x`, `facebook`, `threads`, `email`, and `whatsapp_he` for
the Hebrew group (an adaptation for that group, not a translation).

`dry_run: true` runs the whole write with every rule and rolls it back. The client does this by
default and writes only with `--apply`.

## Rules the endpoint adds on top of the database

- At most 7 open ideas (in the ideas column and not rejected). `add_idea` is refused at 7. The
  board shows the count; people can still add an idea there.
- An idea that waits (for Jay's answer, or for a fix after his notes) with no activity for 7 days
  moves to Rejected with the reason "expired". A note, a version or a file counts as activity, a
  translation does not. An idea Jay approved never expires, nor one with a planned date still ahead.
  This runs on every `list`, `queue`, `cap` and `add_idea` (so those calls can write), and the
  answer lists the expired ideas in `expired` (id and title) so Chandler can tell Jay. Jay brings
  one back with "Bring it back". If nothing calls the endpoint, nothing expires.
- Safe to retry: an open idea with the same title is refused, and so is a version whose text is
  exactly the channel's latest one.
- No `whatsapp` channel. The WhatsApp text is the post itself: its first draft and final move the
  card and go to Jay, so they are written on the board.
- Channel versions go on a post after its first draft, never on a bare idea or a rejected post.
  An email version also marks the post "also an email", as the board does (not once published).

## Answers

`200` with `"ok": true`. Otherwise `"ok": false` and an `error` that says why:
`400` bad input, `401` wrong or missing token, `403` Chandler is not an active team member,
`404` no such post, `409` a Desk rule said no, `503` the secret is not set on the function.

## Setup and switching it off

1. Run `supabase/migrate-5-agent.sql` in the SQL editor of "jaygptpro-team". It adds Chandler's row.
2. Deploy from this folder: `supabase functions deploy desk-agent --project-ref sjdcvjunibwxkwqzjitw --no-verify-jwt`.
   (`--no-verify-jwt` because the function checks its own secret instead of a Google sign-in.)
3. Set the secret `DESK_AGENT_TOKEN` (at least 32 characters) on the function, and put the same value
   with `DESK_AGENT_URL` in Chandler's `.env`. Never in this repo: it is public.

To cut Chandler off at once, set his row in `team_members` to inactive (every call then answers 403),
or change the secret.

## Tests

`content-desk/tests/run.sh` builds a throwaway local Postgres with the Desk schema and migration 5
and runs the real handler against it. Nothing touches Supabase.
