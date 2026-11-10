export const COLORS = ['#1DB954', '#FF4D6D', '#FFB703', '#3A86FF', '#B15EFF', '#FF7A00', '#00D1B2', '#F15BB5'];
export const AVATARS = ['🎧', '🎸', '🎤', '🥁', '🎹', '🎺', '🦄', '🐙', '🦊', '🐸', '👾', '🌶️', '🍕', '🪩', '🐝', '🌈'];

const PROFILE_KEY = 'wsit:profile';

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (p?.name !== undefined) return p;
  } catch {
    /* ignore */
  }
  return {
    name: '',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
  };
}

export function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

// "Alex", "Alex and Sam", "Alex, Sam and Jo"
export function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function sharedLine(names) {
  if (names.length === 2) return `Both ${names[0]} and ${names[1]} had this!`;
  return `${joinNames(names)} all had this!`;
}

export const possessive = (name) => (name.endsWith('s') ? `${name}’` : `${name}’s`);

export const buzz = (ms = 25) => navigator.vibrate?.(ms);

export const playerMap = (players) => Object.fromEntries(players.map((p) => [p.id, p]));
