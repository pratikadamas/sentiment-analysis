/**
 * Sentiment Pulse - Main Application Orchestrator (app.js)
 * Manages SPA view routing, sidebar state, mobile drawer, toasts, modals, and user profile.
 */

// Global Utility: HTML Escape
window.escapeHtml = function (str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
};

// Global Utility: Toast Notifications
window.showToast = function (message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `p-3.5 rounded-xl text-xs font-medium shadow-xl border flex items-center space-x-2.5 toast-animate transition-all max-w-sm pointer-events-auto`;

  let icon = 'ℹ️';
  let colors = 'bg-slate-900 text-white border-slate-800';

  if (type === 'success') {
    icon = '✅';
    colors = 'bg-emerald-950 text-emerald-200 border-emerald-800';
  } else if (type === 'error') {
    icon = '❌';
    colors = 'bg-rose-950 text-rose-200 border-rose-800';
  } else if (type === 'warning') {
    icon = '⚠️';
    colors = 'bg-amber-950 text-amber-200 border-amber-800';
  }

  toast.className += ` ${colors}`;
  toast.innerHTML = `
    <span>${icon}</span>
    <span class="flex-1">${window.escapeHtml(message)}</span>
    <button class="opacity-60 hover:opacity-100 ml-2 text-base font-bold">&times;</button>
  `;

  toast.querySelector('button').addEventListener('click', () => {
    toast.remove();
  });

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// Global Utility: Confirmation Modal
window.showConfirm = function (title, message, onConfirm) {
  const modal = document.getElementById('global-confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('confirm-modal-btn');
  const cancelBtn = document.getElementById('confirm-modal-cancel');

  if (!modal) {
    if (confirm(message)) onConfirm();
    return;
  }

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  modal.classList.remove('hidden');

  const cleanup = () => {
    modal.classList.add('hidden');
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
  };

  confirmBtn.onclick = () => {
    cleanup();
    onConfirm();
  };

  cancelBtn.onclick = cleanup;
};

// View Routing State
const App = {
  currentView: 'overview',
  views: ['overview', 'analyze', 'explorer', 'analytics', 'import-export'],

  async init() {
    this.bindNavigation();
    await this.loadUserProfile();

    // Route based on URL hash or default to overview
    const hash = window.location.hash.replace('#', '');
    if (this.views.includes(hash)) {
      this.switchView(hash);
    } else {
      this.switchView('overview');
    }

    // Listen to browser forward/backward navigation
    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '');
      if (this.views.includes(newHash) && newHash !== this.currentView) {
        this.switchView(newHash, false);
      }
    });

    // Initialize sub-controllers
    if (window.AnalyzeController) window.AnalyzeController.init();
    if (window.ExplorerController) window.ExplorerController.init();
    if (window.AnalyticsController) window.AnalyticsController.init();
    if (window.ImportsController) window.ImportsController.init();
  },

  async loadUserProfile() {
    try {
      const user = await window.api.getMe();
      const displayName = document.getElementById('user-display-name');
      const avatarInitial = document.getElementById('user-avatar-initial');
      const userEmail = document.getElementById('user-email');

      if (displayName) displayName.textContent = user.username;
      if (avatarInitial) avatarInitial.textContent = user.username.charAt(0).toUpperCase();
      if (userEmail) userEmail.textContent = user.email;

      localStorage.setItem('username', user.username);
    } catch {
      // Fallback to localStorage if offline
      const storedName = localStorage.getItem('username') || 'User';
      const displayName = document.getElementById('user-display-name');
      const avatarInitial = document.getElementById('user-avatar-initial');
      if (displayName) displayName.textContent = storedName;
      if (avatarInitial) avatarInitial.textContent = storedName.charAt(0).toUpperCase();
    }
  },

  bindNavigation() {
    // Navigation link clicks (both desktop and mobile)
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-view');
        if (targetView) {
          this.switchView(targetView);
          this.closeMobileDrawer();
        }
      });
    });

    // Mobile drawer toggle
    const openDrawerBtn = document.getElementById('mobile-drawer-open');
    const closeDrawerBtn = document.getElementById('mobile-drawer-close');
    const drawerBackdrop = document.getElementById('mobile-drawer-backdrop');

    if (openDrawerBtn) {
      openDrawerBtn.addEventListener('click', () => this.openMobileDrawer());
    }
    if (closeDrawerBtn) {
      closeDrawerBtn.addEventListener('click', () => this.closeMobileDrawer());
    }
    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', () => this.closeMobileDrawer());
    }

    // Logout Button Listener
    const logoutBtns = document.querySelectorAll('.logout-trigger');
    logoutBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await window.api.logout();
        } catch (err) {
          console.warn('Logout API error:', err);
        }
        localStorage.removeItem('username');
        localStorage.removeItem('email');
        window.location.href = '/login';
      });
    });
  },

  switchView(viewName, updateHash = true) {
    if (!this.views.includes(viewName)) return;
    this.currentView = viewName;

    if (updateHash) {
      window.location.hash = `#${viewName}`;
    }

    // Toggle view containers
    this.views.forEach(v => {
      const container = document.getElementById(`view-${v}`);
      if (container) {
        if (v === viewName) {
          container.classList.remove('hidden');
        } else {
          container.classList.add('hidden');
        }
      }
    });

    // Update active state in navbars
    document.querySelectorAll('.nav-link').forEach(link => {
      const target = link.getAttribute('data-view');
      const isSelected = target === viewName;

      if (isSelected) {
        link.classList.add('bg-indigo-50', 'text-indigo-600', 'dark:bg-indigo-500/10', 'dark:text-indigo-400', 'font-semibold');
        link.classList.remove('text-slate-600', 'dark:text-slate-400');
      } else {
        link.classList.remove('bg-indigo-50', 'text-indigo-600', 'dark:bg-indigo-500/10', 'dark:text-indigo-400', 'font-semibold');
        link.classList.add('text-slate-600', 'dark:text-slate-400');
      }
    });

    // Trigger subcontroller refreshes
    if (viewName === 'overview' && window.OverviewController) {
      window.OverviewController.refresh();
    } else if (viewName === 'explorer' && window.ExplorerController) {
      window.ExplorerController.loadData();
    } else if (viewName === 'analytics' && window.AnalyticsController) {
      window.AnalyticsController.loadAnalytics();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  openMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    if (drawer) drawer.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
  },

  closeMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    if (drawer) drawer.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }
};

window.App = App;

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
