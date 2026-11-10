// Pure game engine: no sockets, no timers, no Spotify. Everything time- or
// randomness-dependent is injectable so it can be unit tested.

export const VOTE_MS = 20_000;
export const REVEAL_MS = 9_000;
export const MIN_TRACKS = 10;
export const ROUND_OPTIONS = [5, 10, 15, 0]; // 0 = unlimited
export const POINTS = { correct: 100, maxSpeed: 50, perFooled: 50 };

export class GameError extends Error {
  constructor(message, code = 'game_error') {
    super(message);
    this.code = code;
    this.expose = true; // safe to show to players
  }
}

export function trackKey(t) {
  // ISRC catches the "same song, different release" case across playlists.
  return t.isrc ? `isrc:${t.isrc.toUpperCase()}` : `id:${t.id}`;
}

function freshStats() {
  return {
    votes: 0,
    correct: 0,
    correctMs: 0,
    fooled: 0, // players this person fooled with their songs
    songsPlayed: 0, // rounds where they owned the song
    timesGuessed: 0, // correct guesses on their songs
    guessChances: 0, // non-owner voters on their songs
  };
}

const clampText = (s, n) => String(s ?? '').trim().slice(0, n);

export class Game {
  constructor({ code, hostId, now = Date.now, random = Math.random }) {
    this.code = code;
    this.hostId = hostId;
    this.now = now;
    this.random = random;
    this.players = new Map();
    this.phase = 'lobby'; // lobby | voting | reveal | ended
    this.settings = {
      rounds: 10,
      hardMode: false,
      audioMode: 'host', // host | everyone
      autoAdvance: true,
      requirePreview: false,
    };
    this.lastActivity = now();
    this.resetGameState();
  }

  resetGameState() {
    this.roundNumber = 0;
    this.usedKeys = new Set();
    this.current = null;
    this.history = [];
    this.final = null;
    for (const p of this.players.values()) {
      p.score = 0;
      p.stats = freshStats();
    }
  }

  touch() {
    this.lastActivity = this.now();
  }

  // ---------- players ----------

  addPlayer({ id, name, color, avatar, spotify = null }) {
    if (this.players.has(id)) return this.updatePlayer(id, { name, color, avatar, spotify });
    const p = {
      id,
      name: clampText(name, 20) || 'Player',
      color: color || '#1DB954',
      avatar: clampText(avatar, 8) || '🎧',
      connected: true,
      left: false,
      joinedAt: this.now(),
      spotify,
      playlist: null,
      tracks: [],
      trackKeys: new Set(),
      ready: false,
      score: 0,
      stats: freshStats(),
    };
    this.players.set(id, p);
    this.touch();
    return p;
  }

  updatePlayer(id, patch) {
    const p = this.mustGet(id);
    if (patch.name !== undefined && clampText(patch.name, 20)) p.name = clampText(patch.name, 20);
    if (patch.color) p.color = String(patch.color).slice(0, 9);
    if (patch.avatar) p.avatar = clampText(patch.avatar, 8);
    if (patch.spotify !== undefined) p.spotify = patch.spotify;
    if (p.left) p.left = false; // rejoining after leaving mid-game
    this.touch();
    return p;
  }

  mustGet(id) {
    const p = this.players.get(id);
    if (!p) throw new GameError('You are not in this room', 'not_in_room');
    return p;
  }

