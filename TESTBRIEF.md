# TEST BRIEF — "Nothing Sticks" workshop game
## Instructions for an orchestrating LLM with code execution + subagent spawning

You have been handed a self-contained browser game (`game.html`) used in an educational workshop for ages 15–19. It simulates an overwhelming group-chat feed; across 7 host-paced rounds, players must find true information buried in noise. Your job: **verify it is bug-free and genuinely solvable** by running a multi-agent test battery, then produce one consolidated report.

## Package contents

- `game.html` — the game. Single file, no server needed. Open via `file://` in Chromium/Playwright.
- `harness/act.js` — an optional CDP driver for interactive play (see Harness notes). You may also write your own Playwright scripts.
- `ORACLE.md` — ⚠️ the answer key. **JUDGES AND REVIEWERS ONLY. Never show any part of it, or the game's source code, to a "player" agent — that invalidates solvability testing.**

## Game facts you (the orchestrator) need

- Preview mode: append `?fast=7x` to the URL → rounds start ~4s after entry, flood ~42s, auto-end ~57s, and facilitator codes are shown in input placeholders. Without it, rounds NEVER auto-end (host-paced).
- Codes: entry **wake**; start rounds 2–7: **listen, notice, slower, breathe, question, enough** (type in `#roundcode`, click `#rs_btn` or press Enter). End current round: tap `#mission`, type **over**, Enter. After round 7's round-over screen, the button leads to the end screen; typing **sana** in the end screen's hidden input reveals a story transcript.
- Key selectors: `#introcode`, `#feed .row`, `#feed .linkcard` (tap → `#article`), `#toast .note` (notifications; tap body = jump to chat, ✕ = dismiss), `header .back` (chat list; unread badge `#backbadge`), `header .meta` (group info; `#descpin` appears round 3+), `#roundscreen`, `#mission .q`.
- Rounds auto-advance ONLY in `?fast=7x`. The round-over overlay blocks all clicks beneath it.

## The test battery — spawn these agents

Run tracks A–C; parallelise where your framework allows. Use your strongest model tier where marked STRONG, a mid tier for MID, and your weakest/cheapest for WEAK.

