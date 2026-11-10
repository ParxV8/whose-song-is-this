# Registering a Spotify developer app

Spotify's Web API rules changed a lot in 2024–2026. These notes reflect the
rules as of November 2026. Check the [Web API changelog](https://developer.spotify.com/documentation/web-api)
if something doesn't match.

## 1. Create the app

1. Log in at <https://developer.spotify.com/dashboard> with a **Spotify Premium**
   account. Since February 2026, Development Mode apps only work while the
   owner's Premium subscription is active.
2. Click **Create app** and fill in:
   - **App name:** Whose Song Is This?
   - **App description:** Party game: guess whose playlist a song came from
   - **Redirect URIs:** add every origin you'll play from (see below)
   - **Which API/SDKs are you planning to use?** tick **Web API**. Also tick
     **Web Playback SDK** if you plan to set `ENABLE_WEB_PLAYBACK_SDK=true`.
3. Accept the terms and save. Open **Settings** and copy the **Client ID**
   into `.env` as `SPOTIFY_CLIENT_ID`.

You do **not** need the client secret. The app uses Authorization Code with
PKCE, so the server exchanges the code without a secret. Keep the secret out
of this project.

## 2. Redirect URIs

Spotify requires an exact match, and plain-`http` redirect URIs must use a
**loopback IP**. `http://localhost` is rejected; use `http://127.0.0.1`.
Anything that isn't loopback must be `https`.

| Where you're running | Redirect URI to register | `PUBLIC_URL` |
|---|---|---|
| Local dev (`npm run dev`) | `http://127.0.0.1:5173/auth/callback` | `http://127.0.0.1:5173` |
| Local production build (`npm start`) | `http://127.0.0.1:3001/auth/callback` | `http://127.0.0.1:3001` |
| Tunnel / deployed | `https://your-host.example/auth/callback` | `https://your-host.example` |

You can register several URIs on one app.

## 3. Add your friends (Development Mode allowlist)

New apps start in **Development Mode**, which has two limits:

- **Only allowlisted users can sign in.** Open your app → **User Management**
  → add each friend's name and the **email address of their Spotify account**.
  Anyone not on the list gets a 403 after login. The game shows
  "Spotify blocked the sign-in…" when this happens.
- **At most 5 users per app.** That covers 5 Spotify-linked players. Extended
  Quota Mode, which lifts the cap, is currently only granted to registered
  organizations, not individuals.

Ways to play with more than 5 people:
- Players can join and vote without connecting Spotify. They just won't have
  songs in the pool.
- `ENABLE_DEMO_PLAYLISTS=true` lets extra players link a fake playlist. That's
  fine for testing, less fun for real.

## 4. API behaviors the code accounts for

| Spotify behavior | What the game does |
|---|---|
| `GET /playlists/{id}/tracks` was removed; use `/playlists/{id}/items`. Entries carry the track in `item`, not `track`. | `server/src/spotify.js` uses `/items` and reads `item ?? track`. |
| Playlist items are only readable for playlists the user **owns or collaborates on**. | The picker lists only those. Pasting someone else's link shows a friendly "save a copy first" message. |
| The playlist object's `tracks` field is now `items` (`items.total`). | Reads `items?.total ?? tracks?.total`. |
| `preview_url` is null for most apps created after Nov 2024. | The audio layer falls back to the Spotify embed player (see below). |
| `GET /me` no longer returns `product`, so Premium can't be detected up front. | The Web Playback SDK is tried. If it reports `account_error`, the game falls back silently. |
| Track `popularity`, `available_markets`, etc. were removed; `external_ids` (ISRC) is back. | ISRC is used to detect the same song across different releases ("shared songs"). |
| Refresh tokens now expire 6 months after the original authorization. | Doesn't matter much for game-night sessions. Expired sessions just ask the player to reconnect. |

## 5. How audio playback works

`client/src/audio/` tries these, in order:

1. **Web Playback SDK** (full tracks). Requires `ENABLE_WEB_PLAYBACK_SDK=true`,
   a Premium account, and a **desktop** browser, since the SDK doesn't run on
   mobile. The browser gets a short-lived access token from
   `/api/playback/token`. That's the only time a Spotify token leaves the
   server, and it's the user's own token. The refresh token never leaves.
2. **`preview_url`** 30-second clips through `<audio>`, if Spotify provides
   them for your app.
3. **Spotify Embed** (iFrame API), which needs no token. It plays the full
   track if the listener is logged into spotify.com in that browser, otherwise
   a preview. Mobile browsers may need a tap on the embed's own ▶ button. In
   hard mode the embed is blurred but still tappable.
4. **Title only**: if nothing can play, the audio device shows the title and
   artist so the host can read it out or hum it.

By default only the **host's device** plays music, since everyone is around
one table. The host can turn on "Play on every phone" in the lobby.
