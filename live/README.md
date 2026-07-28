# Nothing Sticks — live hosting

Turns the single-file workshop game into a host-driven live experience on Cloudflare
Workers. There are no facilitator codes any more: one host console starts and ends
every round, and every phone follows within ~1.5s.

```
live/
├── worker/
│   ├── wrangler.jsonc      # assets binding (../public) + Durable Object + HOST_KEY var
│   ├── package.json
│   └── src/index.js        # router + Session Durable Object + server-side grading
├── public/
│   ├── game.html           # the player build (adapted copy of ../../game.html)
│   └── host.html           # the host console (phone-first)
└── README.md
```

## Deploy

```bash
cd live/worker
npm install
npx wrangler login
npx wrangler deploy
```

Then set a real host key (do NOT ship the default `changeme-nothing-sticks`):

```bash
npx wrangler secret put HOST_KEY      # prompts for the value, overrides the var
```

A secret takes precedence over the `vars.HOST_KEY` in `wrangler.jsonc`. If you would
rather keep it in the config, edit that value and redeploy.

After deploy wrangler prints your worker URL, e.g. `https://nothing-sticks-live.<you>.workers.dev`:

- **Players:** `https://…workers.dev/game.html`  (`/` redirects here)
- **Host:** `https://…workers.dev/host.html`  — enter the host key once per browser tab

## Local dev

```bash
cd live/worker
npx wrangler dev            # no login needed; local Durable Object storage
```

- players: http://localhost:8787/game.html
- host: http://localhost:8787/host.html  (key `changeme-nothing-sticks`)

## Running the session

1. Open the host console, hand out the player URL (or a QR code to it).
2. Players type their **first name** and tap "join the chat". They land in the lobby
   with the warm-up flood already running. Let this run for a minute or two.
3. Tap **R1** on the console. Every phone begins round 1 together.
4. When you want time called, tap **end round**. Everyone gets the round-over screen
   (no code input — the button just says "waiting for the host…").
5. Tap the next round button (it is highlighted green). Repeat through R7.
6. Tap **end game** for the end screens. The `sana` reveal word is still typed on the
   player's own phone — announce it when you are ready.

Extras on the console: live answer tally for the current round (identical answers are
grouped, with a ✓/✗ from the server-side grader), a leaderboard with medals, a pace
selector, and a tap-a-name marker for the round-6 "flake 99" prize.

**Pace** is a speed multiplier applied to the round length: `1.25×` makes a 210s round
run in 168s, `0.75×` stretches it to 280s. It changes how fast the scripted beats land,
so set it before starting a round. Per-round length can also be overridden by POSTing
`durationSec` to `/api/host/start-round`.

## Multiple sessions

Supported. Add `?session=<id>` to both URLs — each id gets its own Durable Object with
its own players, answers and phase:

- `https://…/host.html?session=roomB`
- `https://…/game.html?session=roomB`

Omitting it uses the session `main`. The player build stores its session id alongside
its player id, so a refresh rejoins the same room.

## API

Player (no auth, no secrets ever returned):

| route | body | returns |
|---|---|---|
| `GET /api/state` | — | `{phase, round, roundStartedAt, durationSec, pace, version, serverNow, prizeClaimed}` |
| `POST /api/join` | `{name}` | `{playerId, name}` — same name reclaims the same player |
| `POST /api/answer` | `{playerId, round, text}` | `{ok:true}` — graded server-side, result never returned |

Host (all require header `X-Host-Key`):
`GET /api/host/dashboard`, `POST /api/host/start-round {round, durationSec?}`,
`/api/host/end-round`, `/api/host/end-game`, `/api/host/set-pace {pace}`,
`/api/host/prize-claimed {name}`, `/api/host/reset`.

Everything is same-origin (the worker serves both the pages and the API), so there is
no CORS configuration to get wrong.

## Notes / limitations

- **Pause/resume is not implemented.** To stretch a round, end it and restart it, or
  drop the pace before starting. Ending a round does not delete answers.
- The player build still computes a local score for the player's own end screen. The
  authoritative score is the server's; the console leaderboard is what counts.
- `?fast=7x` still accelerates local timing for solo testing. It prints no codes.
- Round state lives in the Durable Object. `reset` wipes it and reloads every phone.
