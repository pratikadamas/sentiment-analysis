/**
 * Sentiment Pulse - Main Application Orchestrator (app.js)
 * Manages SPA view routing, sidebar state, mobile drawer, toasts, modals, and user profile.
 */

// Global Utility: HTML Escape
window.escapeHtml = function (str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[tag] || tag
  );
};

// Global Utility: Toast Notifications
window.showToast = function (message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `p-3.5 rounded-xl text-xs font-medium shadow-xl border flex items-center space-x-2.5 toast-animate transition-all max-w-sm pointer-events-auto`;

  let icon = 'ℹ️';
  let colors = 'bg-slate-900 text-white border-slate-800';

  if (type === 'error') {
    icon = '❌';
    colors = 'bg-rose-950 text-rose-200 border-rose-800';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
  } else if (type === 'success') {
    icon = '✅';
    colors = 'bg-emerald-950 text-emerald-200 border-emerald-800';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
  } else if (type === 'warning') {
    icon = '⚠️';
    colors = 'bg-amber-950 text-amber-200 border-amber-800';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
  } else {
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
  }

  toast.className += ` ${colors}`;
  toast.innerHTML = `
    <span aria-hidden="true">${icon}</span>
    <span class="flex-1">${window.escapeHtml(message)}</span>
    <button aria-label="Dismiss notification" class="opacity-60 hover:opacity-100 ml-2 text-base font-bold p-1 rounded focus:outline-none focus:ring-1 focus:ring-white">&times;</button>
  `;

  container.appendChild(toast);

  if (window.MicroInteractions && typeof window.MicroInteractions.animateToast === 'function') {
    window.MicroInteractions.animateToast(toast);
  }

  const dismissToast = () => {
    if (window.MicroInteractions && typeof window.MicroInteractions.dismissToast === 'function') {
      window.MicroInteractions.dismissToast(toast);
    } else {
      toast.remove();
    }
  };

  const timer = setTimeout(dismissToast, 4000);

  toast.querySelector('button').addEventListener('click', () => {
    clearTimeout(timer);
    dismissToast();
  });
};

// Global Utility: Confirmation Modal with Accessible Focus Trap
window.showConfirm = function (
  title,
  message,
  onConfirm,
  returnFocusEl = typeof document !== 'undefined' ? document.activeElement : null
) {
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

  const dialog = modal.querySelector('[role="document"], .saas-card');
  if (window.MicroInteractions && typeof window.MicroInteractions.modalEnter === 'function') {
    window.MicroInteractions.modalEnter(modal, dialog);
  } else {
    modal.classList.remove('hidden');
  }

  let trap = null;
  const cleanup = () => {
    const onDone = () => {
      modal.classList.add('hidden');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      modal.onclick = null;
      if (trap) {
        trap.deactivate();
        trap = null;
      }
    };

    if (window.MicroInteractions && typeof window.MicroInteractions.modalExit === 'function') {
      window.MicroInteractions.modalExit(modal, dialog, onDone);
    } else {
      onDone();
    }
  };

  if (window.ModalHelper && typeof window.ModalHelper.createFocusTrap === 'function') {
    trap = window.ModalHelper.createFocusTrap(modal, {
      onEscape: cleanup,
      returnFocusEl,
      initialFocusEl: cancelBtn,
    });
    trap.activate();
  } else if (cancelBtn) {
    cancelBtn.focus();
  }

  confirmBtn.onclick = () => {
    cleanup();
    onConfirm();
  };

  cancelBtn.onclick = cleanup;
  modal.onclick = (e) => {
    if (e.target === modal) cleanup();
  };
};

