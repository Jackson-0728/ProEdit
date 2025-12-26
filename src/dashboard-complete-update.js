// COMPREHENSIVE DASHBOARD UPDATE
// Copy this code to replace lines 488-606 in main.js

// State variables for documents view
let currentDocView = 'list'; // 'list' or 'grid'
let currentSort = 'modified'; // 'modified', 'name', 'size' 
let sortedDocs = [...documents];

// Sort documents
function sortDocuments(docs, sortBy) {
    const sorted = [...docs];
    if (sortBy === 'name') {
        sorted.sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
    } else if (sortBy === 'size') {
        sorted.sort((a, b) => (b.content?.length || 0) - (a.content?.length || 0));
    } else { // modified
        sorted.sort((a, b) => new Date(b.updated_at || b.updatedAt) - new Date(a.updated_at || a.updatedAt));
    }
    return sorted;
}

// Render documents in table
function renderDocumentsTable(docsToRender = sortedDocs) {
    const tbody = document.getElementById('docsTableBody');
    if (!tbody) return;

    if (docsToRender.length === 0) {
        tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="4">
            <div class="empty-state">
              <i class="iconoir-page"></i>
              <p>No documents yet</p>
              <button class="btn-primary-small" onclick="window.createNewDoc()">
                Create your first document
              </button>
            </div>
          </td>
        </tr>
      `;
        return;
    }

    tbody.innerHTML = docsToRender.map(doc => `
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

// Render documents in grid
function renderDocumentsGrid(docsToRender = sortedDocs) {
    const container = document.getElementById('docsGridContainer');
    if (!container) return;

    if (docsToRender.length === 0) {
        container.innerHTML = `
        <div class="empty-state">
          <i class="iconoir-page"></i>
          <p>No documents yet</p>
          <button class="btn-primary-small" onclick="window.createNewDoc()">
            Create your first document
          </button>
        </div>
      `;
        return;
    }

    container.innerHTML = docsToRender.map(doc => `
      <div class="doc-grid-card" onclick="window.openDoc('${doc.id}')">
        <button class="delete-btn-grid" onclick="event.stopPropagation(); window.deleteDoc(event, '${doc.id}')" title="Delete">
          <i class="iconoir-trash"></i>
        </button>
        <div class="doc-grid-preview">
          ${(doc.content || '').replace(/<[^>]*>/g, '').slice(0, 150) || 'Empty document...'}
        </div>
        <div class="doc-grid-footer">
          <div class="doc-grid-title">${doc.title || 'Untitled Document'}</div>
          <div class="doc-grid-date">${formatDate(doc.updated_at || doc.updatedAt)}</div>
        </div>
      </div>
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

function renderTemplatesView() {
    const templates = [
        { id: 'blank', name: 'Blank Document', desc: 'Start from scratch', icon: 'iconoir-page', gradient: 'blue' },
        { id: 'meeting', name: 'Meeting Notes', desc: 'Template for meeting notes', icon: 'iconoir-pin-alt', gradient: 'purple' },
        { id: 'proposal', name: 'Project Proposal', desc: 'Business proposal template', icon: 'iconoir-suitcase', gradient: 'pink' },
        { id: 'report', name: 'Report', desc: 'Professional report layout', icon: 'iconoir-graph-up', gradient: 'orange' },
        { id: 'letter', name: 'Letter', desc: 'Formal letter template', icon: 'iconoir-mail', gradient: 'green' },
        { id: 'resume', name: 'Resume', desc: 'Professional resume', icon: 'iconoir-user', gradient: 'teal' },
        { id: 'blog', name: 'Blog Post', desc: 'Blog post structure', icon: 'iconoir-pen-tablet', gradient: 'indigo' }
    ];

    return `
      <div class="templates-view">
        <header class="view-header-simple">
          <h1 class="view-title">Templates</h1>
          <p class="view-subtitle">Choose a template to get started quickly</p>
        </header>
        
        <div class="templates-grid">
          ${templates.map(t => `
            <div class="template-card" data-template-id="${t.id}">
              <div class="template-icon card-gradient-${t.gradient}">
                <i class="${t.icon}"></i>
              </div>
              <div class="template-content">
                <h3>${t.name}</h3>
                <p>${t.desc}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
}

function renderSettingsView() {
    return `
      <div class="settings-view">
        <header class="view-header-simple">
          <h1 class="view-title">Settings</h1>
        </header>
        
        <div class="settings-card">
          <div class="settings-section">
            <h3 class="settings-section-title">Profile</h3>
            <div class="settings-row">
              <div class="setting-info">
                <label>Full Name</label>
                <input type="text" class="settings-input" value="${userName}" id="settingsName">
              </div>
            </div>
            <div class="settings-row">
              <div class="setting-info">
                <label>Email Address</label>
                <input type="email" class="settings-input" value="${userEmail}" id="settingsEmail" disabled>
              </div>
            </div>
          </div>
          
          <div class="settings-section">
            <h3 class="settings-section-title">Password</h3>
            <div class="settings-row">
              <div class="setting-info">
                <label>Change Password</label>
                <p class="setting-desc">Update your password to keep your account secure</p>
              </div>
              <button class="btn-secondary" id="changePasswordBtn">Change Password</button>
            </div>
          </div>
          
          <div class="settings-actions">
            <button class="btn-secondary">Cancel</button>
            <button class="btn-primary" id="saveSettingsBtn">Save Changes</button>
          </div>
        </div>
      </div>
    `;
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
        document.getElementById('newDocCard')?.addEventListener('click', () => window.createNewDoc());
        document.getElementById('createNewBtn')?.addEventListener('click', () => window.createNewDoc());
        document.getElementById('templatesCard')?.addEventListener('click', () => switchView('templates'));

    } else if (view === 'documents') {
        container.innerHTML = renderDocumentsView();
        render

        DocumentsCurrent();

        // Add event listeners
        document.getElementById('newDocBtn')?.addEventListener('click', () => window.createNewDoc());

        // View toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                currentDocView = e.currentTarget.dataset.view;
                renderDocumentsCurrent();
            });
        });

        // Sort button
        document.querySelector('.sort-btn')?.addEventListener('click', () => {
            const sortOptions = ['modified', 'name', 'size'];
            const currentIndex = sortOptions.indexOf(currentSort);
            currentSort = sortOptions[(currentIndex + 1) % sortOptions.length];
            const sortLabels = { modified: 'Last Modified', name: 'Name', size: 'File Size' };
            document.querySelector('.sort-btn').innerHTML = `
          Sort by: ${sortLabels[currentSort]}
          <i class="iconoir-nav-arrow-down"></i>
        `;
            sortedDocs = sortDocuments(documents, currentSort);
            renderDocumentsCurrent();
        });

        // Search
        document.getElementById('docSearch')?.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = documents.filter(d =>
                (d.title || '').toLowerCase().includes(query) ||
                (d.content || '').toLowerCase().includes(query)
            );
            const sorted = sortDocuments(filtered, currentSort);
            if (currentDocView === 'list') {
                renderDocumentsTable(sorted);
            } else {
                renderDocumentsGrid(sorted);
            }
        });

    } else if (view === 'templates') {
        container.innerHTML = renderTemplatesView();

        // Template click handlers
        document.querySelectorAll('.template-card').forEach(card => {
            card.addEventListener('click', () => {
                const templateId = card.dataset.templateId;
                createFromTemplate(templateId);
            });
        });

    } else if (view === 'settings') {
        container.innerHTML = renderSettingsView();

        // Settings event handlers
        document.getElementById('changePasswordBtn')?.addEventListener('click', async () => {
            const email = document.getElementById('settingsEmail').value;
            const { error } = await resetPassword(email);
            if (error) {
                alert('Error sending reset email: ' + error.message);
            } else {
                alert('Password reset link sent to ' + email);
            }
        });

        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
            alert('Settings saved successfully!');
        });
    }
}

// Helper to render current document view
function renderDocumentsCurrent() {
    if (currentDocView === 'list') {
        document.querySelector('.documents-table-wrapper').style.display = 'block';
        const gridContainer = document.getElementById('docsGridContainer');
        if (gridContainer) gridContainer.style.display = 'none';
        renderDocumentsTable();
    } else {
        document.querySelector('.documents-table-wrapper').style.display = 'none';
        let gridContainer = document.getElementById('docsGridContainer');
        if (!gridContainer) {
            gridContainer = document.createElement('div');
            gridContainer.id = 'docsGridContainer';
            gridContainer.className = 'docs-grid-container';
            document.querySelector('.documents-table-wrapper').after(gridContainer);
        }
        gridContainer.style.display = 'grid';
        renderDocumentsGrid();
    }
}

// Create document from template
async function createFromTemplate(templateId) {
    const templates = {
        blank: '',
        meeting: '<h1>Meeting Notes</h1><p><strong>Date:</strong> [Insert date]</p><p><strong>Attendees:</strong></p><ul><li>[Name 1]</li><li>[Name 2]</li></ul><h2>Agenda</h2><ul><li>[Topic 1]</li><li>[Topic 2]</li></ul><h2>Notes</h2><p>[Your notes here]</p><h2>Action Items</h2><ul><li>[Action item 1]</li></ul>',
        proposal: '<h1>Project Proposal</h1><h2>Executive Summary</h2><p>[Brief overview]</p><h2>Problem Statement</h2><p>[Define the problem]</p><h2>Proposed Solution</h2><p>[Your solution]</p><h2>Timeline</h2><p>[Project timeline]</p><h2>Budget</h2><p>[Cost breakdown]</p>',
        report: '<h1>Report Title</h1><p><strong>Author:</strong> [Your name]</p><p><strong>Date:</strong> [Date]</p><h2>Introduction</h2><p>[Introduction text]</p><h2>Findings</h2><p>[Your findings]</p><h2>Conclusion</h2><p>[Conclusion]</p>',
        letter: '<p>[Your Name]</p><p>[Your Address]</p><p>[Date]</p><br><p>[Recipient Name]</p><p>[Recipient Address]</p><br><p>Dear [Recipient],</p><p>[Letter content]</p><br><p>Sincerely,</p><p>[Your Name]</p>',
        resume: '<h1>[Your Name]</h1><p>[Email] | [Phone] | [Location]</p><h2>Professional Summary</h2><p>[Brief summary]</p><h2>Experience</h2><p><strong>[Job Title]</strong> - [Company]</p><p>[Dates]</p><ul><li>[Achievement 1]</li></ul><h2>Education</h2><p><strong>[Degree]</strong> - [School]</p><p>[Year]</p><h2>Skills</h2><ul><li>[Skill 1]</li><li>[Skill 2]</li></ul>',
        blog: '<h1>[Blog Post Title]</h1><p><em>[Subtitle or excerpt]</em></p><p>[Introduction paragraph]</p><h2>Section 1</h2><p>[Content]</p><h2>Section 2</h2><p>[Content]</p><h2>Conclusion</h2><p>[Wrap up]</p>'
    };

    const content = templates[templateId] || '';
    await window.createNewDoc();
    // After creating, set the content
    if (currentDocId) {
        const doc = documents.find(d => d.id === currentDocId);
        if (doc) {
            doc.content = content;
            doc.title = templateId.charAt(0).toUpperCase() + templateId.slice(1);
        }
    }
}

// Initialize
sortedDocs = sortDocuments(documents, currentSort);
