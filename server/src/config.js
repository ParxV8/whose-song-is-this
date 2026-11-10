import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(__dirname, '../../.env');
const serverEnv = path.resolve(__dirname, '../.env');
loadEnv({ path: fs.existsSync(rootEnv) ? rootEnv : serverEnv, quiet: true });

const publicUrl = (process.env.PUBLIC_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');
const enableSdk = process.env.ENABLE_WEB_PLAYBACK_SDK === 'true';

export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '127.0.0.1',
  publicUrl,
  maxPlayers: Number(process.env.MAX_PLAYERS || 8),
  demoPlaylists: process.env.ENABLE_DEMO_PLAYLISTS === 'true',
  clientDist: path.resolve(__dirname, '../../client/dist'),
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || `${publicUrl}/auth/callback`,
    enableSdk,
    maxTracksPerPlaylist: Number(process.env.MAX_TRACKS_PER_PLAYLIST || 1000),
  },
};

export const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
  // Only requested when the Web Playback SDK is turned on.
  ...(enableSdk ? ['streaming', 'user-read-email', 'user-modify-playback-state'] : []),
];