### Track A — Static review (STRONG, 1 agent, reads source + ORACLE.md)
Read `game.html` end-to-end. Hunt: state-machine bugs (round lifecycle, timers, the `roundBeats` flush-on-early-end, `sanaGone` filtering, `floodOn`), content-reference errors (every `link:` id exists in `ARTICLES`; every `chat:` id exists in `CHATS`; every speaker has a colour), spoiler leaks (does any early-round message, article body, URL, or pinned text reveal a later round's answer? cross-check against ORACLE.md), and UI hazards on a 390×800 phone viewport. Report findings with severity + exact line references.

### Track B — Mechanics E2E (MID, 1–2 agents, may read source, uses `?fast=7x`)
Write and run Playwright scripts asserting at minimum:
1. Wrong intro code rejected; `wake` + Enter works. Plain `?fast` (no `=7x`) does NOT enable preview.
2. All 7 rounds sequence: round-over screens appear; wrong round codes rejected; correct codes advance; feed wiped each round (`— round N —` present, previous absent).
3. Mission texts in order: time / code word / NUMBER Elm Road / whose house / station / ORIGINAL source / still ON.
4. Links: round 1 invite card opens an article showing 8pm and NO address/host name; round 5 has stationvid + police cards; round 6 has gone (dead page), cached (archive with 8:00pm), timeA, timeB, screenshot cards. Article ✕ closes. Trustworthy pages (police, cached, invite) must NOT show the "— advertisement —" banner; noise/false ones must.
5. Group info: `#descpin` absent rounds 1–2, present from round 3 onward; pin text contains "14 Elm Road" but NOT any person's name.
6. Notifications: tap-to-jump works, ✕ dismisses, `#backbadge` counts unread.
7. Early-end flush: end round 1 ~8s in via mission-bar "over" → Big Dan's "8. P. M." message must exist in `chatMsgs.main` afterwards. Same idea round 6: end early → "Sana left the group" must exist and `sanaGone===true`.
8. Story integrity: round 1 "might not come saturday"; round 2 "…what small chat"; round 6 "Sana left the group" (should fire in the QUIET phase if not ended early); round 7 contains NO new message authored by Sana and no "Sana is typing…".
9. End screen: stats show; typing `sana` reveals the transcript; wrong text shakes.
10. Zero pageerrors/console errors across two full runs. Also: monitor for repeated identical messages within one round (flag if any thread plays twice in the same round).

### Track C — Blind solvability playtests (the core question)
Spawn THREE player agents at different capability tiers. **BLIND PROTOCOL — this is critical:** players never see `game.html` source, ORACLE.md, this brief's oracle-adjacent details, or each other's transcripts. They interact ONLY through screen-state text you relay (or via the harness) plus an action menu. Persona prompt for each (adapt tier flavour):

> You are role-playing a [WEAK: easily distracted, impulsive / MID: ordinary, mildly curious / STRONG: sharp, sceptical, methodical] 16-year-old playing a phone game that looks like a group chat. A green bar gives missions; answers hide in the flood, other chats, links, or group info. Wrong info circulates. Reply with EXACTLY ONE action per turn: SCROLLUP / SCROLLDOWN / CHATS / OPEN <chat> / TAPNOTE / OPENLINK <words> / HEADER / CLOSE / WAIT / ANSWER <answer + where you found it>. Stay in persona.

Run each player through ALL 7 rounds (host-pace it: end each round with "over" after a fair hunt — in NORMAL mode, not fast, if latency allows; otherwise fast mode and accept the time pressure skews hard). At each round end ask: "ROUND OVER — what's your answer and where did you find it?" Record: answer, correctness vs ORACLE.md, actions used, wrong-info traps taken, and whether they spontaneously mention Sana at any point.

**Solvability pass criteria:**
- WEAK: solves round 1 (any route). Not required to solve 2–7, but must not be stuck by UI confusion (flag any "I don't know how to..." moments).
- MID: solves rounds 1–2, and at least one of 3–4.
- STRONG: solves rounds 1–4; for 5 gives the graded answer (probably nothing — video debunkable, police statement); for 6 finds the archive OR proposes receipts/testimony; for 7 answers ON citing Dan directly.
- Sana: NO player should fully reconstruct her story unprompted (too obvious if they do — flag it). It's GOOD if they scroll past her lines without comment; note any partial noticing.
- After each game, ask the player (still blind): "was anything confusing, unfair, or broken?" — collect UX complaints.

### Track D (optional, STRONG, 1 agent) — Adversarial teen
Give it source access AND the persona of a bored clever 17-year-old trying to break/cheat the game in a room of 30: URL params, code guessing, refresh exploits, devtools-free cheats, content that would cause chaos read aloud. Anything found = report.

## Consolidated report format

1. VERDICT: ship / fix-first (with the fix list).
2. Bugs by severity (critical = answer integrity or crash; high = spoiler/cheat/UX-blocking; medium; low), each with repro.
3. Solvability table: per round × per player tier — solved? route taken? traps taken?
4. Sana blindness check: what each player noticed, when.
5. UX complaints from blind players, verbatim.

## Harness notes

`harness/act.js` expects a Chromium with `--remote-debugging-port=9222` and connects via CDP so state persists across separate node invocations; edit its file path to your local `game.html` location. Commands: `init | obs | scrollup | scrolldown | chats | open <name> | tapnote | openlink <text> | header | closeart | closeinfo | endround | code <word>`. `obs` returns a JSON snapshot (current screen, mission, visible messages, notifications, unread badge) — relay that JSON to blind players as their "eyes". Or ignore it and write your own driver; the selectors above suffice.