  setConnected(id, connected) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    this.touch();
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players.delete(id);
    } else {
      // Keep them so scores/history still render, but pull their songs.
      p.left = true;
      p.connected = false;
      p.ready = false;
      p.tracks = [];
      p.trackKeys = new Set();
    }
    if (this.hostId === id) this.reassignHost();
    this.touch();
  }

  activePlayers() {
    return [...this.players.values()].filter((p) => !p.left);
  }

  reassignHost() {
    const next = this.activePlayers()
      .filter((p) => p.connected && p.id !== this.hostId)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) this.hostId = next.id;
    return next?.id ?? null;
  }

  // ---------- playlists ----------

  linkPlaylist(id, meta, tracks) {
    const p = this.mustGet(id);
    const unique = [];
    const keys = new Set();
    for (const t of tracks) {
      const key = t.key || trackKey(t);
      if (keys.has(key)) continue;
      keys.add(key);
      unique.push({ ...t, key });
    }
    if (unique.length < MIN_TRACKS) {
      throw new GameError(
        `"${meta.name}" only has ${unique.length} playable song${unique.length === 1 ? '' : 's'}. Pick one with at least ${MIN_TRACKS}.`,
        'too_small',
      );
    }
    p.tracks = unique;
    p.trackKeys = keys;
    p.playlist = {
      id: meta.id,
      name: meta.name,
      image: meta.image || null,
      owner: meta.owner || null,
      url: meta.url || null,
      trackCount: unique.length,
      previewCount: unique.filter((t) => t.previewUrl).length,
      demo: !!meta.demo,
    };
    p.ready = false;
    this.touch();
    return p.playlist;
  }

  unlinkPlaylist(id) {
    const p = this.mustGet(id);
    p.playlist = null;
    p.tracks = [];
    p.trackKeys = new Set();
    p.ready = false;
    this.touch();
  }

  setReady(id, ready) {
    const p = this.mustGet(id);
    if (ready && !p.playlist) throw new GameError('Link a playlist first', 'no_playlist');
    p.ready = !!ready;
    this.touch();
  }

  // ---------- settings / lifecycle ----------

  updateSettings(patch = {}) {
    const s = this.settings;
    if (patch.rounds !== undefined) {
      const r = Number(patch.rounds);
      if (!ROUND_OPTIONS.includes(r)) throw new GameError('Invalid round count');
      if (this.phase !== 'lobby') throw new GameError('Rounds can only be changed in the lobby');
      s.rounds = r;
    }
    if (patch.hardMode !== undefined) s.hardMode = !!patch.hardMode;
    if (patch.autoAdvance !== undefined) s.autoAdvance = !!patch.autoAdvance;
    if (patch.requirePreview !== undefined) s.requirePreview = !!patch.requirePreview;
    if (patch.audioMode !== undefined) {
      if (!['host', 'everyone'].includes(patch.audioMode)) throw new GameError('Invalid audio mode');
      s.audioMode = patch.audioMode;
    }
    this.touch();
  }

  lobbyStatus() {
    const active = this.activePlayers();
    const linked = active.filter((p) => p.playlist);
    const waiting = active.filter((p) => p.connected && !(p.playlist && p.ready));
    if (linked.length < 2) return { canStart: false, reason: 'Need at least 2 players with linked playlists' };
    if (waiting.length) {
      const names = waiting.map((p) => p.name);
      return { canStart: false, reason: `Waiting for ${names.join(', ')}` };
    }
    return { canStart: true, reason: linked.length === 2 ? 'Tip: it’s more fun with 3+ players' : null };
  }

  start() {
    if (this.phase !== 'lobby') throw new GameError('Game already started');
    const status = this.lobbyStatus();
    if (!status.canStart) throw new GameError(status.reason, 'not_ready');
    this.resetGameState();
    if (!this.startRound()) throw new GameError('No songs available to play');
  }

  backToLobby() {
    for (const [id, p] of this.players) {
      if (p.left) this.players.delete(id);
      else p.ready = false;
    }
    this.phase = 'lobby';
    this.resetGameState();
    this.touch();
  }

  // ---------- rounds ----------

  previewFilterActive() {
    if (!this.settings.requirePreview) return false;
    // If nothing in the pool has a preview, ignore the setting (embed fallback).
    return this.activePlayers().some((p) => p.tracks.some((t) => t.previewUrl && !this.usedKeys.has(t.key)));
  }

  unusedTracks(p, previewOnly) {
    return p.tracks.filter((t) => !this.usedKeys.has(t.key) && (!previewOnly || t.previewUrl));
  }

  poolRemaining() {
    const keys = new Set();
    for (const p of this.activePlayers()) for (const t of p.tracks) if (!this.usedKeys.has(t.key)) keys.add(t.key);
    return keys.size;
  }

  pickTrack() {
    const previewOnly = this.previewFilterActive();
    const eligible = this.activePlayers().filter((p) => this.unusedTracks(p, previewOnly).length > 0);
    if (!eligible.length) return null;
    // Owner first, then a song: big playlists don't dominate.
    const owner = eligible[Math.floor(this.random() * eligible.length)];
    const candidates = this.unusedTracks(owner, previewOnly);
    const track = candidates[Math.floor(this.random() * candidates.length)];
    this.usedKeys.add(track.key);
    const owners = this.activePlayers()
      .filter((p) => p.trackKeys.has(track.key))
      .map((p) => p.id);
    return { track, owners };
  }

  startRound() {
    const pick = this.pickTrack();
    if (!pick) return false;
    this.roundNumber += 1;
    const t = this.now();
    this.current = {
      number: this.roundNumber,
      track: pick.track,
      owners: pick.owners,
      options: this.voteOptions(pick.owners),
      votes: new Map(),
      startedAt: t,
      endsAt: t + VOTE_MS,
      revealEndsAt: null,
      results: null,
    };
    this.phase = 'voting';
    this.touch();
    return true;
  }

  voteOptions(owners) {
    const ids = new Set(this.activePlayers().filter((p) => p.playlist).map((p) => p.id));
    for (const o of owners) ids.add(o);
    return [...ids];
  }

  expectedVoters() {
    if (!this.current) return [];
    return this.activePlayers().filter(
      (p) => p.connected && this.current.options.some((o) => o !== p.id),
    );
  }

  castVote(voterId, targetId) {
    if (this.phase !== 'voting' || !this.current) throw new GameError('Voting is closed', 'closed');
    const voter = this.mustGet(voterId);
    if (voter.left) throw new GameError('You left this game');
    if (this.now() > this.current.endsAt + 500) throw new GameError('Too late!', 'closed');
    if (voterId === targetId) throw new GameError("You can't vote for yourself", 'self_vote');
    if (!this.current.options.includes(targetId)) throw new GameError('Not a valid choice');
    if (this.current.votes.has(voterId)) throw new GameError('Already locked in', 'already_voted');
    this.current.votes.set(voterId, { targetId, at: this.now() });
    this.touch();
  }

  allVoted() {
    if (this.phase !== 'voting') return false;
    const voters = this.expectedVoters();
    return voters.length > 0 && voters.every((p) => this.current.votes.has(p.id));
  }

  closeVoting() {
    if (this.phase !== 'voting') return null;
    const c = this.current;
    const owners = new Set(c.owners);
    const points = {};
    const add = (id, n) => (points[id] = (points[id] || 0) + n);
    const votes = [];
    let fooled = 0;
    let correctNonOwners = 0;
    let nonOwnerVoters = 0;

    for (const [voterId, v] of c.votes) {
      const voter = this.players.get(voterId);
      if (!voter) continue;
      const ms = Math.max(0, v.at - c.startedAt);
      const correct = owners.has(v.targetId);
      const voterIsOwner = owners.has(voterId);
      let pts = 0;
      if (correct) {
        const speed = Math.round(POINTS.maxSpeed * Math.max(0, 1 - ms / VOTE_MS));
        pts = POINTS.correct + speed;
        voter.stats.correct += 1;
        voter.stats.correctMs += ms;
      }
      if (!voterIsOwner) {
        nonOwnerVoters += 1;
        if (correct) correctNonOwners += 1;
        else fooled += 1;
      }
      voter.stats.votes += 1;
      add(voterId, pts);
      votes.push({ voterId, targetId: v.targetId, correct, points: pts, ms });
    }

    for (const id of owners) {
      const p = this.players.get(id);
      if (!p) continue;
      add(id, fooled * POINTS.perFooled);
      p.stats.fooled += fooled;
      p.stats.songsPlayed += 1;
      p.stats.timesGuessed += correctNonOwners;
      p.stats.guessChances += nonOwnerVoters;
    }

    for (const [id, n] of Object.entries(points)) {
      const p = this.players.get(id);
      if (p) p.score += n;
    }

    const t = c.track;
    c.results = {
      owners: c.owners,
      track: {
        name: t.name,
        artists: t.artists,
        album: t.album,
        image: t.image,
        url: t.id && !t.demo ? `https://open.spotify.com/track/${t.id}` : null,
      },
      votes: votes.sort((a, b) => a.ms - b.ms),
      points,
      fooled,
      missed: this.expectedVoters()
        .filter((p) => !c.votes.has(p.id))
        .map((p) => p.id),
    };
    c.revealEndsAt = this.now() + REVEAL_MS;
    this.history.push({ number: c.number, ...c.results });
    this.phase = 'reveal';
    this.touch();
    return c.results;
  }

  isLastRound() {
    const r = this.settings.rounds;
    return (r > 0 && this.roundNumber >= r) || this.poolRemaining() === 0;
  }

  advance() {
    if (this.phase !== 'reveal') return;
    if (this.isLastRound() || !this.startRound()) this.end();
  }

  end() {
    if (this.phase === 'voting') this.closeVoting();
    this.phase = 'ended';
    this.current = null;
    this.final = {
      roundsPlayed: this.history.length,
      leaderboard: this.leaderboard(),
      awards: this.computeAwards(),
    };
    this.touch();
  }

  leaderboard() {
    return [...this.players.values()]
      .filter((p) => !p.left || p.score > 0)
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
      .map((p, i) => ({ id: p.id, score: p.score, rank: i + 1 }));
  }

  computeAwards() {
    const ps = [...this.players.values()];
    const best = (list, score) => {
      let top = null;
      let topScore = -Infinity;
      for (const p of list) {
        const s = score(p);
        if (s > topScore) {
          top = p;
          topScore = s;
        }
      }
      return top;
    };
    const awards = [];

    const detectives = ps.filter((p) => p.stats.correct > 0);
    const det = best(detectives, (p) => p.stats.correct * 1e6 - p.stats.correctMs / p.stats.correct);
    if (det) awards.push({ id: 'detective', emoji: '🕵️', title: 'Best Detective', playerId: det.id, detail: `${det.stats.correct} correct guess${det.stats.correct === 1 ? '' : 'es'}` });

    const mysterious = best(ps.filter((p) => p.stats.fooled > 0), (p) => p.stats.fooled);
    if (mysterious) awards.push({ id: 'mysterious', emoji: '🎭', title: 'Most Mysterious Taste', playerId: mysterious.id, detail: `Fooled friends ${mysterious.stats.fooled} time${mysterious.stats.fooled === 1 ? '' : 's'}` });

    const predictable = best(
      ps.filter((p) => p.stats.guessChances > 0 && p.stats.timesGuessed > 0),
      (p) => p.stats.timesGuessed / p.stats.guessChances,
    );
    if (predictable) {
      const pct = Math.round((predictable.stats.timesGuessed / predictable.stats.guessChances) * 100);
      awards.push({ id: 'predictable', emoji: '📖', title: 'Most Predictable', playerId: predictable.id, detail: `Friends spotted their songs ${pct}% of the time` });
    }

    const speedy = best(detectives, (p) => -(p.stats.correctMs / p.stats.correct));
    if (speedy) awards.push({ id: 'speed', emoji: '⚡', title: 'Fastest Finger', playerId: speedy.id, detail: `${(speedy.stats.correctMs / speedy.stats.correct / 1000).toFixed(1)}s average correct answer` });

    return awards;
  }

  // ---------- views ----------

  isAudioDevice(viewerId) {
    return this.settings.audioMode === 'everyone' || viewerId === this.hostId;
  }

  publicState(viewerId) {
    const c = this.current;
    const reveal = this.phase === 'reveal';
    let round = null;
    if (c) {
      const t = c.track;
      const showMeta = reveal || !this.settings.hardMode;
      round = {
        number: c.number,
        total: this.settings.rounds,
        isLast: this.isLastRound(),
        startedAt: c.startedAt,
        endsAt: c.endsAt,
        durationMs: VOTE_MS,
        revealEndsAt: c.revealEndsAt,
        options: c.options,
        track: showMeta
          ? { hidden: false, name: t.name, artists: t.artists, album: t.album, image: t.image }
          : { hidden: true },
        // Playback info only goes to devices that actually play audio.
        playback: this.isAudioDevice(viewerId)
          ? { uri: t.uri || null, previewUrl: t.previewUrl || null, durationMs: t.durationMs || null, title: t.name, artists: t.artists }
          : null,
        myVote: c.votes.get(viewerId)?.targetId ?? null,
        votedCount: c.votes.size,
        voterCount: this.expectedVoters().length,
        results: reveal ? c.results : null,
      };
    }
    return {
      code: this.code,
      hostId: this.hostId,
      me: viewerId,
      phase: this.phase,
      settings: { ...this.settings },
      serverNow: this.now(),
      lobby: this.phase === 'lobby' ? this.lobbyStatus() : null,
      poolRemaining: this.poolRemaining(),
      players: [...this.players.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          avatar: p.avatar,
          connected: p.connected,
          left: p.left,
          spotify: p.spotify ? { name: p.spotify.name } : null,
          playlist: p.playlist,
          ready: p.ready,
          score: p.score,
          hasVoted: !!c?.votes.has(p.id),
        })),
      round,
      final: this.phase === 'ended' ? this.final : null,
    };
  }
}
