/* =====================================================================
   "Nothing Sticks" — live hosting worker
   - static assets (../public) are served by the assets binding
   - /api/* is routed into a Durable Object, one per session id
   ===================================================================== */

/* ---- grading: ported verbatim from the single-file game build ------- */
const normA = s => (s || '').toLowerCase().trim();
const timeOK = a => {
  a = normA(a).replace(/[\s\.]/g, '');
  if (!a) return false;
  if (/(9|half|:30|830)/.test(a)) return false;
  return /(^|[^\d])8(pm)?($|[^\d:])|^20:?00$|eight/.test(a);
};
const GRADERS = [
  timeOK,
  a => normA(a).includes('marmite'),
  a => /\b14\b/.test(normA(a)) && !/\b(12|40)\b/.test(normA(a)),
  a => /dan/.test(normA(a)),
  a => { a = normA(a); if (!a) return false; return /(nothing|no[nt]? |not real|fake|didn'?t happen|never happened|hoax|bogus|no\b)/.test(a) && !/(something|defo|definitely happened|yes)/.test(a); },
  timeOK,
  a => { a = normA(a); if (!a) return false; return /(\bon\b|yes|still happening|going ahead)/.test(a) && !/(\boff\b|cancel|not on|no\b)/.test(a); },
];

const ROUND_COUNT = 7;
const DURATIONS = [210, 210, 210, 210, 210, 210, 210];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function freshState() {
  return {
    phase: 'lobby',
    round: 0,
    roundStartedAt: 0,
    durationSec: DURATIONS[0],
    pace: 1,
    prizeClaimedBy: null,
    players: {},
    version: 1,
  };
}

export class Session {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = null;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get('state')) || freshState();
    });
  }

  async save() {
    await this.ctx.storage.put('state', this.state);
  }

  bump() {
    this.state.version++;
  }

  /* effective round length, pace applied. pace > 1 = faster round. */
  effDuration() {
    const p = this.state.pace || 1;
    return Math.max(10, Math.round((this.state.durationSec || 210) / p));
  }

  publicState() {
    const s = this.state;
    return {
      phase: s.phase,
      round: s.round,
      roundStartedAt: s.roundStartedAt,
      durationSec: this.effDuration(),
      pace: s.pace,
      version: s.version,
      serverNow: Date.now(),
      prizeClaimed: !!s.prizeClaimedBy,
    };
  }

  scoreOf(p) {
    return (p.graded || []).reduce((n, g) => n + (g ? 1 : 0), 0);
  }

  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);
    const path = url.pathname;
    let body = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }

    /* ---------------- player routes ---------------- */
    if (path === '/api/state') return json(this.publicState());

    if (path === '/api/join') {
      const name = String(body.name || '').trim().slice(0, 24);
      if (!name) return json({ error: 'name required' }, 400);
      // rejoin-safe: same name (case-insensitive) reclaims the same player
      const key = name.toLowerCase();
      let id = Object.keys(this.state.players).find(
        pid => (this.state.players[pid].name || '').toLowerCase() === key
      );
      if (!id) {
        id = crypto.randomUUID();
        this.state.players[id] = {
          name,
          answers: new Array(ROUND_COUNT).fill(''),
          graded: new Array(ROUND_COUNT).fill(false),
          score: 0,
          lastSeen: Date.now(),
        };
        this.bump();
      } else {
        this.state.players[id].lastSeen = Date.now();
      }
      await this.save();
      return json({ playerId: id, name, state: this.publicState() });
    }

    if (path === '/api/answer') {
      const p = this.state.players[body.playerId];
      if (!p) return json({ error: 'unknown player' }, 404);
      const r = Number(body.round);
      if (!(r >= 0 && r < ROUND_COUNT)) return json({ error: 'bad round' }, 400);
      p.lastSeen = Date.now();
      // last write wins, but only for the round the server is actually on
      if (r === this.state.round && (this.state.phase === 'round' || this.state.phase === 'roundover')) {
        p.answers[r] = String(body.text || '').slice(0, 200);
        p.graded[r] = !!GRADERS[r](p.answers[r]);
        p.score = this.scoreOf(p);
      }
      await this.save();
      // never leak grading back to the player
      return json({ ok: true });
    }

    /* ---------------- host routes ---------------- */
    if (path.startsWith('/api/host/')) {
      const key = req.headers.get('X-Host-Key') || url.searchParams.get('hostKey') || '';
      if (key !== (this.env.HOST_KEY || 'changeme-nothing-sticks')) {
        return json({ error: 'bad host key' }, 401);
      }
      const s = this.state;

      if (path === '/api/host/dashboard') {
        const players = Object.entries(s.players)
          .map(([id, p]) => ({
            id, name: p.name, score: this.scoreOf(p),
            answers: p.answers, graded: p.graded, lastSeen: p.lastSeen,
          }))
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        // tally identical normalized answers for the current round
        const tallies = [];
        for (let r = 0; r < ROUND_COUNT; r++) {
          const m = new Map();
          for (const p of players) {
            const raw = p.answers[r];
            if (!raw) continue;
            const k = normA(raw);
            if (!m.has(k)) m.set(k, { text: raw, count: 0, correct: !!GRADERS[r](raw), who: [] });
            const e = m.get(k);
            e.count++; e.who.push(p.name);
          }
          tallies.push([...m.values()].sort((a, b) => b.count - a.count));
        }
        return json({
          ...this.publicState(),
          durationSecRaw: s.durationSec,
          prizeClaimedBy: s.prizeClaimedBy,
          playerCount: players.length,
          players,
          tallies,
        });
      }

      if (path === '/api/host/start-round') {
        const r = Number(body.round);
        if (!(r >= 0 && r < ROUND_COUNT)) return json({ error: 'bad round' }, 400);
        s.round = r;
        s.phase = 'round';
        s.roundStartedAt = Date.now();
        s.durationSec = Number(body.durationSec) > 0 ? Number(body.durationSec) : DURATIONS[r];
        this.bump(); await this.save();
        return json(this.publicState());
      }
      if (path === '/api/host/end-round') {
        s.phase = s.round >= ROUND_COUNT - 1 && body.finish ? 'ended' : 'roundover';
        this.bump(); await this.save();
        return json(this.publicState());
      }
      if (path === '/api/host/end-game') {
        s.phase = 'ended';
        this.bump(); await this.save();
        return json(this.publicState());
      }
      if (path === '/api/host/set-pace') {
        const p = Number(body.pace);
        if (!(p > 0.1 && p <= 10)) return json({ error: 'bad pace' }, 400);
        s.pace = p;
        this.bump(); await this.save();
        return json(this.publicState());
      }
      if (path === '/api/host/prize-claimed') {
        s.prizeClaimedBy = body.name ? String(body.name).slice(0, 24) : null;
        this.bump(); await this.save();
        return json(this.publicState());
      }
      if (path === '/api/host/reset') {
        this.state = freshState();
        await this.save();
        return json(this.publicState());
      }
      return json({ error: 'unknown host route' }, 404);
    }

    return json({ error: 'not found' }, 404);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      const sid = (url.searchParams.get('session') || 'main').slice(0, 40);
      const id = env.SESSION.idFromName(sid);
      try {
        return await env.SESSION.get(id).fetch(req);
      } catch (e) {
        return json({ error: 'session error', detail: String(e && e.message || e) }, 500);
      }
    }
    if (url.pathname === '/' || url.pathname === '') {
      return Response.redirect(new URL('/game.html' + url.search, url).toString(), 302);
    }
    return env.ASSETS.fetch(req);
  },
};
