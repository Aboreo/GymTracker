// Theme preference, per device (your Mac and phone can differ), stored in localStorage.
// "system" follows the OS; light/dark set data-theme on <html>, which tokens.css honours.

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'gymplan:theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme = getTheme()): void {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function setTheme(t: Theme): void {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // storage blocked: still applies for this session
  }
  applyTheme(t);
}
