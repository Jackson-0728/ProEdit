// Modern Dashboard Implementation
// This file contains the complete renderDashboard function with multi-view support

function renderDashboard() {
    const userName = user.email ? user.email.split('@')[0] : 'User';
    const userEmail = user.email || 'user@proedit.com';
    let currentView = 'dashboard'; // 'dashboard' or 'documents'

    app.innerHTML = `
    <div class="dashboard-layout">
      <!-- Sidebar -->
      <aside class="dashboard-sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-brand">ProEdit</h1>
        </div>
        
        <nav class="sidebar-nav">
          <a href="#" class="nav-link active" data-view="dashboard">
            <i class="iconoir-dashboard-dots"></i>
            <span>Dashboard</span>
          </a>
          <a href="#" class="nav-link" data-view="documents">
            <i class="iconoir-folder"></i>
            <span>All Documents</span>
          </a>
          <a href="#" class="nav-link disabled" data-view="templates">
            <i class="iconoir-grid-add"></i>
            <span>Templates</span>
          </a>
          <a href="#" class="nav-link disabled" data-view="settings">
            <i class="iconoir-settings"></i>
            <span>Settings</span>
          </a>
        </nav>
        
        <div class="sidebar-footer">
          <div class="user-profile">
            <div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>
            <div class="user-info">
              <div class="user-name">${userName}</div>
            </div>
          </div>
          <button class="logout-btn" id="logoutBtn" title="Sign out">
            <i class="iconoir-log-out"></i>
          </button>
        </div>
      </aside>
      
      <!-- Main Content Area -->
      <main class="dashboard-main">
        <div id="viewContainer"></div>
      </main>
    </div>
  `;

    // View rendering functions
    function renderDashboardView() {
        return `
      <div class="dashboard-view">
        <header class="view-header">
          <div>
            <h1 class="view-title">Welcome back, ${userName}!</h1>
            <p class="view-subtitle">Here's a look at your recent activity.</p>
          </div>
          <div class="search-wrapper-dash">
            <i class="iconoir-search"></i>
            <input type="text" class="search-input-dash" placeholder="Search documents..." id="dashSearch">
          </div>
        </header>
        
        <section class="quick-start-section">
          <h2 class="section-title">Quick Start</h2>
          <div class="quick-start-grid">
            <div class="quick-start-card" id="newDocCard">
              <div class="card-image card-gradient-blue"></div>
              <div class="card-content">
                <h3>New Blank Document</h3>
                <p>Start writing from scratch.</p>
              </div>
            </div>
            <div class="quick-start-card" id="templatesCard">
              <div class="card-image card-gradient-purple"></div>
              <div class="card-content">
                <h3>Browse Templates</h3>
                <p>Choose a pre-made layout.</p>
              </div>
            </div>
          </div>
        </section>
        
        <section class="recent-docs-section">
          <div class="section-header">
            <h2 class="section-title">Recent Documents</h2>
            <button class="btn-primary" id="createNewBtn">
              <i class="iconoir-plus"></i>
              Create New
            </button>
          </div>
          <div class="recent-docs-list" id="recentDocsList"></div>
        </section>
      </div>
    `;
    }

    function renderDocumentsView() {
        return `
      <div class="documents-view">
        <header class="view-header-docs">
          <h1 class="view-title">All Documents</h1>
          <div class="header-actions">
            <div class="search-wrapper-docs">
              <i class="iconoir-search"></i>
              <input type="text" class="search-input-docs" placeholder="Search documents..." id="docSearch">
            </div>
            <button class="btn-primary" id="newDocBtn">
              <i class="iconoir-plus"></i>
              New Document
            </button>
          </div>
        </header>
        
        <div class="view-controls">
          <div class="view-toggle">
            <button class="view-btn active" data-view="list">
              <i class="iconoir-list"></i>
            </button>
            <button class="view-btn" data-view="grid">
              <i class="iconoir-view-grid"></i>
            </button>
          </div>
          <button class="sort-btn">
            Sort by: Last Modified
            <i class="iconoir-nav-arrow-down"></i>
          </button>
        </div>
        
        <div class="documents-table-wrapper">
          <table class="documents-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Last Modified</th>
                <th>File Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="docsTableBody"></tbody>
          </table>
        </div>
      </div>
    `;
    }

    // Render documents in table
    function renderDocumentsTable() {
        const tbody = document.getElementById('docsTableBody');
        if (!tbody) return;

        if (documents.length === 0) {
            tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="4">
            <div class="empty-state">
              <i class="iconoir-page"></i>
              <p>No documents yet</p>
              <button class="btn-primary-small" onclick="document.getElementById('newDocBtn')?.click()">
                Create your first document
              </button>
            </div>
          </td>
        </tr>
      `;
            return;
        }

        tbody.innerHTML = documents.map(doc => `
      <tr class="doc-row" onclick="window.openDoc('${doc.id}')">
        <td>
          <div class="doc-name-cell">
            <i class="iconoir-page"></i>
            <span>${doc.title || 'Untitled Document'}</span>
          </div>
        </td>
        <td class="doc-date">${formatDate(doc.updated_at || doc.updatedAt)}</td>
        <td class="doc-size">${formatSize(doc.content?.length || 0)}</td>
        <td>
          <button class="icon-btn-delete" onclick="event.stopPropagation(); window.deleteDoc(event, '${doc.id}')" title="Delete">
            <i class="iconoir-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
    }

    // Render recent documents list
    function renderRecentDocs() {
        const container = document.getElementById('recentDocsList');
        if (!container) return;

        const recentDocs = documents.slice(0, 4);

        if (recentDocs.length === 0) {
            container.innerHTML = `
        <div class="empty-state-small">
          <p>No documents yet. Create one to get started!</p>
        </div>
      `;
            return;
        }

        container.innerHTML = recentDocs.map(doc => `
      <div class="recent-doc-item" onclick="window.openDoc('${doc.id}')">
        <div class="doc-info">
          <i class="iconoir-page"></i>
          <span class="doc-title">${doc.title || 'Untitled Document'}</span>
        </div>
        <span class="doc-time">Last edited: ${formatDate(doc.updated_at || doc.updatedAt)}</span>
        <button class="icon-btn-more">
          <i class="iconoir-more-horiz"></i>
        </button>
      </div>
    `).join('');
    }

    // Helper functions
    function formatDate(date) {
        const d = new Date(date);
        const now = new Date();
        const diff = now - d;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Switch views
    function switchView(view) {
        currentView = view;
        const container = document.getElementById('viewContainer');

        // Update nav active state
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.view === view);
        });

        // Render appropriate view
        if (view === 'dashboard') {
            container.innerHTML = renderDashboardView();
            renderRecentDocs();

            // Add event listeners for dashboard
            document.getElementById('newDocCard')?.addEventListener('click', window.createNewDoc);
            document.getElementById('createNewBtn')?.addEventListener('click', window.createNewDoc);
        } else if (view === 'documents') {
            container.innerHTML = renderDocumentsView();
            renderDocumentsTable();

            // Add event listener for new doc button
            document.getElementById('newDocBtn')?.addEventListener('click', window.createNewDoc);
        }
    }

    // Initial render
    switchView('dashboard');

    // Navigation event listeners
    document.querySelectorAll('.nav-link:not(.disabled)').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = e.currentTarget.dataset.view;
            switchView(view);
        });
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await signOut();
        renderLanding();
    });
}
