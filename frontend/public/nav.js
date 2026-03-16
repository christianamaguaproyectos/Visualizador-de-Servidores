/**
 * Global Navigation Component
 * Injects a persistent sidebar navigation into every page.
 * Detects the current page and highlights the active link.
 */
(function () {
    'use strict';

    const NAV_ITEMS = [
        {
            id: 'home',
            label: 'Inicio',
            href: '/',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-7 9 7"/><path d="M5 12v8h5v-4h4v4h5v-8"/></svg>'
        },
        {
            id: 'fisicos',
            label: 'Servidores Físicos',
            href: '/fisicos',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/><circle cx="5" cy="5" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="19" r="1" fill="currentColor"/></svg>'
        },
        {
            id: 'virtuales',
            label: 'Servidores Virtuales',
            href: '/virtuales',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><rect x="5" y="6" width="6" height="3" rx="1"/><rect x="13" y="6" width="6" height="3" rx="1"/><rect x="5" y="11" width="6" height="3" rx="1"/><rect x="13" y="11" width="6" height="3" rx="1"/><path d="M8 18l4 2 4-2"/></svg>'
        },
        {
            id: 'monitoring',
            label: 'Monitoreo',
            href: '/monitoring.html',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>'
        },
        {
            id: 'users',
            label: 'Usuarios',
            href: '/users',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5z"/><path d="M2 22c0-4.42 3.58-8 8-8h4c4.42 0 8 3.58 8 8"/></svg>',
            adminOnly: true
        }
    ];

    function detectActivePage() {
        const path = window.location.pathname;
        if (path === '/' || path === '/home' || path === '/home.html') return 'home';
        if (path.includes('fisicos') || path === '/index.html') return 'fisicos';
        if (path.includes('virtuales') || path === '/virtual.html') return 'virtuales';
        if (path.includes('monitoring')) return 'monitoring';
        if (path.includes('users')) return 'users';
        return 'home';
    }

    function buildNav() {
        const activePage = detectActivePage();
        const isLoginPage = window.location.pathname.includes('login');

        // Don't inject nav on login page
        if (isLoginPage) return;

        const nav = document.createElement('nav');
        nav.className = 'global-nav';
        nav.setAttribute('role', 'navigation');
        nav.setAttribute('aria-label', 'Navegación principal');

        // Brand/logo area
        const brand = document.createElement('div');
        brand.className = 'global-nav__brand';
        brand.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="8" height="18" rx="1"/>
        <rect x="14" y="3" width="8" height="18" rx="1"/>
        <line x1="4" y1="7" x2="8" y2="7"/>
        <line x1="4" y1="11" x2="8" y2="11"/>
        <line x1="16" y1="7" x2="20" y2="7"/>
        <line x1="16" y1="11" x2="20" y2="11"/>
      </svg>
      <span class="global-nav__brand-text">Centro de Datos</span>
    `;

        nav.appendChild(brand);

        // Nav links
        const linksContainer = document.createElement('div');
        linksContainer.className = 'global-nav__links';

        NAV_ITEMS.forEach(item => {
            const link = document.createElement('a');
            link.href = item.href;
            link.className = 'global-nav__link';
            if (item.id === activePage) link.classList.add('active');
            if (item.adminOnly) {
                link.classList.add('admin-only');
                link.style.display = 'none'; // Hidden by default, shown for admins
            }
            link.setAttribute('data-nav-id', item.id);
            link.innerHTML = `
        <span class="global-nav__icon">${item.icon}</span>
        <span class="global-nav__label">${item.label}</span>
      `;
            linksContainer.appendChild(link);
        });

        nav.appendChild(linksContainer);

        // User section at bottom
        const userSection = document.createElement('div');
        userSection.className = 'global-nav__user';
        userSection.innerHTML = `
      <div class="global-nav__user-info">
        <span class="global-nav__user-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5z"/>
            <path d="M2 22c0-4.42 3.58-8 8-8h4c4.42 0 8 3.58 8 8"/>
          </svg>
        </span>
        <span class="global-nav__user-name" id="globalNavUserName">Cargando...</span>
      </div>
      <button class="global-nav__logout" id="globalNavLogout" title="Cerrar sesión">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    `;
        nav.appendChild(userSection);

        // Mobile toggle button
        const toggle = document.createElement('button');
        toggle.className = 'global-nav__toggle';
        toggle.setAttribute('aria-label', 'Abrir menú de navegación');
        toggle.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    `;

        // Insert into page
        document.body.prepend(nav);
        document.body.prepend(toggle);

        // Add body class for layout adjustment
        document.body.classList.add('has-global-nav');

        // --- Event handlers ---

        // Mobile toggle
        toggle.addEventListener('click', () => {
            nav.classList.toggle('open');
            toggle.classList.toggle('open');
        });

        // Close on overlay click (mobile)
        nav.addEventListener('click', (e) => {
            if (e.target === nav && nav.classList.contains('open')) {
                nav.classList.remove('open');
                toggle.classList.remove('open');
            }
        });

        // Logout
        const logoutBtn = document.getElementById('globalNavLogout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    const response = await fetch('/api/auth/logout', { method: 'POST' });
                    const data = await response.json();
                    if (data.success) {
                        window.location.href = '/login';
                    }
                } catch (e) {
                    console.error('Error en logout:', e);
                }
            });
        }

        // Load user info for nav
        loadNavUserInfo();
    }

    async function loadNavUserInfo() {
        try {
            const response = await fetch('/api/auth/user');
            const data = await response.json();
            if (data.success && data.user) {
                const nameEl = document.getElementById('globalNavUserName');
                if (nameEl) {
                    nameEl.textContent = data.user.name || data.user.username;
                }

                // Show admin-only links
                if (data.user.role === 'admin') {
                    document.querySelectorAll('.global-nav__link.admin-only').forEach(el => {
                        el.style.display = '';
                    });
                }
            }
        } catch (e) {
            console.error('Error loading nav user info:', e);
        }
    }

    // Collapsible fieldsets auto-initialization
    function initCollapsibleFieldsets() {
        document.querySelectorAll('.modal-body form fieldset').forEach((fs, i) => {
            if (fs.classList.contains('collapsible')) return;

            const legend = fs.querySelector('legend');
            if (!legend) return;

            fs.classList.add('collapsible');

            // Wrap all children after legend in a content div
            const content = document.createElement('div');
            content.className = 'fieldset-content';
            while (fs.children.length > 1) {
                content.appendChild(fs.children[1]);
            }
            fs.appendChild(content);

            // Collapse non-first fieldsets by default
            if (i > 0) fs.classList.add('collapsed');

            legend.addEventListener('click', () => {
                fs.classList.toggle('collapsed');
            });
        });
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            buildNav();
            // Observe modals for collapsible init
            const obs = new MutationObserver(() => initCollapsibleFieldsets());
            obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        });
    } else {
        buildNav();
        const obs = new MutationObserver(() => initCollapsibleFieldsets());
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }
})();
