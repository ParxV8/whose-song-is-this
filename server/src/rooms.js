// Room registry + timers. The Game engine is pure; this module drives it in
// real time and pushes per-player state to sockets.
import crypto from 'node:crypto';
import { Game } from './game.js';

const rooms = new Map();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
const HOST_HANDOFF_MS = 20_000;
const IDLE_ROOM_MS = 30 * 60 * 1000;
let io = null;

export function initRooms(socketServer) {
  io = socketServer;
  setInterval(sweep, 60_000).unref();
}

export function createRoom(hostId) {
  let code;
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  } while (rooms.has(code));
  const room = { code, game: new Game({ code, hostId }), timers: {} };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(String(code || '').toUpperCase().trim()) || null;
}

export function deleteRoom(room) {
  for (const t of Object.values(room.timers)) clearTimeout(t);
  rooms.delete(room.code);
}

export function roomsWithPlayer(playerId) {
  return [...rooms.values()].filter((r) => r.game.players.has(playerId));
}

export function socketsFor(room) {
  const ids = io?.sockets.adapter.rooms.get(room.code);
  if (!ids) return [];
  return [...ids].map((id) => io.sockets.sockets.get(id)).filter(Boolean);
}

export function broadcast(room) {
  for (const s of socketsFor(room)) s.emit('state', room.game.publicState(s.data.session.playerId));
}

function setTimer(room, name, ms, fn) {
  clearTimeout(room.timers[name]);
  room.timers[name] = setTimeout(() => {
    delete room.timers[name];
    if (!rooms.has(room.code)) return;
    fn();
  }, Math.max(0, ms));
}

function clearTimer(room, name) {
  clearTimeout(room.timers[name]);
  delete room.timers[name];
}

function schedulePhase(room) {
  const g = room.game;
  if (g.phase === 'voting') {
    setTimer(room, 'phase', g.current.endsAt - Date.now() + 250, () => {
      if (g.phase === 'voting') {
        g.closeVoting();
        afterChange(room);
      }
    });
  } else if (g.phase === 'reveal' && g.settings.autoAdvance) {
    setTimer(room, 'phase', g.current.revealEndsAt - Date.now(), () => {
      if (g.phase === 'reveal') {
        g.advance();
        afterChange(room);
      }
    });
  } else {
    clearTimer(room, 'phase');
  }
}

// Call after every mutation: closes voting early if everyone voted,
// reschedules timers and pushes fresh state.
export function afterChange(room) {
  const g = room.game;
  if (g.phase === 'voting' && g.allVoted()) g.closeVoting();
  schedulePhase(room);
  broadcast(room);
}

export function scheduleHostHandoff(room) {
  setTimer(room, 'host', HOST_HANDOFF_MS, () => {
    const host = room.game.players.get(room.game.hostId);
    if (!host || !host.connected) {
      room.game.reassignHost();
      afterChange(room);
    }
  });
}

function sweep() {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anyone = [...room.game.players.values()].some((p) => p.connected);
    if (!anyone && now - room.game.lastActivity > IDLE_ROOM_MS) deleteRoom(room);
  }
}
