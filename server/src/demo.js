// Fake playlists for local testing without Spotify (ENABLE_DEMO_PLAYLISTS=true).
// Each demo playlist is a random 15-song slice of a shared 36-song pool, so
// overlaps (shared songs) happen naturally. No audio: the client falls back
// to showing title + artist.
const POOL = [
  ['Neon Lullaby', 'The Static Hearts'], ['Paper Moons', 'Juno Vale'], ['Basement Disco', 'Kid Calypso'],
  ['Slow Burn Summer', 'Marlo & The Tides'], ['Concrete Garden', 'Okonkwo'], ['Velvet Static', 'Lumen Drive'],
  ['Late Bus Home', 'Pale Harbor'], ['Glitter in the Gutter', 'Saint Nova'], ['Cold Brew Heart', 'Tilly Fox'],
  ['Midnight Arcade', 'Pixel Saints'], ['Honey Static', 'The Wrens'], ['Sunday Detour', 'Rosa Quill'],
  ['Satellite Love', 'Echo Park Kids'], ['Backseat Oracle', 'Mina Sol'], ['Tangerine Skies', 'Wavelength'],
  ['Hollow Bones', 'Grey Atlas'], ['Disco Funeral', 'Velour'], ['Wild Card', 'Ruby Ray'],
  ['Night Swim', 'Coastal Ghosts'], ['Polaroid Fever', 'June Bug'], ['Static Bloom', 'Neon Fern'],
  ['Kitchen Dance', 'Big Feelings'], ['Rooftop Static', 'Avenue K'], ['Gold Teeth', 'Mx. Moreau'],
  ['Cassette Heart', 'Loop Daddy'], ['Thunder Mouth', 'Viking Bride'], ['Lemon Haze', 'Cielo'],
  ['Dial Tone Blues', 'Hank Payphone'], ['Ultraviolet', 'Starling'], ['Drive-Thru Romance', 'The Malls'],
  ['Moth to Flame', 'Ivory Coastline'], ['Fever Dream Club', 'DJ Lantern'], ['Garage Gospel', 'Saint Lot'],
  ['Pink Noise', 'Sora'], ['Hot Asphalt', 'Desert Hymns'], ['Afterglow Avenue', 'Nico Blue'],
];

let counter = 0;

export function demoPlaylist() {
  const n = ++counter;
  const shuffled = POOL.map((s, i) => ({ s, i, r: Math.random() })).sort((a, b) => a.r - b.r).slice(0, 15);
  return {
    meta: { id: `demo-${n}`, name: `Demo Mix #${n}`, image: null, owner: 'Demo', url: null, demo: true },
    tracks: shuffled.map(({ s: [name, artist], i }) => ({
      id: `demo-${i}`,
      demo: true,
      uri: null,
      name,
      artists: [artist],
      album: 'Demo Sessions',
      image: null,
      previewUrl: null,
      durationMs: 180_000,
      isrc: null,
    })),
  };
}