// View Routing State
const App = {
  currentView: 'overview',
  views: ['overview', 'analyze', 'explorer', 'analytics', 'import-export', 'history'],

  async init() {
    // Initialize micro-interactions delegator
    if (window.MicroInteractions && typeof window.MicroInteractions.init === 'function') {
      window.MicroInteractions.init();
    }

    if (window.ThreeRuntime && typeof window.ThreeRuntime.init === 'function') {
      window.ThreeRuntime.init().catch((err) => console.warn('[App] 3D init warning:', err));
    }

    this.bindNavigation();
    this.initOfflineDetection();
    this.initServiceWorker();

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
    if (window.HistoryController) window.HistoryController.init();
  },

  bindNavigation() {
    // Navigation link clicks (both desktop and mobile)
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach((link) => {
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
  },

  async switchView(viewName, updateHash = true) {
    if (!this.views.includes(viewName)) return;
    const previousView = this.currentView;
    this.currentView = viewName;

    if (updateHash) {
      window.location.hash = `#${viewName}`;
    }

    // Lifecycle: Exit previous view animations and cleanup
    if (window.AnimationManager) {
      window.AnimationManager.exitView(previousView);
    }
    if (
      previousView === 'analytics' &&
      window.AnalyticsController &&
      typeof window.AnalyticsController.cleanup === 'function'
    ) {
      window.AnalyticsController.cleanup();
    }
    if (
      previousView === 'import-export' &&
      window.ImportsController &&
      typeof window.ImportsController.cleanup === 'function'
    ) {
      window.ImportsController.cleanup();
    }
    if (
      previousView === 'explorer' &&
      window.ExplorerController &&
      typeof window.ExplorerController.cleanup === 'function'
    ) {
      window.ExplorerController.cleanup();
    }
    if (
      previousView === 'history' &&
      window.HistoryController &&
      typeof window.HistoryController.cleanup === 'function'
    ) {
      window.HistoryController.cleanup();
    }

    const fromEl = document.getElementById(`view-${previousView}`);
    const toEl = document.getElementById(`view-${viewName}`);

    // Synchronous DOM swap contract
    const swap = () => {
      // Toggle view containers
      this.views.forEach((v) => {
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
      document.querySelectorAll('.nav-link').forEach((link) => {
        const target = link.getAttribute('data-view');
        const isSelected = target === viewName;

        if (isSelected) {
          link.setAttribute('aria-current', 'page');
          link.classList.add(
            'bg-indigo-50',
            'text-indigo-600',
            'dark:bg-indigo-500/10',
            'dark:text-indigo-400',
            'font-semibold'
          );
          link.classList.remove('text-slate-600', 'dark:text-slate-400');
        } else {
          link.removeAttribute('aria-current');
          link.classList.remove(
            'bg-indigo-50',
            'text-indigo-600',
            'dark:bg-indigo-500/10',
            'dark:text-indigo-400',
            'font-semibold'
          );
          link.classList.add('text-slate-600', 'dark:text-slate-400');
        }
      });
    };

    // Orchestrate visual view transition with fallback
    if (window.ViewTransitions && previousView !== viewName && fromEl && toEl) {
      await window.ViewTransitions.transition({
        fromView: previousView,
        toView: viewName,
        fromEl,
        toEl,
        swap,
      });
    } else {
      swap();
    }

    // Trigger subcontroller refreshes exactly once
    if (viewName === 'overview' && window.OverviewController) {
      window.OverviewController.refresh();
    } else if (viewName === 'explorer' && window.ExplorerController) {
      window.ExplorerController.loadData();
    } else if (viewName === 'analytics' && window.AnalyticsController) {
      window.AnalyticsController.loadAnalytics();
    } else if (viewName === 'history' && window.HistoryController) {
      window.HistoryController.loadHistory();
    }

    // Lifecycle: Enter new view animations
    if (window.AnimationManager) {
      window.AnimationManager.enterView(viewName);
    }

    // 3D Subsystem View Activation
    if (window.ThreeRuntime && typeof window.ThreeRuntime.transitionToView === 'function') {
      window.ThreeRuntime.transitionToView(viewName);
    }

    // Scroll to top (respecting reduced motion)
    const isReduced = window.AnimationManager && window.AnimationManager.isReducedMotion();
    window.scrollTo({ top: 0, behavior: isReduced ? 'auto' : 'smooth' });
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
  },

  initOfflineDetection() {
    const banner = document.getElementById('offline-banner');
    const statusText = document.getElementById('sidebar-status-text');
    const statusDot = document.getElementById('sidebar-status-dot');

    const updateStatus = (isOnline) => {
      if (banner) {
        if (isOnline) {
          banner.classList.add('hidden');
        } else {
          banner.classList.remove('hidden');
        }
      }

      if (statusText) {
        statusText.textContent = isOnline ? 'System Active' : 'Offline Shell';
        statusText.className = isOnline
          ? 'text-[10px] text-emerald-500 truncate block font-mono'
          : 'text-[10px] text-amber-500 truncate block font-mono';
      }

      if (statusDot) {
        statusDot.className = isOnline
          ? 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse'
          : 'w-2 h-2 rounded-full bg-amber-500';
      }
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      updateStatus(false);
    }

    window.addEventListener('online', () => {
      updateStatus(true);
      window.showToast('Back online! Live inference and analytics are now active.', 'success');
      if (this.currentView === 'overview' && window.OverviewController) {
        window.OverviewController.refresh();
      } else if (this.currentView === 'analytics' && window.AnalyticsController) {
        window.AnalyticsController.loadAnalytics();
      }
    });

    window.addEventListener('offline', () => {
      updateStatus(false);
      window.showToast(
        'You are offline. Application shell and local IndexedDB history remain available.',
        'warning'
      );
    });
  },

  initServiceWorker() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/static/js/sw.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  window.showToast(
                    'A new version of Sentiment Pulse is available. It will activate on next visit.',
                    'info'
                  );
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    });
  },
};

window.App = App;

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
