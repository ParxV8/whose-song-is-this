import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, GameError, VOTE_MS, MIN_TRACKS } from '../src/game.js';

function makeTracks(prefix, n, extra = []) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: `${prefix}${i}`, uri: `spotify:track:${prefix}${i}`, name: `${prefix} song ${i}`, artists: ['X'], previewUrl: null });
  return out.concat(extra);
}

function setup({ players = ['a', 'b', 'c'], tracks, random } = {}) {
  let clock = 1_000_000;
  const now = () => clock;
  const g = new Game({ code: 'TEST', hostId: players[0], now, random });
  for (const id of players) {
    g.addPlayer({ id, name: id.toUpperCase() });
    g.linkPlaylist(id, { id: `pl-${id}`, name: `${id} list` }, tracks?.[id] ?? makeTracks(id, 12));
    g.setReady(id, true);
  }
  return { g, tick: (ms) => (clock += ms) };
}

test('rejects small playlists', () => {
  const g = new Game({ code: 'T', hostId: 'a' });
  g.addPlayer({ id: 'a', name: 'A' });
  assert.throws(() => g.linkPlaylist('a', { name: 'tiny' }, makeTracks('a', MIN_TRACKS - 1)), GameError);
});

test('cannot start until everyone is ready', () => {
  const { g } = setup();
  g.setReady('b', false);
  assert.equal(g.lobbyStatus().canStart, false);
  assert.throws(() => g.start(), /Waiting for B/);
  g.setReady('b', true);
  g.start();
  assert.equal(g.phase, 'voting');
});

test('scoring: correct + speed bonus, owner gets fool bonus', () => {
  const { g, tick } = setup({ random: () => 0 }); // owner = a, first track
  g.start();
  assert.deepEqual(g.current.owners, ['a']);
  g.castVote('a', 'b'); // owner bluffing, not counted as fooled
  g.castVote('b', 'a'); // correct, instant -> 150
  tick(VOTE_MS / 2);
  g.castVote('c', 'b'); // wrong -> owner +50
  assert.equal(g.allVoted(), true);
  const res = g.closeVoting();
  assert.equal(res.points.b, 150);
  assert.equal(res.points.c, 0);
  assert.equal(res.points.a, 50);
  assert.equal(res.fooled, 1);
});

test('no self votes, no double votes', () => {
  const { g } = setup({ random: () => 0 });
  g.start();
  assert.throws(() => g.castVote('b', 'b'), /yourself/);
  g.castVote('b', 'c');
  assert.throws(() => g.castVote('b', 'a'), /Already/);
});

test('shared songs: any owner counts as correct', () => {
  const shared = { id: 'shared', uri: 'spotify:track:shared', name: 'Shared', artists: ['Y'], isrc: 'USABC123' };
  const sharedOtherRelease = { ...shared, id: 'shared-remaster' }; // same ISRC
  const tracks = {
    a: makeTracks('a', 11, [shared]),
    b: makeTracks('b', 11, [sharedOtherRelease]),
    c: makeTracks('c', 12),
  };
  // random sequence: owner index 0 (a), then last track (shared)
  const seq = [0, 0.99];
  const { g } = setup({ tracks, random: () => seq.shift() ?? 0 });
  g.start();
  assert.deepEqual(g.current.owners.sort(), ['a', 'b']);
  g.castVote('c', 'b');
  const res = g.closeVoting();
  assert.equal(res.votes.find((v) => v.voterId === 'c').correct, true);
});

test('never repeats a song and ends when pool is exhausted', () => {
  const { g } = setup({ players: ['a', 'b'], tracks: { a: makeTracks('a', 10), b: makeTracks('b', 10) } });
  g.updateSettings({ rounds: 0 });
  g.start();
  const seen = new Set();
  let rounds = 0;
  while (g.phase !== 'ended') {
    assert.ok(!seen.has(g.current.track.key), 'repeated song');
    seen.add(g.current.track.key);
    g.closeVoting();
    g.advance();
    rounds++;
    assert.ok(rounds <= 20);
  }
  assert.equal(rounds, 20);
  assert.ok(g.final.awards.length >= 0);
});

test('owner-first weighting keeps small playlists in play', () => {
  const tracks = { a: makeTracks('a', 10), b: makeTracks('b', 500), c: makeTracks('c', 10) };
  let seed = 42;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 300; i++) {
    const { g } = setup({ tracks, random });
    g.start();
    counts[g.current.owners[0]]++;
  }
  assert.ok(counts.a > 60 && counts.c > 60, JSON.stringify(counts));
});

test('disconnected players are skipped for "all voted"', () => {
  const { g } = setup({ random: () => 0 });
  g.start();
  g.setConnected('c', false);
  g.castVote('a', 'b');
  g.castVote('b', 'a');
  assert.equal(g.allVoted(), true);
  const res = g.closeVoting();
  assert.deepEqual(res.missed, []);
});

test('hard mode hides metadata from non-audio devices until reveal', () => {
  const { g } = setup({ random: () => 0 });
  g.updateSettings({ hardMode: true });
  g.start();
  const asGuest = g.publicState('b');
  assert.equal(asGuest.round.track.hidden, true);
  assert.equal(asGuest.round.playback, null);
  assert.ok(g.publicState('a').round.playback.uri);
  g.closeVoting();
  assert.equal(g.publicState('b').round.track.hidden, false);
});

test('round limit and awards', () => {
  const { g } = setup({ random: () => 0 });
  g.updateSettings({ rounds: 5 });
  g.start();
  for (let i = 0; i < 5; i++) {
    const owner = g.current.owners[0];
    for (const id of ['a', 'b', 'c']) {
      if (id === owner) continue;
      g.castVote(id, id === 'b' ? owner : g.current.options.find((o) => o !== id && o !== owner));
    }
    g.closeVoting();
    g.advance();
  }
  assert.equal(g.phase, 'ended');
  assert.equal(g.final.roundsPlayed, 5);
  const titles = g.final.awards.map((a) => a.id);
  assert.ok(titles.includes('detective'));
  assert.equal(g.final.awards.find((a) => a.id === 'detective').playerId, 'b');
  g.backToLobby();
  assert.equal(g.phase, 'lobby');
  assert.equal(g.players.get('b').score, 0);
});
