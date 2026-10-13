/**
 * SentimentPulse AI - Theme Controller
 * Handles persistent theme switching between Light and Dark modes.
 * Checks localStorage and system preferences.
 */

// Toggle between light and dark mode and persist to localStorage
function toggleTheme() {
  const htmlEl = document.documentElement;
  const isDark = htmlEl.classList.contains('dark');
  const nextTheme = isDark ? 'light' : 'dark';

  if (nextTheme === 'dark') {
    htmlEl.classList.add('dark');
  } else {
    htmlEl.classList.remove('dark');
  }

  localStorage.setItem('theme', nextTheme);
  syncThemeToggleIcons(nextTheme === 'dark');
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { isDark: nextTheme === 'dark', theme: nextTheme } }));
}

// Synchronize any theme toggle buttons on the page with current theme state
function syncThemeToggleIcons(isDark) {
  const toggleButtons = document.querySelectorAll('.theme-toggle-btn');
  if (!toggleButtons || toggleButtons.length === 0) {
    return;
  }

  toggleButtons.forEach(btn => {
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');

    // Sun icon (shown in dark mode to switch to light)
    const sunIcons = btn.querySelectorAll('.theme-icon-sun');
    // Moon icon (shown in light mode to switch to dark)
    const moonIcons = btn.querySelectorAll('.theme-icon-moon');

    sunIcons.forEach(icon => {
      icon.classList.toggle('hidden', !isDark);
    });

    moonIcons.forEach(icon => {
      icon.classList.toggle('hidden', isDark);
    });
  });
}

// Listen for OS system theme changes when user has no stored preference
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      syncThemeToggleIcons(e.matches);
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { isDark: e.matches } }));
    }
  });
}

// Attach event listeners and sync icons safely across all states
function initThemeUI() {
  const toggleButtons = document.querySelectorAll('.theme-toggle-btn');
  if (toggleButtons && toggleButtons.length > 0) {
    const isDark = document.documentElement.classList.contains('dark');
    syncThemeToggleIcons(isDark);

    toggleButtons.forEach(btn => {
      btn.removeEventListener('click', toggleTheme);
      btn.addEventListener('click', toggleTheme);
    });
  }
}

// Expose on window for manual invocations
window.toggleTheme = toggleTheme;
window.initThemeUI = initThemeUI;
window.themeManager = {
  toggle: toggleTheme,
  init: initThemeUI,
  isDark: () => document.documentElement.classList.contains('dark')
};

// Handle both uncompleted and already-completed DOM ready states
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeUI);
} else {
  initThemeUI();
}
