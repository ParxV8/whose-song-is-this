import { config } from './config.js';
import * as sessions from './sessions.js';
import * as spotify from './spotify.js';
import { demoPlaylist } from './demo.js';
import { GameError } from './game.js';
import { afterChange, createRoom, deleteRoom, getRoom, scheduleHostHandoff, socketsFor } from './rooms.js';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function cleanProfile({ name, color, avatar } = {}) {
  return {
    name: String(name || '').trim().slice(0, 20),
    color: COLOR_RE.test(color) ? color : '#1DB954',
    avatar: String(avatar || '🎧').slice(0, 8),
  };
}

const spotifyInfo = (session) =>
  session.spotify?.profile ? { name: session.spotify.profile.name } : null;

export function registerSocketHandlers(io) {
  io.use((socket, next) => {
    const s = sessions.getSession(socket.handshake.auth?.token);
    if (!s) return next(new Error('no_session'));
    socket.data.session = s;
    next();
  });

  io.on('connection', (socket) => {
    const session = socket.data.session;
    const pid = session.playerId;

    const on = (event, handler) =>
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          const result = await handler(payload && typeof payload === 'object' ? payload : {});
          reply({ ok: true, ...(result || {}) });
        } catch (e) {
          if (!e.expose) console.error(`[socket] ${event}`, e);
          reply({ ok: false, error: e.expose ? e.message : 'Something went wrong', code: e.code });
        }
      });

    const currentRoom = () => (socket.data.roomCode ? getRoom(socket.data.roomCode) : null);
    const requireRoom = () => {
      const room = currentRoom();
      if (!room || !room.game.players.has(pid)) throw new GameError('You are not in a room', 'no_room');
      return room;
    };
    const requireHost = (room) => {
      if (room.game.hostId !== pid) throw new GameError('Only the host can do that', 'not_host');
    };

    function stillConnectedElsewhere(room) {
      return socketsFor(room).some((s) => s.id !== socket.id && s.data.session.playerId === pid);
    }

    function detach() {
      const room = currentRoom();
      if (!room) return;
      socket.leave(room.code);
      socket.data.roomCode = null;
      if (room.game.players.has(pid) && !stillConnectedElsewhere(room)) {
        room.game.setConnected(pid, false);
        if (room.game.hostId === pid) scheduleHostHandoff(room);
        afterChange(room);
      }
    }

    function enter(room) {
      if (socket.data.roomCode && socket.data.roomCode !== room.code) detach();
      socket.join(room.code);
      socket.data.roomCode = room.code;
      room.game.setConnected(pid, true);
    }

    // ----- rooms -----

    on('room:create', (profile) => {
      const p = cleanProfile(profile);
      if (!p.name) throw new GameError('Pick a display name first');
      const room = createRoom(pid);
      room.game.addPlayer({ id: pid, ...p, spotify: spotifyInfo(session) });
      enter(room);
      afterChange(room);
      return { code: room.code };
    });

    on('room:join', ({ code, ...profile }) => {
      const room = getRoom(code);
      if (!room) throw new GameError('No room with that code', 'not_found');
      const p = cleanProfile(profile);
      if (!p.name) throw new GameError('Pick a display name first');
      const g = room.game;
      if (g.players.has(pid)) {
        g.updatePlayer(pid, { ...p, spotify: spotifyInfo(session) });
      } else {
        if (g.activePlayers().length >= config.maxPlayers) throw new GameError('This room is full', 'full');
        g.addPlayer({ id: pid, ...p, spotify: spotifyInfo(session) });
      }
      enter(room);
      afterChange(room);
      return { code: room.code };
    });

    // Reconnect / page reload / back from Spotify login.
    on('room:resume', ({ code }) => {
      const room = getRoom(code);
      if (!room) throw new GameError('That room has ended', 'not_found');
      if (!room.game.players.has(pid) || room.game.players.get(pid).left) return { needsJoin: true };
      room.game.updatePlayer(pid, { spotify: spotifyInfo(session) });
      enter(room);
      afterChange(room);
      return { code: room.code };
    });

    on('room:leave', () => {
      const room = currentRoom();
      if (!room) return;
      socket.leave(room.code);
      socket.data.roomCode = null;
      room.game.removePlayer(pid);
      for (const s of socketsFor(room)) {
        if (s.data.session.playerId === pid) {
          s.leave(room.code);
          s.data.roomCode = null;
          s.emit('left');
        }
      }
      if (room.game.activePlayers().length === 0) deleteRoom(room);
      else afterChange(room);
    });

    on('player:update', (profile) => {
      const room = requireRoom();
      const p = cleanProfile(profile);
      room.game.updatePlayer(pid, { ...(p.name ? { name: p.name } : {}), color: p.color, avatar: p.avatar });
      afterChange(room);
    });

    on('player:ready', ({ ready }) => {
      const room = requireRoom();
      room.game.setReady(pid, !!ready);
      afterChange(room);
    });

    // ----- playlists -----

    on('playlist:list', async () => {
      if (!session.spotify) throw new GameError('Connect Spotify first', 'not_connected');
      return { playlists: await spotify.listPlaylists(session) };
    });

    on('playlist:link', async ({ input, demo }) => {
      const room = requireRoom();
      let result;
      if (demo) {
        if (!config.demoPlaylists) throw new GameError('Demo playlists are disabled');
        result = demoPlaylist();
      } else {
        if (!session.spotify) throw new GameError('Connect Spotify first', 'not_connected');
        const id = spotify.parsePlaylistId(input);
        if (!id) throw new GameError("That doesn't look like a Spotify playlist link");
        result = await spotify.loadPlaylist(session, id);
      }
      const playlist = room.game.linkPlaylist(pid, result.meta, result.tracks);
      afterChange(room);
      return { playlist };
    });

    on('playlist:unlink', () => {
      const room = requireRoom();
      room.game.unlinkPlaylist(pid);
      afterChange(room);
    });

    // ----- host controls -----

    on('host:settings', (patch) => {
      const room = requireRoom();
      requireHost(room);
      room.game.updateSettings(patch);
      afterChange(room);
    });

    on('host:start', () => {
      const room = requireRoom();
      requireHost(room);
      room.game.start();
      afterChange(room);
    });

    on('host:next', () => {
      const room = requireRoom();
      requireHost(room);
      const g = room.game;
      if (g.phase === 'voting') g.closeVoting();
      else if (g.phase === 'reveal') g.advance();
      afterChange(room);
    });

    on('host:end', () => {
      const room = requireRoom();
      requireHost(room);
      if (room.game.phase !== 'lobby') room.game.end();
      afterChange(room);
    });

    on('host:playAgain', () => {
      const room = requireRoom();
      requireHost(room);
      room.game.backToLobby();
      afterChange(room);
    });

    on('host:kick', ({ playerId }) => {
      const room = requireRoom();
      requireHost(room);
      if (playerId === pid) throw new GameError("You can't kick yourself");
      room.game.removePlayer(playerId);
      for (const s of socketsFor(room)) {
        if (s.data.session.playerId === playerId) {
          s.leave(room.code);
          s.data.roomCode = null;
          s.emit('kicked');
        }
      }
      afterChange(room);
    });

    // ----- game -----

    on('vote', ({ targetId }) => {
      const room = requireRoom();
      room.game.castVote(pid, String(targetId || ''));
      afterChange(room);
    });

    socket.on('disconnect', () => {
      const room = currentRoom();
      if (!room || !room.game.players.has(pid)) return;
      // The socket has already left its rooms at this point.
      const elsewhere = socketsFor(room).some((s) => s.data.session.playerId === pid);
      if (elsewhere) return;
      room.game.setConnected(pid, false);
      if (room.game.hostId === pid) scheduleHostHandoff(room);
      afterChange(room);
    });
  });
}
