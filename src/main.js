import './style.css';
import { generateContent, evaluateModels, generateLayouts } from './api/gemini.js';
import { CollaborationManager } from './api/collaboration.js';
import {
  supabase, signIn, signUp, signOut, signInWithProvider, resetPassword, getDocuments, createDocument, updateDocument, deleteDocument, submitFeedback, getPublicDocument, getSharedDocuments, shareDocument, getDocumentPermissions, addComment, getComments, updateComment, deleteComment
} from './api/supabase.js';


// State
let documents = [];
let currentDocId = null;
let user = null;
let collaborationManager = null;
let collabUsers = [];

// DOM Elements
const app = document.querySelector('#app');

// --- INITIALIZATION ---

window.renderLogin = renderLogin; // Expose to global scope for inline onclick handlers


async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  user = session?.user;

  // Check remember me preference
  if (user && sessionStorage.getItem('proedit_remember_me') === 'false') {
    // User didn't check remember me and came back, sign them out
    await signOut();
    user = null;
  }

  // Check URL for doc ID
  const urlParams = new URLSearchParams(window.location.search);
  const docId = urlParams.get('doc');

  if (user) {
    await migrateLocalDocsToSupabase();
    await loadDocs();

    // Check if we should open a specific doc
    if (docId) {
      const targetDoc = documents.find(d => d.id === docId);
      if (targetDoc) {
        currentDocId = docId;
        renderEditor();
        return; // Skip dashboard render
      }
    }

    // Check if tutorial should be shown
    const tutorialCompleted = localStorage.getItem('proedit_tutorial_completed');
    if (!tutorialCompleted) {
      renderDashboard();
      setTimeout(() => startTutorial(), 500);
    } else {
      renderDashboard();
    }
  } else if (docId) {
    // Not logged in but doc param exists -> try public doc
    await loadPublicDocument(docId);
  } else {
    renderLanding();
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    user = session?.user;
    if (user) {
      loadDocs();
      renderDashboard();
    } else {
      renderLanding();
    }
  });
}

// Handle remember me functionality on page close
window.addEventListener('beforeunload', async () => {
  if (sessionStorage.getItem('proedit_remember_me') === 'false') {
    // Don't actually sign out here as it's async and won't complete
    // Just clear the flag - we check it on init
  }
});


// --- VIEWS ---

function renderLanding() {
  app.innerHTML = `
  <div class="landing-page">
      <nav class="landing-nav">
        <div class="brand">ProEdit</div>
        <div class="nav-links">
          <button class="nav-btn primary" onclick="renderLogin()">Get Started</button>
        </div>
      </nav>
      
      <main class="landing-hero">
        <h1 class="hero-title">Writing, <span class="gradient-text">Reimagined</span> with AI.</h1>
        <p class="hero-subtitle">The advanced AI-powered editor for professionals. Write faster, edit smarter, and create content that stands out.</p>
        <div class="hero-cta">
          <button class="cta-btn" onclick="renderLogin()">Start Writing for Free</button>
          <button class="cta-btn secondary" onclick="window.open('https://github.com/Jackson-0728/ProEdit', '_blank')">View on GitHub</button>
        </div>
        
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon"><i class="iconoir-sparks"></i></div>
            <h3>AI Assistant</h3>
            <p>Generate content, summarize text, and get writing suggestions instantly.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon"><i class="iconoir-cloud"></i></div>
            <h3>Cloud Sync</h3>
            <p>Access your documents from anywhere. Your work is always safe.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon"><i class="iconoir-edit-pencil"></i></div>
            <h3>Rich Editor</h3>
            <p>A powerful, distraction-free editor with all the formatting tools you need.</p>
          </div>
        </div>
      </main>
    </div>
  `;
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <div class="brand-logo">ProEdit</div>
          <p class="brand-tagline">Your AI-powered text editing assistant.</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab active" id="loginTab">Log In</button>
          <button class="auth-tab" id="signupTab">Sign Up</button>
        </div>

        <div class="error-msg" id="errorMsg"></div>

        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label class="form-label">Email</label>
            <div class="input-with-icon">
              <i class="iconoir-mail"></i>
              <input type="email" class="form-input" id="email" placeholder="Enter your email" required>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Password</label>
            <div class="input-with-icon">
              <i class="iconoir-lock"></i>
              <input type="password" class="form-input" id="password" placeholder="Enter your password" required>
              <button type="button" class="password-toggle" id="passwordToggle">
                <svg class="eye-icon eye-closed" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
                <svg class="eye-icon eye-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>

          <div class="form-footer">
            <label class="remember-me">
              <input type="checkbox" id="rememberMe">
              <span>Remember me</span>
            </label>
            <a href="#" class="forgot-password">Forgot Password?</a>
          </div>

          <button type="submit" class="auth-btn">
            <span id="btnText">Log In</span>
          </button>
        </form>

        <div class="divider">
          <span>or continue with</span>
        </div>

        <div class="oauth-buttons">
          <button class="oauth-btn" id="googleBtn">
            <i class="iconoir-google-circle"></i>
            Google
          </button>
          <button class="oauth-btn" id="githubBtn">
            <i class="iconoir-github-circle"></i>
            GitHub
          </button>
        </div>
      </div>
    </div>
  `;

  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const form = document.getElementById('loginForm');
  const btn = document.querySelector('.auth-btn');
  const btnText = document.getElementById('btnText');
  const errorMsg = document.getElementById('errorMsg');
  const passwordInput = document.getElementById('password');
  const passwordToggle = document.getElementById('passwordToggle');
  const forgotPassword = document.querySelector('.forgot-password');
  const rememberMeContainer = document.querySelector('.remember-me');
  let isSignUp = false;

  // Password toggle
  passwordToggle.addEventListener('click', () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;

    const eyeClosed = passwordToggle.querySelector('.eye-closed');
    const eyeOpen = passwordToggle.querySelector('.eye-open');

    if (type === 'password') {
      eyeClosed.style.display = 'block';
      eyeOpen.style.display = 'none';
    } else {
      eyeClosed.style.display = 'none';
      eyeOpen.style.display = 'block';
    }
  });

  // Tab switching
  loginTab.addEventListener('click', () => {
    if (isSignUp) {
      isSignUp = false;
      loginTab.classList.add('active');
      signupTab.classList.remove('active');
      btnText.textContent = 'Log In';
      forgotPassword.style.display = 'block';
      rememberMeContainer.style.display = 'flex';
    }
  });

  signupTab.addEventListener('click', () => {
    if (!isSignUp) {
      isSignUp = true;
      signupTab.classList.add('active');
      loginTab.classList.remove('active');
      btnText.textContent = 'Sign Up';
      forgotPassword.style.display = 'none';
      rememberMeContainer.style.display = 'none';
    }
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    btn.disabled = true;
    btnText.textContent = 'Loading...';
    errorMsg.style.display = 'none';

    let result;
    if (isSignUp) {
      result = await signUp(email, password);
    } else {
      result = await signIn(email, password);

      // Handle remember me functionality
      if (result.data?.session && !rememberMe) {
        // Store a flag so we know to sign out on page close
        sessionStorage.setItem('proedit_remember_me', 'false');
      } else if (result.data?.session && rememberMe) {
        sessionStorage.setItem('proedit_remember_me', 'true');
      }
    }

    if (result.error) {
      console.error("Auth Error:", result.error);
      errorMsg.style.display = 'block';
      errorMsg.className = 'error-msg error';

      if (result.error.message.includes("Email not confirmed")) {
        errorMsg.innerHTML = `Please check your email to confirm your account.< br > <small>If you don't see it, check your spam folder.</small>`;
      } else {
        errorMsg.textContent = result.error.message;
      }

      btn.disabled = false;
      btnText.textContent = isSignUp ? 'Sign Up' : 'Log In';
    } else if (isSignUp && !result.data.session) {
      errorMsg.style.display = 'block';
      errorMsg.className = 'error-msg success';
      errorMsg.innerHTML = `Account created! Please check your email to confirm your account before logging in.`;
      btn.disabled = false;
      btnText.textContent = 'Sign Up';
    }
  });

  // Forgot password handler
  forgotPassword.addEventListener('click', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    if (!email) {
      errorMsg.style.display = 'block';
      errorMsg.className = 'error-msg error';
      errorMsg.textContent = 'Please enter your email address first.';
      return;
    }

    const confirmReset = confirm(`Send password reset email to ${email}?`);
    if (!confirmReset) return;

    const { error } = await resetPassword(email);

    errorMsg.style.display = 'block';
    if (error) {
      errorMsg.className = 'error-msg error';
      errorMsg.textContent = `Error: ${error.message} `;
    } else {
      errorMsg.className = 'error-msg success';
      errorMsg.innerHTML = `Password reset link sent to ${email} !<br><small>Check your inbox and spam folder.</small>`;
    }
  });

  document.getElementById('googleBtn').addEventListener('click', () => signInWithProvider('google'));
  document.getElementById('githubBtn').addEventListener('click', () => signInWithProvider('github'));
}

// Modern Dashboard Implementation
// This file contains the complete renderDashboard function with multi-view support

function renderDashboard() {
  // Domain Error Page Check
  if (window.location.hostname === 'app-proedit.vercel.app' || window.location.search.includes('forceError=true')) {
    app.innerHTML = `
         <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #111; color: #fff; font-family: system-ui, -apple-system, sans-serif;">
           <video autoplay loop muted playsinline style="max-width: 250px; width: 100%; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
             <source src="/assets/Caveman - 404 Page.mp4" type="video/mp4">
           </video>
           <h1 style="margin-top: 2rem; font-size: 2.5rem; font-weight: 700; background: linear-gradient(135deg, #fff 0%, #aaa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Server Maintenance</h1>
           <p style="margin-top: 1rem; font-size: 1.2rem; color: #888; max-width: 500px; line-height: 1.6;">There's a problem with our server. We will be back in less than a week.</p>
         </div>
       `;
    return;
  }

  const userName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'User');
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
            <i class="iconoir-home"></i>
            <span>Dashboard</span>
          </a>
          <a href="#" class="nav-link" data-view="documents">
            <i class="iconoir-folder"></i>
            <span>All Documents</span>
          </a>
          <a href="#" class="nav-link" data-view="templates">
            <i class="iconoir-layout-left"></i>
            <span>Templates</span>
          </a>
          <a href="#" class="nav-link" data-view="settings">
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
            <div class="quick-start-card" id="aiCreateCard" style="cursor: default;">
              <div class="card-image card-gradient-purple" style="display: flex; align-items: center; justify-content: center;">
                <i class="iconoir-sparks" style="font-size: 24px; color: white;"></i>
              </div>
              <div class="card-content" style="padding: 1rem;">
                <h3 style="margin-bottom: 0.5rem;">Create with AI</h3>
                <div class="ai-create-input-wrapper" style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; padding: 0.25rem 0.5rem; background: var(--bg);">
                  <input type="text" id="aiDocInput" placeholder="Describe your document idea..." style="border: none; outline: none; background: transparent; flex: 1; font-size: 0.85rem; padding: 0.25rem;">
                  <button id="aiDocBtn" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; color: var(--primary);"><i class="iconoir-arrow-right"></i></button>
                </div>
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
      <div class="recent-doc-item" onclick="window.openDoc('${doc.id}')" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-light); cursor: pointer; transition: background 0.2s;">
        <div class="doc-main-info" style="display: flex; align-items: center; gap: 1rem; flex: 1;">
          <div class="doc-icon" style="color: var(--text-muted); display: flex; align-items: center;">
            <i class="iconoir-page"></i>
          </div>
          <div class="doc-details" style="display: flex; flex-direction: column;">
            <span class="doc-title" style="font-weight: 500; color: var(--text-main); font-size: 0.95rem;">${doc.title || 'Untitled Document'}</span>
            <span class="doc-meta" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
              ${formatDate(doc.updated_at || doc.updatedAt)} • ${formatSize(doc.content?.length || 0)}
            </span>
          </div>
        </div>
        <div class="doc-actions">
          <button class="icon-btn-delete" onclick="event.stopPropagation(); window.deleteDoc(event, '${doc.id}')" title="Delete" style="background: none; border: none; padding: 4px; border-radius: 4px; cursor: pointer; color: var(--text-muted);">
            <i class="iconoir-trash"></i>
          </button>
        </div>
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
  function showLayoutSelection(layouts) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 800px; width: 90%;">
        <div class="modal-header">
          <h3>Select a Layout</h3>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 1rem; color: var(--text-muted);">Here are some options generated for you:</p>
          <div class="templates-grid">
            ${layouts.map((l, i) => `
              <div class="template-card layout-option" data-index="${i}">
                <div class="template-icon card-gradient-blue">
                  <i class="iconoir-sparks"></i>
                </div>
                <div class="template-content">
                  <h3>${l.title || 'Option ' + (i + 1)}</h3>
                  <p>${l.description || 'AI Generated Layout'}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('.layout-option').forEach(card => {
      card.addEventListener('click', async () => {
        const index = card.dataset.index;
        const layout = layouts[index];
        modal.remove();

        await window.createNewDoc();
        // The doc is now created and opened (currentDocId is set)
        if (currentDocId) {
          const doc = documents.find(d => d.id === currentDocId);
          if (doc) {
            doc.content = layout.content;
            doc.title = layout.title || 'Untitled Document';
            await updateCurrentDoc({ content: layout.content, title: doc.title });
            renderEditor(); // Re-render with new content
          }
        }
      });
    });
  }

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
      // document.getElementById('templatesCard')?.addEventListener('click', () => switchView('templates'));

      const handleAiCreate = async () => {
        const input = document.getElementById('aiDocInput');
        const prompt = input?.value.trim();
        if (!prompt) return;

        const btn = document.getElementById('aiDocBtn');
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i class="iconoir-activity icon-spin"></i>';
        input.disabled = true;

        try {
          // Use generateLayouts from api/gemini.js
          const layouts = await generateLayouts(prompt);

          if (layouts && layouts.length > 0) {
            showLayoutSelection(layouts);
          } else {
            // Fallback or error
            alert('Could not generate layouts. Please try again.');
          }
        } catch (e) {
          console.error(e);
          alert('Error: ' + e.message);
        } finally {
          btn.innerHTML = originalIcon;
          input.disabled = false;
          input.focus();
        }
      };

      document.getElementById('aiDocBtn')?.addEventListener('click', handleAiCreate);
      document.getElementById('aiDocInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAiCreate();
      });

    } else if (view === 'documents') {
      container.innerHTML = renderDocumentsView();
      renderDocumentsCurrent();

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

      document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
        const newName = document.getElementById('settingsName').value;
        const btn = document.getElementById('saveSettingsBtn');
        const originalText = btn.innerText;

        btn.innerText = 'Saving...';
        btn.disabled = true;

        try {
          const { data, error } = await supabase.auth.updateUser({
            data: { full_name: newName }
          });

          if (error) throw error;

          // Update local state
          user = data.user;

          // Update UI immediately
          // 1. Sidebar profile
          const sidebarName = document.querySelector('.user-name');
          if (sidebarName) sidebarName.innerText = newName;

          // 2. Avatar initital
          const avatar = document.querySelector('.user-avatar');
          if (avatar && newName) avatar.innerText = newName.charAt(0).toUpperCase();

          // 3. Welcome title if visible
          const welcomeTitle = document.querySelector('.view-title');
          if (welcomeTitle && welcomeTitle.innerText.includes('Welcome back')) {
            welcomeTitle.innerText = `Welcome back, ${newName}!`;
          }

          alert('Settings saved successfully!');
        } catch (error) {
          console.error('Error updating settings:', error);
          alert('Failed to save settings: ' + error.message);
        } finally {
          btn.innerText = originalText;
          btn.disabled = false;
        }
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

async function renderEditor() {
  const doc = documents.find(d => d.id === currentDocId);
  if (!doc) return;

  // Init Collaboration
  if (collaborationManager) collaborationManager.leave();

  if (user) {
    collaborationManager = new CollaborationManager(currentDocId, user, {
      onPresenceUpdate: updateAvatars,
      onCursorUpdate: renderRemoteCursor,
      onChatMessage: addChatMessage,
      onTextUpdate: (payload) => {
        const editor = document.getElementById('editor');
        if (editor) {
          const selection = window.getSelection();
          const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
          editor.innerHTML = payload.content;
          // Very basic cursor preservation attempt (often fails on big diffs)
          if (range) selection.addRange(range);
        }
      }
    });
  }

  // Fetch permissions
  let userRole = 'viewer';
  if (user && doc.user_id === user.id) {
    userRole = 'owner';
  } else if (user) {
    const { data: perms } = await getDocumentPermissions(currentDocId);
    const myPerm = perms?.find(p => p.user_email === user.email);
    if (myPerm) userRole = myPerm.role;
  }

  // Enforce read-only for viewers/commenters (they can comment but not edit text)
  const isEditable = userRole === 'owner' || userRole === 'editor';
  const contentEditableState = isEditable ? 'true' : 'false';

  app.innerHTML = `
  <div class="editor-layout">
    <!--Beta Top Bar-->
    <div id="betaBar" style="background: #18181b; color: white; padding: 0.5rem 1rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <span style="background: #3b82f6; padding: 0.1rem 0.4rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: bold;">BETA</span>
        <span>ProEdit is currently in beta. We appreciate your feedback!</span>
      </div>
      <div style="display: flex; gap: 1rem; align-items: center;">
        <button id="betaFeedback" style="background: transparent; color: white; border: 1px solid #3f3f46; padding: 0.25rem 0.75rem; border-radius: 0.25rem; cursor: pointer;">Give Feedback</button>
        <button id="closeBeta" style="background: transparent; border: none; color: #a1a1aa; cursor: pointer; font-size: 1.2rem;">×</button>
      </div>
    </div>
    <!--Top Bar: Menu + Toolbar-->
    <div class="top-bar">
      <div class="menu-bar">
        <button class="icon-btn" id="backBtn" title="Back to Dashboard" style="margin-right: 1rem;">
          <i class="iconoir-arrow-left"></i>
        </button>
        <div class="doc-info">
          <input type="text" class="doc-title-input" id="docTitle" value="${doc.title || 'Untitled Document'}" placeholder="Untitled Document">
        </div>
        <div style="flex: 1"></div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button class="prostyle-btn" id="proStyleBtn" title="Generate HTML components with AI">
            <span class="prostyle-icon">AI</span>
            <span>ProStyle</span>
          </button>
          <button class="deploy-btn ${doc.is_public ? 'published' : ''}" id="deployBtn" title="Deploy to Web">
            <i class="iconoir-rocket"></i>
            <span id="deployText">${doc.is_public ? 'Published' : 'Deploy'}</span>
          </button>

          <!-- Collaborative Tools -->
          <div class="avatars-stack" id="avatarStack"></div>

          <button class="deploy-btn" id="shareBtn" style="border-color: var(--primary); color: var(--primary);">
            <i class="iconoir-share-android"></i> Share
          </button>
          <button class="deploy-btn" id="chatToggleBtn" style="border-color: var(--text-muted); color: var(--text-muted);">
            <i class="iconoir-chat-bubble"></i> Chat
          </button>
          <button class="deploy-btn" id="commentsToggleBtn" style="border-color: var(--text-muted); color: var(--text-muted);" title="Comments">
            <i class="iconoir-message-text"></i> Comment
          </button>

        </div>
      </div>

      <!-- Toolbar (Existing) -->
      <div class="toolbar">
        <div class="toolbar-group">
          <button class="tool-btn" onclick="document.execCommand('undo')" title="Undo">
            <i class="iconoir-undo"></i>
          </button>
          <button class="tool-btn" onclick="document.execCommand('redo')" title="Redo">
            <i class="iconoir-redo"></i>
          </button>
        </div>

        <div class="toolbar-group">
          <select class="tool-select" id="fontFamily" title="Font">
            <option value="Arial">Arial</option>
            <option value="Inter">Inter</option>
            <option value="Roboto">Roboto</option>
            <option value="Open Sans">Open Sans</option>
            <option value="Merriweather">Merriweather</option>
            <option value="Playfair Display">Playfair Display</option>
            <option value="Courier Prime">Courier Prime</option>
            <option value="Comic Neue">Comic Neue</option>
            <option value="Lobster">Lobster</option>
            <option value="Pacifico">Pacifico</option>
            <option value="Oswald">Oswald</option>
          </select>
          <select class="tool-select" id="fontSize" title="Font Size">
            <option value="1">10px</option>
            <option value="2">13px</option>
            <option value="3" selected>16px</option>
            <option value="4">18px</option>
            <option value="5">24px</option>
            <option value="6">32px</option>
            <option value="7">48px</option>
          </select>
        </div>

        <div class="toolbar-group">
          <button class="tool-btn" data-cmd="bold" title="Bold">
            <i class="iconoir-bold"></i>
          </button>
          <button class="tool-btn" data-cmd="italic" title="Italic">
            <i class="iconoir-italic"></i>
          </button>
          <button class="tool-btn" data-cmd="underline" title="Underline">
            <i class="iconoir-underline"></i>
          </button>
        </div>

        <div class="toolbar-group">
          <button class="tool-btn" data-cmd="justifyLeft" title="Align Left">
            <i class="iconoir-align-left"></i>
          </button>
          <button class="tool-btn" data-cmd="justifyCenter" title="Align Center">
            <i class="iconoir-align-center"></i>
          </button>
          <button class="tool-btn" data-cmd="justifyRight" title="Align Right">
            <i class="iconoir-align-right"></i>
          </button>
          <button class="tool-btn" data-cmd="justifyFull" title="Justify">
            <i class="iconoir-align-justify"></i>
          </button>
        </div>

        <div class="toolbar-group">
          <button class="tool-btn" data-cmd="insertUnorderedList" title="Bullet List">
            <i class="iconoir-list"></i>
          </button>
          <button class="tool-btn" data-cmd="insertOrderedList" title="Numbered List">
            <i class="iconoir-numbered-list-left"></i>
          </button>
        </div>

        <div class="toolbar-group">
          <button class="tool-btn" id="pageBreakBtn" title="Insert Page Break">
            <i class="iconoir-page-search"></i>
          </button>
        </div>

        <div class="toolbar-group">
          <div class="dropdown">
            <button class="tool-btn" id="exportBtn" title="Export">
              <i class="iconoir-download"></i>
            </button>
            <div class="dropdown-content">
              <button onclick="window.exportDoc('pdf')">PDF (.pdf)</button>
              <button onclick="window.exportDoc('word')">Word (.doc)</button>
              <button onclick="window.exportDoc('md')">Markdown (.md)</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="editor-scroll-container" id="editorScroll">
      <div id="editor" contenteditable="${contentEditableState}" spellcheck="false" data-role="${userRole}">
        ${doc.content || ''}
      </div>

      <!-- Comments Sidebar -->
      <div class="comments-sidebar" id="commentsSidebar" style="display: none;">
        <div class="comments-header">
          <span>Comments</span>
          <button class="close-btn" id="closeComments">×</button>
        </div>
        <div class="comments-list" id="commentsList"></div>
        <div class="comment-input-area">
          <textarea placeholder="Add a comment..." id="newCommentInput"></textarea>
          <button class="primary-btn" id="addCommentBtn">Post</button>
        </div>
      </div>
    </div>

    <!-- Existing Modals & Buttons -->
    <button class="ai-trigger" onclick="document.querySelector('.ai-popup').classList.toggle('visible')">
      <i class="iconoir-sparks"></i>
    </button>

    <!-- Chat Widget -->
    <div class="chat-widget" id="chatWidget">
      <div class="chat-header">
        <span>Chat</span>
        <div class="ai-controls">
          <button class="ai-btn-icon" id="clearCollabChat" title="Clear chat"><i class="iconoir-trash"></i></button>
          <button class="ai-btn-icon" id="closeCollabChat" title="Close">×</button>
        </div>
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" id="chatInput" placeholder="Type a message...">
          <button class="ai-send" type="button" style="width: 32px; height: 32px;"><i class="iconoir-send"></i></button>
      </div>
    </div>

    <!-- Share Modal -->
    <div class="modal-overlay" id="shareModal" style="display: none;">
      <div class="modal-card" style="max-width: 450px;">
        <div class="modal-header">
          <h3>Share Document</h3>
          <button class="close-btn" onclick="document.getElementById('shareModal').style.display='none'">×</button>
        </div>
        <div class="modal-body">
          <div class="share-input-group">
            <input type="email" class="share-input" id="shareEmail" placeholder="Enter email address">
              <select class="share-role-select" id="shareRole">
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="editor">Editor</option>
              </select>
              <button class="primary-btn" id="sendInviteBtn" style="padding: 0.5rem 1rem;">Invite</button>
          </div>

          <div style="margin-top: 1rem;">
            <h4 style="font-size: 0.9rem; margin-bottom: 0.5rem;">People with access</h4>
            <div class="collaborators-list" id="permList">
              <!-- Populated via JS -->
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Trigger -->
    <button class="ai-trigger" id="aiTrigger" title="Ask AI">
      <i class="iconoir-sparks"></i>
    </button>

    <!-- Slash Menu -->
    <div class="slash-menu" id="slashMenu">
      <div class="slash-item" data-action="continue">
        <div class="slash-info">
          <div class="slash-title">Continue writing</div>
          <div class="slash-desc">Let AI finish your thought</div>
        </div>
      </div>
      <div class="slash-item" data-action="summarize">
        <div class="slash-info">
          <div class="slash-title">Summarize</div>
          <div class="slash-desc">Create a brief summary</div>
        </div>
      </div>
      <div class="slash-item" data-action="improve">
        <div class="slash-info">
          <div class="slash-title">Improve writing</div>
          <div class="slash-desc">Fix grammar and style</div>
        </div>
      </div>
    </div>

    <!-- AI Chat Popup -->
    <div class="ai-popup" id="aiPopup" style="display: none;">
      <div class="ai-header" id="aiHeader" style="cursor: move;">
        <div class="ai-title"><i class="iconoir-sparks"></i> AI Assistant</div>
        <div class="ai-controls">
          <select class="model-selector" id="aiModelSelector" title="Select AI Model">
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          </select>
          <button class="ai-btn-icon" id="clearAiChat" title="Clear chat"><i class="iconoir-trash"></i></button>
          <button class="ai-btn-icon" id="expandAi" title="Expand"><i class="iconoir-expand"></i></button>
          <button class="ai-btn-icon" id="closeAi" title="Close"><i class="iconoir-xmark-circle"></i></button>
        </div>
      </div>
      <div class="ai-messages" id="aiMessages">
        <!-- Messages will appear here -->
      </div>
      <div class="ai-input-area">
        <input type="text" class="ai-input" id="aiInput" placeholder="Ask AI to write, edit, or summarize...">
          <button class="ai-send" id="aiSend"><i class="iconoir-send"></i></button>
      </div>
    </div>

    <!-- ProStyle Modal -->
    <div class="modal-overlay" id="proStyleModal" style="display: none;">
      <div class="modal-card prostyle-card">
        <div class="modal-header">
          <h3>ProStyle Component Builder</h3>
          <button class="close-btn" id="closeProStyle">×</button>
        </div>
        <div class="modal-body">
          <p class="prostyle-subtitle">Describe the component you want and ProStyle will drop clean HTML into your doc.</p>
          <div class="form-group">
            <label>AI Model</label>
            <select class="model-selector" id="proStyleModelSelector" style="width: 100%;">
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            </select>
          </div>
          <textarea id="proStylePrompt" class="form-input" rows="3" placeholder="e.g., A two-column hero with headline, bullet list, and CTA button"></textarea>
          <div class="prostyle-footer">
            <div id="proStyleStatus" class="prostyle-status" style="display: none;"></div>
            <div class="prostyle-actions">
              <button class="ghost-btn" id="cancelProStyle" type="button">Cancel</button>
              <button class="primary-btn" id="runProStyle" type="button">Generate & Insert</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Evaluation Modal -->
    <div class="modal-overlay" id="evalModal" style="display: none; ">
      <div class="modal-card eval-card">
        <div class="modal-header">
          <h3>Model Evaluation</h3>
          <button class="close-btn" id="closeEval">×</button>
        </div>
        <div class="modal-body">
          <p class="eval-subtitle">Compare all 3 Gemini models side-by-side for speed and quality.</p>
          <div class="form-group">
            <textarea id="evalPrompt" class="form-input" rows="3" placeholder="Enter a prompt to test all models..."></textarea>
          </div>
          <div class="eval-actions">
            <button class="primary-btn" id="runEval" type="button">Run Evaluation</button>
          </div>

          <div class="eval-results" id="evalResults" style="display: none;">
            <div class="eval-grid">
              <!-- Flash -->
              <div class="eval-col" id="col-flash">
                <div class="eval-col-header">
                  <span class="model-name">Gemini 2.5 Flash</span>
                  <span class="eval-metric time" id="time-flash">-</span>
                </div>
                <div class="eval-content" id="res-flash"></div>
                <div class="eval-meta" id="meta-flash"></div>
              </div>

              <!-- Flash Lite -->
              <div class="eval-col" id="col-lite">
                <div class="eval-col-header">
                  <span class="model-name">Gemini 2.5 Flash Lite</span>
                  <span class="eval-metric time" id="time-lite">-</span>
                </div>
                <div class="eval-content" id="res-lite"></div>
                <div class="eval-meta" id="meta-lite"></div>
              </div>

              <!-- Pro -->
              <div class="eval-col" id="col-pro">
                <div class="eval-col-header">
                  <span class="model-name">Gemini 2.5 Pro</span>
                  <span class="eval-metric time" id="time-pro">-</span>
                </div>
                <div class="eval-content" id="res-pro"></div>
                <div class="eval-meta" id="meta-pro"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Feedback Modal -->
    <div class="modal-overlay" id="feedbackModal" style="display: none;">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Send Feedback</h3>
          <button class="close-btn" id="closeFeedback">×</button>
        </div>
        <div class="modal-body">
          <form id="feedbackForm">
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="fbName" class="form-input" required>
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="fbEmail" class="form-input" required>
            </div>
            <div class="form-group">
              <label>Rating</label>
              <div class="rating-input">
                <input type="radio" name="rating" value="5" id="r5"><label for="r5">★</label>
                  <input type="radio" name="rating" value="4" id="r4"><label for="r4">★</label>
                    <input type="radio" name="rating" value="3" id="r3"><label for="r3">★</label>
                      <input type="radio" name="rating" value="2" id="r2"><label for="r2">★</label>
                        <input type="radio" name="rating" value="1" id="r1"><label for="r1">★</label>
                        </div>
                      </div>
                      <div class="form-group">
                        <label>Message</label>
                        <textarea id="fbMessage" class="form-input" rows="4" required></textarea>
                      </div>
                      <button type="submit" class="primary-btn" style="width: 100%; margin-top: 1rem;">Submit Feedback</button>
                    </form>
                  </div>
              </div>
            </div>

            <!-- Help Button & Panel -->
            <button class="help-trigger" id="helpTrigger" title="Help">
              <i class="iconoir-help-circle"></i>
              <span>Help</span>
            </button>

            <div class="help-panel" id="helpPanel" style="display: none;">
              <div class="help-panel-header">
                <h3>Need Help?</h3>
                <button class="close-btn" id="closeHelp">×</button>
              </div>
              <div class="help-panel-body">
                <button class="help-option" id="openAiChatBtn">
                  <i class="iconoir-sparks"></i>
                  <div>
                    <div class="help-option-title">Ask AI Assistant</div>
                    <div class="help-option-desc">Get help with how to use ProEdit</div>
                  </div>
                </button>
                <button class="help-option" id="restartTutorialBtn">
                  <i class="iconoir-graduation-cap"></i>
                  <div>
                    <div class="help-option-title">Restart Tutorial</div>
                    <div class="help-option-desc">Take the guided tour again</div>
                  </div>
                </button>
              </div>
            </div>

            <!-- Help Chat Popup -->
            <div class="help-chat-popup" id="helpChatPopup">
              <div class="help-chat-header" id="helpChatHeader">
                <div class="help-chat-title">
                  <i class="iconoir-sparks"></i>
                  <span>ProEdit Assistant</span>
                </div>
                <div class="ai-controls">
                  <button class="ai-btn-icon" id="clearHelpChat" title="Clear chat"><i class="iconoir-trash"></i></button>
                  <button class="ai-btn-icon" id="closeHelpChat" title="Close">×</button>
                </div>
              </div>
              <div class="help-chat-messages" id="helpChatMessages">
                <div class="ai-message ai">
                  Hello! I'm your ProEdit guide. Ask me anything about using the editor, formatting, or deploying your documents.
                </div>
              </div>
              <div class="help-chat-input-area">
                <input type="text" class="ai-input" id="helpChatInput" placeholder="How do I...">
                  <button class="help-chat-send" id="helpChatSend">
                    <i class="iconoir-send"></i>
                  </button>
              </div>
            </div>

            <!-- Text Selection Edit Popup -->
            <div class="text-edit-popup" id="textEditPopup">
              <button class="edit-popup-btn" data-action="improve">
                <i class="iconoir-sparks"></i>
                <span>Improve</span>
              </button>
              <button class="edit-popup-btn" data-action="simplify">
                <i class="iconoir-text"></i>
                <span>Simplify</span>
              </button>
              <button class="edit-popup-btn" data-action="expand">
                <i class="iconoir-plus-circle"></i>
                <span>Expand</span>
              </button>
              <div class="edit-popup-divider"></div>
              <button class="edit-popup-btn" data-action="custom">
                <i class="iconoir-edit-pencil"></i>
                <span>Custom Edit...</span>
              </button>
              <div class="edit-popup-custom" id="editPopupCustom">
                <input type="text" class="edit-popup-input" id="editPopupInput" placeholder="Describe how to edit...">
                  <div class="edit-popup-actions">
                    <button class="edit-popup-cancel" id="editPopupCancel">Cancel</button>
                    <button class="edit-popup-submit" id="editPopupSubmit">Apply</button>
                  </div>
              </div>
            </div>
        </div>
        `;

  setupEditorListeners();
  setupBetaBar();

  // Page Break Listener
  document.getElementById('pageBreakBtn').addEventListener('click', () => {
    const pageBreak = '<div class="page-break" contenteditable="false"></div>';
    document.execCommand('insertHTML', false, pageBreak);
  });
}

// --- ACTIONS ---

async function createNewDoc() {
  const newDoc = {
    id: Date.now().toString(),
    user_id: user.id,
    title: 'Untitled Document',
    content: '',
    is_public: false
  };
  const { data, error } = await createDocument(newDoc);
  if (error) {
    console.error('Error creating document:', error);
    alert('Failed to create document');
    return;
  }
  documents.unshift(data);
  openDoc(data.id);
}

// Expose to window for onclick handlers
window.createNewDoc = createNewDoc;

function openDoc(id) {
  currentDocId = id;
  // Update URL without reloading
  const newUrl = `${window.location.origin}?doc=${id}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
  renderEditor();
}

function closeDoc() {
  currentDocId = null;
  // Reset URL
  const newUrl = window.location.origin;
  window.history.pushState({ path: newUrl }, '', newUrl);
  renderDashboard();
}

window.openDoc = openDoc;
window.closeDoc = closeDoc;

window.deleteDoc = async (e, id) => {
  e.stopPropagation();
  if (confirm('Are you sure you want to delete this document?')) {
    const { error } = await deleteDocument(id);
    if (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
      return;
    }
    documents = documents.filter(d => d.id !== id);
    renderDashboard();
  }
};

async function loadDocs() {
  if (!user) return;

  // Load own docs
  const { data: ownDocs, error: ownError } = await getDocuments();
  if (ownError) console.error('Error loading own documents:', ownError);

  // Load shared docs
  const { data: sharedDocs, error: sharedError } = await getSharedDocuments();
  if (sharedError) console.error('Error loading shared documents:', sharedError);

  // Merge and sort
  const allDocs = [...(ownDocs || []), ...(sharedDocs || [])];
  // Remove duplicates just in case (e.g. if I own it but it's also 'shared' with me explicitly?)
  const uniqueDocs = Array.from(new Map(allDocs.map(item => [item.id, item])).values());

  // Sort by updated_at
  uniqueDocs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  documents = uniqueDocs;
}

// Keep for backward compatibility with migration
function saveDocs() {
  // Documents are now auto-saved to Supabase via updateCurrentDoc
  // This function is kept empty for backward compatibility
}

async function updateCurrentDoc(updates) {
  const index = documents.findIndex(d => d.id === currentDocId);
  if (index !== -1) {
    const updatedDoc = { ...documents[index], ...updates };
    documents[index] = updatedDoc;

    // Update in Supabase
    const { error } = await updateDocument(currentDocId, updates);
    if (error) {
      console.error('Error updating document:', error);
    }
  }
}

// --- MIGRATION & PUBLIC DOCS ---

async function migrateLocalDocsToSupabase() {
  if (!user) return;

  const migrationKey = `proedit_migrated_${user.id}`;
  const migrated = localStorage.getItem(migrationKey);

  if (migrated) return; // Already migrated

  const localKey = `proedit_docs_${user.id}`;
  const localDocsStr = localStorage.getItem(localKey);

  if (!localDocsStr) {
    localStorage.setItem(migrationKey, 'true');
    return;
  }

  const localDocs = JSON.parse(localDocsStr);

  if (localDocs.length === 0) {
    localStorage.setItem(migrationKey, 'true');
    return;
  }

  console.log(`Migrating ${localDocs.length} documents to Supabase...`);

  for (const doc of localDocs) {
    const docToMigrate = {
      id: doc.id,
      user_id: user.id,
      title: doc.title || 'Untitled Document',
      content: doc.content || '',
      is_public: false,
      created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      updated_at: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString()
    };

    await createDocument(docToMigrate);
  }

  localStorage.setItem(migrationKey, 'true');
  console.log('Migration complete!');
}

async function loadPublicDocument(docId) {
  const { data, error } = await getPublicDocument(docId);

  if (error || !data) {
    app.innerHTML = `
      <div class="error-page">
        <h1>Document Not Found</h1>
        <p>This document doesn't exist or is not publicly shared.</p>
        <button class="cta-btn" onclick="window.location.href='${window.location.origin}'">Go to ProEdit</button>
      </div>
    `;
    return;
  }

  // Render read-only view
  documents = [data];
  currentDocId = data.id;
  renderPublicEditor();
}

function renderPublicEditor() {
  const doc = documents.find(d => d.id === currentDocId);
  if (!doc) return;

  app.innerHTML = `
        <div class="editor-layout">
          <div class="top-bar">
            <div class="menu-bar">
              <div class="doc-info">
                <div class="doc-title-input" style="border: none; background: transparent;">${doc.title || 'Untitled Document'}</div>
              </div>
              <div style="flex: 1"></div>
              <div class="brand" style="font-size: 1rem;">ProEdit</div>
            </div>
          </div>

          <div class="editor-scroll-container" id="editorScroll">
            <div id="editor" contenteditable="false" spellcheck="false">
              ${doc.content || ''}
            </div>
          </div>
        </div>
        `;
}


// --- AI CHAT & EDITING ---

let currentSelection = null;

// --- EDITOR LOGIC ---

function setupEditorListeners() {
  const editor = document.getElementById('editor');
  const docTitle = document.getElementById('docTitle');
  const backBtn = document.getElementById('backBtn');
  const slashMenu = document.getElementById('slashMenu');
  const aiPopup = document.getElementById('aiPopup');
  const aiHeader = document.getElementById('aiHeader');
  const closeAi = document.getElementById('closeAi');
  const expandAi = document.getElementById('expandAi');
  const aiTrigger = document.getElementById('aiTrigger');
  const aiInput = document.getElementById('aiInput');
  const aiSend = document.getElementById('aiSend');

  // Model selectors
  const aiModelSelector = document.getElementById('aiModelSelector');
  const proStyleModelSelector = document.getElementById('proStyleModelSelector');

  // Load saved model preference or use default
  const savedModel = localStorage.getItem('proedit_ai_model') || 'gemini-2.5-flash';

  if (aiModelSelector) {
    aiModelSelector.value = savedModel;
    aiModelSelector.addEventListener('change', () => {
      const selectedModel = aiModelSelector.value;
      localStorage.setItem('proedit_ai_model', selectedModel);
      // Sync with ProStyle selector
      if (proStyleModelSelector) proStyleModelSelector.value = selectedModel;
    });
  }

  if (proStyleModelSelector) {
    proStyleModelSelector.value = savedModel;
    proStyleModelSelector.addEventListener('change', () => {
      const selectedModel = proStyleModelSelector.value;
      localStorage.setItem('proedit_ai_model', selectedModel);
      // Sync with AI chat selector
      if (aiModelSelector) aiModelSelector.value = selectedModel;
    });
  }
  const proStyleBtn = document.getElementById('proStyleBtn');
  const proStyleModal = document.getElementById('proStyleModal');
  const closeProStyle = document.getElementById('closeProStyle');
  const cancelProStyle = document.getElementById('cancelProStyle');
  const runProStyle = document.getElementById('runProStyle');
  const proStylePrompt = document.getElementById('proStylePrompt');
  const proStyleStatus = document.getElementById('proStyleStatus');
  let savedProStyleRange = null;

  // Evaluation Elements
  const openEvalBtn = document.getElementById('openEvalBtn');
  const evalModal = document.getElementById('evalModal');
  const closeEval = document.getElementById('closeEval');
  const runEval = document.getElementById('runEval');
  const evalPrompt = document.getElementById('evalPrompt');
  const evalResults = document.getElementById('evalResults');

  // Evaluation Logic
  if (openEvalBtn) {
    openEvalBtn.addEventListener('click', () => {
      evalModal.style.display = 'flex';
      evalPrompt.focus();
    });
  }

  if (closeEval) {
    closeEval.addEventListener('click', () => {
      evalModal.style.display = 'none';
    });
  }

  if (runEval) {
    runEval.addEventListener('click', async () => {
      const prompt = evalPrompt.value.trim();
      if (!prompt) return;

      runEval.disabled = true;
      runEval.textContent = 'Running Evaluation...';
      evalResults.style.display = 'block';

      // Reset UI
      ['flash', 'lite', 'pro'].forEach(model => {
        document.getElementById(`res-${model}`).innerHTML = '<div class="eval-loading">Thinking...</div>';
        document.getElementById(`time-${model}`).textContent = '-';
        document.getElementById(`meta-${model}`).textContent = '';
        document.getElementById(`col-${model}`).classList.remove('fastest');
      });

      try {
        const results = await evaluateModels(prompt);

        // Find fastest successful model
        let fastestTime = Infinity;
        let fastestModel = null;

        results.forEach(res => {
          const modelKey = res.model.includes('lite') ? 'lite' : (res.model.includes('pro') ? 'pro' : 'flash');
          const contentEl = document.getElementById(`res-${modelKey}`);
          const timeEl = document.getElementById(`time-${modelKey}`);
          const metaEl = document.getElementById(`meta-${modelKey}`);

          if (res.status === 'success') {
            // Format content
            contentEl.innerHTML = res.text.replace(/\n/g, '<br>');
            timeEl.textContent = `${(res.duration / 1000).toFixed(2)}s`;
            metaEl.textContent = `${res.text.length} chars`;

            if (res.duration < fastestTime) {
              fastestTime = res.duration;
              fastestModel = modelKey;
            }
          } else {
            contentEl.innerHTML = `<div class="eval-error">Error: ${res.error}</div>`;
            timeEl.textContent = 'Failed';
          }
        });

        // Highlight fastest
        if (fastestModel) {
          document.getElementById(`col-${fastestModel}`).classList.add('fastest');
          document.getElementById(`time-${fastestModel}`).textContent += ' ⚡';
        }

      } catch (error) {
        console.error('Evaluation error:', error);
        alert('Failed to run evaluation');
      } finally {
        runEval.disabled = false;
        runEval.textContent = 'Run Evaluation';
      }
    });
  }

  // Feedback Elements
  const feedbackModal = document.getElementById('feedbackModal');
  const closeFeedback = document.getElementById('closeFeedback');
  const feedbackForm = document.getElementById('feedbackForm');

  // Track selection for Contextual Editing
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    console.log('Selection change:', selection.toString(), selection.rangeCount);
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        currentSelection = {
          text: selection.toString(),
          range: range.cloneRange()
        };
        console.log('Captured selection:', currentSelection.text);
      }
    }
  });

  const captureProStyleRange = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor) {
        savedProStyleRange = range.cloneRange();
      }
    }
  };

  const insertHtmlAtCursor = (html) => {
    editor.focus();

    const selection = window.getSelection();

    if (selection && savedProStyleRange) {
      selection.removeAllRanges();
      selection.addRange(savedProStyleRange);
      savedProStyleRange = null;
    }

    let range = null;

    if (selection && selection.rangeCount > 0) {
      const possibleRange = selection.getRangeAt(0);
      if (editor.contains(possibleRange.commonAncestorContainer) || possibleRange.commonAncestorContainer === editor) {
        range = possibleRange;
      }
    }

    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    range.deleteContents();

    const temp = document.createElement('div');
    temp.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node;
    let lastNode = null;
    while ((node = temp.firstChild)) {
      lastNode = frag.appendChild(node);
    }

    range.insertNode(frag);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      closeDoc();
    });
  }

  // Deploy button
  const deployBtn = document.getElementById('deployBtn');
  if (deployBtn) {
    deployBtn.addEventListener('click', async () => {
      const doc = documents.find(d => d.id === currentDocId);
      if (!doc) return;

      const newPublicStatus = !doc.is_public;

      // Update in Supabase
      const { error } = await updateDocument(currentDocId, { is_public: newPublicStatus });
      if (error) {
        console.error('Error updating public status:', error);
        alert('Failed to update deployment status');
        return;
      }

      // Update local state
      doc.is_public = newPublicStatus;
      const index = documents.findIndex(d => d.id === currentDocId);
      if (index !== -1) {
        documents[index] = doc;
      }

      // Update button UI
      deployBtn.classList.toggle('published', newPublicStatus);
      const deployText = document.getElementById('deployText');
      if (deployText) deployText.textContent = newPublicStatus ? 'Published' : 'Deploy';

      // Show appropriate message
      if (newPublicStatus) {
        const shareUrl = `${window.location.origin}?doc=${currentDocId}`;
        prompt('Document is now public! Share this URL:', shareUrl);
      } else {
        alert('Document is now private');
      }
    });
  }

  if (proStyleBtn && proStyleModal && closeProStyle && cancelProStyle && runProStyle && proStylePrompt && proStyleStatus) {
    const closeProStyleModal = () => {
      proStyleModal.style.display = 'none';
      proStyleStatus.style.display = 'none';
      proStyleStatus.textContent = '';
      proStyleStatus.style.color = 'var(--text-muted)';
      runProStyle.disabled = false;
      proStylePrompt.value = '';
      editor.focus();
    };

    const openProStyleModal = () => {
      proStyleModal.style.display = 'flex';
      proStyleStatus.style.display = 'none';
      proStyleStatus.textContent = '';
      proStyleStatus.style.color = 'var(--text-muted)';
      proStylePrompt.focus();
    };

    const handleProStyle = async () => {
      const request = proStylePrompt.value.trim();
      if (!request) {
        proStyleStatus.textContent = 'Add a quick description so ProStyle knows what to build.';
        proStyleStatus.style.color = '#ef4444';
        proStyleStatus.style.display = 'block';
        proStylePrompt.focus();
        return;
      }

      runProStyle.disabled = true;
      proStyleStatus.textContent = 'Generating component...';
      proStyleStatus.style.color = 'var(--text-muted)';
      proStyleStatus.style.display = 'block';

      const proStylePromptText = `
        You are ProStyle, an AI that writes production-ready HTML snippets for a rich text editor.
        User request: "${request}"

        Rules:
        - Return ONLY the HTML snippet, no markdown fences, no commentary.
        - Use semantic tags, neutral modern styling, and mobile-friendly layout.
        - Prefer inline styles or scoped classes prefixed with prostyle- if needed. Avoid external assets and scripts.
        - Do not wrap in UPDATE_DOCUMENT/APPEND_CONTENT/etc.`;

      try {
        const selectedModel = proStyleModelSelector.value;
        const response = await generateContent(proStylePromptText, selectedModel);
        let html = response.trim();

        // Strip common wrappers the model might return
        html = html.replace(/^```(?:html)?/i, '').replace(/```$/i, '').trim();
        html = html.replace(/<\/?body>/gi, '').replace(/<\/?html>/gi, '');
        html = html.replace(/<UPDATE_DOCUMENT>|<\/UPDATE_DOCUMENT>|<APPEND_CONTENT>|<\/APPEND_CONTENT>/gi, '').trim();

        if (!html) throw new Error('Empty response from ProStyle');

        captureProStyleRange();
        insertHtmlAtCursor(html);
        updateCurrentDoc({ content: editor.innerHTML });
        closeProStyleModal();
      } catch (err) {
        console.error('ProStyle Error:', err);
        proStyleStatus.textContent = 'Could not generate a component. Please try again.';
        proStyleStatus.style.color = '#ef4444';
        proStyleStatus.style.display = 'block';
      } finally {
        runProStyle.disabled = false;
      }
    };

    proStyleBtn.addEventListener('click', () => {
      captureProStyleRange();
      openProStyleModal();
    });

    runProStyle.addEventListener('click', handleProStyle);
    proStylePrompt.addEventListener('keypress', (e) => {
      if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        handleProStyle();
      }
    });

    closeProStyle.addEventListener('click', closeProStyleModal);
    cancelProStyle.addEventListener('click', closeProStyleModal);
    proStyleModal.addEventListener('click', (e) => {
      if (e.target === proStyleModal) closeProStyleModal();
    });
  }

  docTitle.addEventListener('input', (e) => {
    updateCurrentDoc({ title: e.target.value });
  });

  editor.addEventListener('input', (e) => {
    updateCurrentDoc({ content: editor.innerHTML });

    // Broadcast changes
    if (collaborationManager) {
      collaborationManager.sendTextUpdate(editor.innerHTML);
    }

    checkForSlash(editor);
    handleMarkdownShortcuts(editor, e);
  });

  // Font Family
  const fontFamily = document.getElementById('fontFamily');
  fontFamily.addEventListener('change', () => {
    document.execCommand('fontName', false, fontFamily.value);
    editor.focus();
  });

  // Font Size
  const fontSize = document.getElementById('fontSize');
  fontSize.addEventListener('change', () => {
    document.execCommand('fontSize', false, fontSize.value);
    editor.focus();
  });

  // Toolbar
  document.querySelectorAll('.tool-btn').forEach(btn => {
    if (btn.id === 'exportBtn') return; // Skip export button
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      editor.focus();
    });
  });

  // AI Chat
  // Capture selection on mousedown to avoid focus loss
  if (aiTrigger) {
    aiTrigger.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent focus loss
      const selection = window.getSelection();
      if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === editor) {
          currentSelection = {
            text: selection.toString(),
            range: range.cloneRange()
          };
          console.log('Captured selection on mousedown:', currentSelection.text);
        }
      }
    });

    aiTrigger.addEventListener('click', () => {
      const popup = document.getElementById('aiPopup');
      if (popup) {
        popup.style.display = 'flex';
        const aiInput = document.getElementById('aiInput');
        if (aiInput) {
          aiInput.focus();
          // If text is selected, show a hint in the input
          if (currentSelection && currentSelection.text) {
            aiInput.placeholder = `Edit: "${currentSelection.text.slice(0, 20)}..."`;
          } else {
            aiInput.placeholder = "Ask AI to write, edit, or summarize...";
          }
        }
      }
    });
  }

  // AI Panel Drag Logic
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  if (aiHeader) {
    aiHeader.addEventListener("mousedown", dragStart);
    document.addEventListener("mouseup", dragEnd);
    document.addEventListener("mousemove", drag);
  }

  function dragStart(e) {
    if (e.target.closest('.ai-controls')) return; // Don't drag if clicking controls
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;

    if (e.target === aiHeader || aiHeader.contains(e.target)) {
      isDragging = true;
    }
  }

  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, aiPopup);
    }
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }

  if (closeAi) {
    closeAi.addEventListener('click', (e) => {
      e.stopPropagation(); // Stop event bubbling
      aiPopup.style.display = 'none';
      aiPopup.classList.remove('split-view');
      document.querySelector('.editor-layout').classList.remove('has-sidebar');
      // Reset position
      aiPopup.style.transform = 'none';
      xOffset = 0;
      yOffset = 0;
    });
  }

  if (expandAi) {
    expandAi.addEventListener('click', () => {
      aiPopup.classList.toggle('split-view');
      document.querySelector('.editor-layout').classList.toggle('has-sidebar');
      expandAi.textContent = aiPopup.classList.contains('split-view') ? '⤡' : '⤢';
    });
  }

  const handleSend = async () => {
    const text = aiInput.value.trim();
    if (!text) return;

    addAiMessage(text, 'user');
    aiInput.value = '';
    aiSend.disabled = true;

    // Prepare context
    const docContent = editor.innerHTML;
    const prompt = `
          You are an AI writing assistant.
          Current Document Content (HTML):
          ${docContent}

          User Request: ${text}

          INSTRUCTIONS:
          1. Answer the user's question or perform the task.
          2. **EDITING THE DOCUMENT**:
          - To replace the ENTIRE document: Wrap content in <UPDATE_DOCUMENT>...</UPDATE_DOCUMENT>
          - To APPEND to the end: Wrap content in <APPEND_CONTENT>...</APPEND_CONTENT>
          - To REPLACE specific text: Wrap content in <REPLACE_TEXT target="exact text to replace">new content</REPLACE_TEXT>

          3. **FORMATTING**:
          - Use standard HTML tags: <b>, <i>, <u>, <h1>, <h2>, <ul>, <li>, <p>, <br>.
            - For FONTS and SIZES, use inline styles on <span> tags:
              - Font Family: <span style="font-family: 'Inter'">...</span> (Options: Inter, Merriweather, monospace, Comic Sans MS)
              - Font Size: <span style="font-size: 18px">...</span>
              - Colors: <span style="color: red">...</span>

              4. If you are just chatting, do not use the tags.
              `;

    try {
      const selectedModel = aiModelSelector.value;
      const response = await generateContent(prompt, selectedModel);

      let processedResponse = response;
      let docUpdated = false;

      // 1. Handle Full Update
      const updateMatch = response.match(/<UPDATE_DOCUMENT>([\s\S]*?)<\/UPDATE_DOCUMENT>/);
      if (updateMatch) {
        const newContent = updateMatch[1];
        editor.innerHTML = newContent;
        updateCurrentDoc({ content: newContent });
        processedResponse = processedResponse.replace(/<UPDATE_DOCUMENT>[\s\S]*?<\/UPDATE_DOCUMENT>/, "I've replaced the document content.");
        docUpdated = true;
      }

      // 2. Handle Append
      const appendMatch = response.match(/<APPEND_CONTENT>([\s\S]*?)<\/APPEND_CONTENT>/);
      if (appendMatch) {
        const contentToAppend = appendMatch[1];
        editor.innerHTML += contentToAppend;
        updateCurrentDoc({ content: editor.innerHTML });
        processedResponse = processedResponse.replace(/<APPEND_CONTENT>[\s\S]*?<\/APPEND_CONTENT>/, "I've appended the text to the document.");
        docUpdated = true;
      }

      // 3. Handle Replace (Multiple occurrences)
      const replaceRegex = /<REPLACE_TEXT target="([^"]+)">([\s\S]*?)<\/REPLACE_TEXT>/g;
      let match;
      while ((match = replaceRegex.exec(response)) !== null) {
        const target = match[1];
        const replacement = match[2];

        // Simple string replace (first occurrence)
        if (editor.innerHTML.includes(target)) {
          editor.innerHTML = editor.innerHTML.replace(target, replacement);
          updateCurrentDoc({ content: editor.innerHTML });
          docUpdated = true;
        }
      }

      // Clean up replace tags from chat response
      processedResponse = processedResponse.replace(/<REPLACE_TEXT[\s\S]*?<\/REPLACE_TEXT>/g, "I've updated that section.");

      addAiMessage(processedResponse);

    } catch (err) {
      addAiMessage("Sorry, I encountered an error. Please try again.");
      console.error(err);
    } finally {
      aiSend.disabled = false;
      aiInput.focus();
    }
  };

  if (aiSend) aiSend.addEventListener('click', handleSend);
  if (aiInput) {
    aiInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  // Slash Menu
  document.querySelectorAll('.slash-item').forEach(item => {
    item.addEventListener('click', () => triggerSlashAction(item.dataset.action));
  });

  editor.addEventListener('keydown', (e) => {
    if (slashMenu && slashMenu.classList.contains('visible')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstItem = slashMenu.querySelector('.slash-item');
        if (firstItem) triggerSlashAction(firstItem.dataset.action);
      } else if (e.key === 'Escape') {
        hideSlashMenu();
      }
    }
  });

  // Feedback Logic
  closeFeedback.addEventListener('click', () => {
    feedbackModal.style.display = 'none';
  });

  feedbackModal.addEventListener('click', (e) => {
    if (e.target === feedbackModal) {
      feedbackModal.style.display = 'none';
    }
  });

  feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = feedbackForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const name = document.getElementById('fbName').value;
    const email = document.getElementById('fbEmail').value;
    const rating = document.querySelector('input[name="rating"]:checked')?.value;
    const message = document.getElementById('fbMessage').value;

    const { error } = await submitFeedback(name, email, rating, message);

    if (error) {
      alert('Failed to submit feedback. Please try again.');
      console.error(error);
    } else {
      alert('Thank you for your feedback!');
      feedbackModal.style.display = 'none';
      feedbackForm.reset();
    }

    btn.disabled = false;
    btn.textContent = originalText;
  });

  // Help Panel Logic
  const helpTrigger = document.getElementById('helpTrigger');
  const helpPanel = document.getElementById('helpPanel');
  const closeHelp = document.getElementById('closeHelp');
  const openAiChatBtn = document.getElementById('openAiChatBtn');
  const restartTutorialBtn = document.getElementById('restartTutorialBtn');

  helpTrigger.addEventListener('click', () => {
    helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none';
  });

  closeHelp.addEventListener('click', () => {
    helpPanel.style.display = 'none';
  });

  // Help Chat Logic
  const helpChatPopup = document.getElementById('helpChatPopup');
  const closeHelpChat = document.getElementById('closeHelpChat');
  const helpChatInput = document.getElementById('helpChatInput');
  const helpChatSend = document.getElementById('helpChatSend');
  const helpChatMessages = document.getElementById('helpChatMessages');

  function addHelpMessage(text, type) {
    const div = document.createElement('div');
    div.className = `ai-message ${type}`;
    div.textContent = text;
    helpChatMessages.appendChild(div);
    helpChatMessages.scrollTop = helpChatMessages.scrollHeight;
  }

  const handleHelpSend = async () => {
    const text = helpChatInput.value.trim();
    if (!text) return;

    addHelpMessage(text, 'user');
    helpChatInput.value = '';
    helpChatInput.disabled = true;
    helpChatSend.disabled = true;

    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-message ai';
    loadingDiv.textContent = 'Thinking...';
    helpChatMessages.appendChild(loadingDiv);
    helpChatMessages.scrollTop = helpChatMessages.scrollHeight;

    try {
      const systemPrompt = `You are a helpful assistant for the ProEdit document editor.
                      Your goal is to help users understand how to use the application.

                      Key Features of ProEdit:
                      - **Editor**: A rich text editor for writing documents.
                      - **Formatting**: Users can format text using the toolbar (Bold, Italic, Underline, Fonts, Colors).
                      - **AI Assistant**: Users can ask the AI to write, edit, or improve text.
                      - **Deploy to Web**: Users can publish documents to a public URL.
                      - **Export**: Users can export to PDF, Word, or Markdown.

                      Answer the user's question about how to use these features. Keep answers concise and helpful.
                      Do not try to edit the document content directly. Just explain how to do it.`;

      const prompt = `${systemPrompt}\n\nUser Question: ${text}`;
      const response = await generateContent(prompt);

      loadingDiv.remove();
      addHelpMessage(response, 'ai');
    } catch (error) {
      console.error('Help Chat Error:', error);
      loadingDiv.remove();
      addHelpMessage('Sorry, I encountered an error. Please try again.', 'ai');
    } finally {
      helpChatInput.disabled = false;
      helpChatSend.disabled = false;
      helpChatInput.focus();
    }
  };

  helpChatSend.addEventListener('click', handleHelpSend);
  helpChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleHelpSend();
  });

  closeHelpChat.addEventListener('click', () => {
    helpChatPopup.classList.remove('visible');
    setTimeout(() => {
      helpChatPopup.style.display = 'none';
    }, 300);
  });

  // Update Open AI Chat button to open Help Chat instead
  openAiChatBtn.addEventListener('click', () => {
    helpPanel.style.display = 'none';
    helpChatPopup.style.display = 'flex';
    // Small delay to allow display:flex to apply before adding visible class for animation
    setTimeout(() => {
      helpChatPopup.classList.add('visible');
      helpChatInput.focus();
    }, 10);
  });

  restartTutorialBtn.addEventListener('click', () => {
    helpPanel.style.display = 'none';
    localStorage.removeItem('proedit_tutorial_completed');
    currentTutorialStep = 0;
    startTutorial();
  });

  // Close help panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!helpPanel.contains(e.target) && !helpTrigger.contains(e.target)) {
      helpPanel.style.display = 'none';
    }
  });

  // --- TEXT SELECTION EDIT POPUP ---
  const textEditPopup = document.getElementById('textEditPopup');
  const editPopupCustom = document.getElementById('editPopupCustom');
  const editPopupInput = document.getElementById('editPopupInput');
  const editPopupCancel = document.getElementById('editPopupCancel');
  const editPopupSubmit = document.getElementById('editPopupSubmit');
  let selectedTextRange = null;
  let selectedText = '';

  // Show popup when text is selected
  document.addEventListener('mouseup', (e) => {
    // Don't show if clicking inside the popup itself
    if (textEditPopup.contains(e.target)) return;

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      // Only show if selection is within the editor
      if (editor.contains(range.commonAncestorContainer)) {
        selectedText = text;
        selectedTextRange = range.cloneRange();

        // Position the popup near the selection
        const rect = range.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        // Position above the selection
        textEditPopup.style.top = `${rect.top + scrollTop - textEditPopup.offsetHeight - 10}px`;
        textEditPopup.style.left = `${rect.left + scrollLeft}px`;

        // Show the popup
        textEditPopup.classList.add('visible');

        // Hide custom input if it was open
        editPopupCustom.classList.remove('visible');
        editPopupInput.value = '';
      }
    } else {
      // Hide popup if no text selected
      textEditPopup.classList.remove('visible');
      editPopupCustom.classList.remove('visible');
    }
  });

  // Hide popup when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (!textEditPopup.contains(e.target) && !editor.contains(e.target)) {
      textEditPopup.classList.remove('visible');
      editPopupCustom.classList.remove('visible');
    }
  });

  // Handle edit actions
  const handleEditAction = async (action, customPrompt = '') => {
    if (!selectedText || !selectedTextRange) return;

    let prompt = '';

    switch (action) {
      case 'improve':
        prompt = `Improve the following text by fixing grammar, enhancing clarity, and making it more professional. Return ONLY the improved text, no explanations:\n\n"${selectedText}"`;
        break;
      case 'simplify':
        prompt = `Simplify the following text to make it easier to understand. Use simpler words and shorter sentences. Return ONLY the simplified text, no explanations:\n\n"${selectedText}"`;
        break;
      case 'expand':
        prompt = `Expand the following text with more details and context. Make it more comprehensive. Return ONLY the expanded text, no explanations:\n\n"${selectedText}"`;
        break;
      case 'custom':
        if (!customPrompt) return;
        prompt = `${customPrompt}\n\nOriginal text: "${selectedText}"\n\nReturn ONLY the edited text, no explanations.`;
        break;
    }

    // Hide popup and show loading state
    textEditPopup.classList.remove('visible');
    editPopupCustom.classList.remove('visible');

    // Disable submit button during processing
    if (editPopupSubmit) editPopupSubmit.disabled = true;

    try {
      const selectedModel = aiModelSelector.value;
      const response = await generateContent(prompt, selectedModel);
      const editedText = response.trim();

      // Restore the selection and replace the text
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(selectedTextRange);

      // Replace the selected text
      document.execCommand('insertText', false, editedText);

      // Update document
      updateCurrentDoc({ content: editor.innerHTML });

      // Clear selection
      selectedText = '';
      selectedTextRange = null;
    } catch (error) {
      console.error('Edit error:', error);
      alert('Failed to edit text. Please try again.');
    } finally {
      if (editPopupSubmit) editPopupSubmit.disabled = false;
    }
  };

  // Quick action buttons
  document.querySelectorAll('.edit-popup-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;

      if (action === 'custom') {
        // Show custom input
        editPopupCustom.classList.add('visible');
        editPopupInput.focus();
      } else {
        // Execute quick action
        handleEditAction(action);
      }
    });
  });

  // Custom edit cancel
  editPopupCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    editPopupCustom.classList.remove('visible');
    editPopupInput.value = '';
  });

  // Custom edit submit
  editPopupSubmit.addEventListener('click', (e) => {
    e.stopPropagation();
    const customPrompt = editPopupInput.value.trim();
    if (customPrompt) {
      handleEditAction('custom', customPrompt);
      editPopupInput.value = '';
    }
  });

  // Submit on Enter key
  editPopupInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const customPrompt = editPopupInput.value.trim();
      if (customPrompt) {
        handleEditAction('custom', customPrompt);
        editPopupInput.value = '';
      }
    }
  });

  // --- COLLABORATION LISTENERS ---
  const shareBtn = document.getElementById('shareBtn');
  const shareModal = document.getElementById('shareModal');
  const sendInviteBtn = document.getElementById('sendInviteBtn');
  const chatToggleBtn = document.getElementById('chatToggleBtn');
  const chatWidget = document.getElementById('chatWidget');
  const chatInput = document.getElementById('chatInput');
  const closeChat = chatWidget?.querySelector('.close-btn');

  // Share Modal
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareModal.style.display = 'flex';
      updateAvatars(collabUsers);
    });
  }

  if (sendInviteBtn) {
    sendInviteBtn.addEventListener('click', async () => {
      const email = document.getElementById('shareEmail').value;
      const role = document.getElementById('shareRole').value;
      if (!email) return;

      sendInviteBtn.disabled = true;
      sendInviteBtn.textContent = 'Inviting...';

      try {
        const { error } = await shareDocument(currentDocId, email, role);
        if (error) throw error;
        alert('Invitation sent!');
        document.getElementById('shareEmail').value = '';
      } catch (e) {
        console.error(e);
        alert('Failed to share: ' + e.message);
      } finally {
        sendInviteBtn.disabled = false;
        sendInviteBtn.textContent = 'Invite';
      }
    });
  }

  // Chat
  if (chatToggleBtn) {
    chatToggleBtn.addEventListener('click', () => {
      chatWidget.classList.toggle('visible');
      if (chatWidget.classList.contains('visible')) {
        chatInput.focus();
      }
    });
  }

  if (closeChat) {
    closeChat.addEventListener('click', () => {
      chatWidget.classList.remove('visible');
    });
  }

  const sendChatMsg = async () => {
    const msg = chatInput.value.trim();
    if (!msg || !collaborationManager) return;

    collaborationManager.sendChat(msg);
    chatInput.value = '';

    // AI Interception
    if (msg.toLowerCase().startsWith('@ai')) {
      const query = msg.substring(3).trim();
      if (!query) return;

      try {
        // Get context for better answers
        const context = editor.innerText.substring(0, 1000);
        const prompt = `Context: ${context}\n\nUser Question: ${query}\n\nAnswer briefly as a helpful assistant in the chat.`;

        const response = await generateContent(prompt);

        // Send as 'ai' role (rendering needs to handle this)
        collaborationManager.sendChat(response, 'ai');

      } catch (e) {
        console.error("AI Chat Error", e);
        collaborationManager.sendChat("Failed to get AI response.", 'ai');
      }
    }
  };

  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMsg();
    });
    chatWidget.querySelector('.ai-send')?.addEventListener('click', sendChatMsg);
  }

  // Cursor Tracking
  let lastCursorUpdate = 0;
  const CURSOR_THROTTLE = 50;

  const trackCursor = () => {
    if (!collaborationManager) return;

    const now = Date.now();
    if (now - lastCursorUpdate < CURSOR_THROTTLE) return;

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      // Only if inside editor
      if (!editor.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== editor) return;

      const rect = range.getBoundingClientRect();
      const editorScroll = document.getElementById('editorScroll');
      const wrapperRect = editorScroll.getBoundingClientRect();

      const relTop = rect.top - wrapperRect.top + editorScroll.scrollTop;
      const relLeft = rect.left - wrapperRect.left + editorScroll.scrollLeft;

      collaborationManager.sendCursor({
        start: 0,
        end: 0
      }, {
        top: relTop,
        left: relLeft,
        height: rect.height
      });

      lastCursorUpdate = now;
    }
  };

  editor.addEventListener('input', trackCursor);
  editor.addEventListener('click', trackCursor);
  editor.addEventListener('keyup', trackCursor);

  setupComments();
  setupShareLogic();

  // Resume tutorial if needed
  if (localStorage.getItem('proedit_tutorial_phase') === 'editor') {
    setTimeout(() => startTutorial(), 500);
  }
}



function setupBetaBar() {
  const betaBar = document.getElementById('betaBar');
  const closeBeta = document.getElementById('closeBeta');
  const betaFeedback = document.getElementById('betaFeedback');
  const feedbackModal = document.getElementById('feedbackModal');

  if (!betaBar) return; // Guard clause

  // Check if previously closed
  if (sessionStorage.getItem('betaBarClosed') === 'true') {
    betaBar.style.display = 'none';
  }

  closeBeta.addEventListener('click', () => {
    betaBar.style.display = 'none';
    sessionStorage.setItem('betaBarClosed', 'true');
  });

  betaFeedback.addEventListener('click', () => {
    feedbackModal.style.display = 'flex';
    if (user && user.email) {
      document.getElementById('fbEmail').value = user.email;
    }
  });
}

function addAiMessage(text, sender = 'ai') {
  // Backward compatible signature: addAiMessage(text, sender, {persist})
  const options = arguments.length >= 3 && typeof arguments[2] === 'object' ? arguments[2] : {};
  const { persist = true } = options;

  const safeText = typeof text === 'string' ? text : String(text ?? '');

  // Persist message if function exists (optional feature)
  if (persist && typeof persistAiChatMessage !== 'undefined') {
    try {
      persistAiChatMessage({ sender, text: safeText, timestamp: new Date().toISOString() });
    } catch (err) {
      console.warn('Failed to persist AI message:', err);
    }
  }

  const msgs = document.getElementById('aiMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `ai-message ${sender}`;

  // Format markdown-ish
  const formatted = safeText
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');

  div.innerHTML = formatted;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// --- EXPORT ---

window.exportDoc = (format) => {
  const doc = documents.find(d => d.id === currentDocId);
  if (!doc) return;

  const filename = (doc.title || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const content = document.getElementById('editor').innerHTML;

  if (format === 'pdf') {
    const element = document.getElementById('editor');

    const opt = {
      margin: [0.75, 0.75, 0.75, 0.75], // Top, Right, Bottom, Left margins in inches for centering
      filename: `${filename}.pdf`,
      image: {
        type: 'jpeg',
        quality: 0.98
      },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 816, // Match editor width
        windowHeight: element.scrollHeight
      },
      jsPDF: {
        unit: 'in',
        format: 'letter',
        orientation: 'portrait',
        compress: true
      },
      pagebreak: {
        mode: ['avoid-all', 'css', 'legacy'],
        before: '.page-break'
      }
    };

    html2pdf().set(opt).from(element).save();
  } else if (format === 'word') {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
      "xmlns:w='urn:schemas-microsoft-com:office:word' " +
      "xmlns='http://www.w3.org/TR/REC-html40'>" +
      "<head><meta charset='utf-8'><title>Export HTML to Word Document with JavaScript</title></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + content + footer;

    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = `${filename}.doc`;
    fileDownload.click();
    document.body.removeChild(fileDownload);
  } else if (format === 'md') {
    // Simple HTML to Markdown converter
    let md = content
      .replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n')
      .replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n')
      .replace(/<b>(.*?)<\/b>/g, '**$1**')
      .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
      .replace(/<i>(.*?)<\/i>/g, '*$1*')
      .replace(/<em>(.*?)<\/em>/g, '*$1*')
      .replace(/<u>(.*?)<\/u>/g, '__$1__')
      .replace(/<ul>(.*?)<\/ul>/g, '$1\n')
      .replace(/<li>(.*?)<\/li>/g, '- $1\n')
      .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
      .replace(/<br>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]*>/g, ''); // Strip remaining tags

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(md));
    element.setAttribute('download', `${filename}.md`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
};

// --- MARKDOWN SHORTCUTS ---

function handleMarkdownShortcuts(editor, e) {
  if (e.inputType !== 'insertText') return;

  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const node = range.startContainer;

  // Only work on text nodes
  if (node.nodeType !== Node.TEXT_NODE) return;

  const text = node.textContent;
  const offset = range.startOffset;

  // --- Block Shortcuts (at start of line) ---
  if (e.data === ' ') {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const currentLine = text.slice(lineStart, offset);

    let tag = null;

    if (currentLine === '# ') {
      tag = 'h1';
    } else if (currentLine === '## ') {
      tag = 'h2';
    } else if (currentLine === '- ' || currentLine === '* ') {
      tag = 'li';
    } else if (currentLine === '> ') {
      tag = 'blockquote';
    }

    if (tag) {
      e.preventDefault();
      // Remove the pattern
      const before = text.slice(0, lineStart);
      const after = text.slice(offset);
      node.textContent = before + after;

      // Create new element
      if (tag === 'li') {
        document.execCommand('insertUnorderedList');
      } else {
        document.execCommand('formatBlock', false, tag);
      }
      return;
    }
  }

  // --- Inline Shortcuts (Bold/Italic) ---
  // Check text before cursor
  const textBefore = text.slice(0, offset);

  // Bold: **text**
  const boldMatch = textBefore.match(/\*\*(.+?)\*\*$/);
  if (boldMatch) {
    e.preventDefault();
    const matchText = boldMatch[1];
    const matchLength = boldMatch[0].length;

    // Remove markers
    const before = text.slice(0, offset - matchLength);
    const after = text.slice(offset);
    node.textContent = before + matchText + after;

    // Select the text to format
    const newRange = document.createRange();
    newRange.setStart(node, before.length);
    newRange.setEnd(node, before.length + matchText.length);
    selection.removeAllRanges();
    selection.addRange(newRange);

    // Apply formatting
    document.execCommand('bold');

    // Move cursor to end
    selection.collapseToEnd();
    return;
  }

  // Italic: *text* (but not **text**)
  // We need to be careful not to match the second * of **
  const italicMatch = textBefore.match(/(?<!\*)\*(.+?)\*$/);
  if (italicMatch) {
    e.preventDefault();
    const matchText = italicMatch[1];
    const matchLength = italicMatch[0].length;

    // Remove markers
    const before = text.slice(0, offset - matchLength);
    const after = text.slice(offset);
    node.textContent = before + matchText + after;

    // Select the text to format
    const newRange = document.createRange();
    newRange.setStart(node, before.length);
    newRange.setEnd(node, before.length + matchText.length);
    selection.removeAllRanges();
    selection.addRange(newRange);

    // Apply formatting
    document.execCommand('italic');

    // Move cursor to end
    selection.collapseToEnd();
    return;
  }
}

// --- SLASH COMMANDS & AI ---

function checkForSlash(el) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const text = range.startContainer.textContent;
  const cursor = range.startOffset;

  if (text.slice(cursor - 1, cursor) === '/') {
    const rect = range.getBoundingClientRect();
    showSlashMenu(rect);
  } else {
    hideSlashMenu();
  }
}

function showSlashMenu(rect) {
  const menu = document.getElementById('slashMenu');
  menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
  menu.style.left = `${rect.left + window.scrollX}px`;
  menu.classList.add('visible');
}

function hideSlashMenu() {
  document.getElementById('slashMenu').classList.remove('visible');
}

async function triggerSlashAction(action) {
  hideSlashMenu();
  document.execCommand('delete', false, null); // Remove slash

  const editor = document.getElementById('editor');
  const text = editor.innerText;

  // Open chat for processing
  const aiPopup = document.getElementById('aiPopup');
  const aiInput = document.getElementById('aiInput');
  const aiSend = document.getElementById('aiSend');

  aiPopup.classList.add('visible');
  addAiMessage("Thinking...", 'ai');

  let prompt = "";
  switch (action) {
    case 'continue':
      prompt = `Continue writing the following text. Keep the same tone and style. Do not repeat the text, just continue it.\n\nText:\n${text.slice(-500)}`;
      break;
    case 'summarize':
      prompt = `Summarize the following text in a concise paragraph:\n\n${text}`;
      break;
    case 'improve':
      prompt = `Rewrite the following text to be more professional, clear, and engaging:\n\n${text}`;
      break;
  }

  if (prompt) {
    try {
      const selectedModel = aiModelSelector.value;
      const response = await generateContent(prompt, selectedModel);
      addAiMessage(response);

      if (action === 'continue') {
        const p = document.createElement('p');
        p.innerHTML = response.replace(/\n/g, '<br>');
        editor.appendChild(p);
        updateCurrentDoc({ content: editor.innerHTML });
      }
    } catch (err) {
      addAiMessage("Error generating content.");
    }
  }
}

function showAiPopup(content, isLoading = false) {
  // Deprecated in favor of chat interface, but kept for compatibility if needed
  const popup = document.getElementById('aiPopup');
  popup.classList.add('visible');
  if (content) addAiMessage(content);
}

// Start App
init();


// --- TUTORIAL SYSTEM ---

let currentTutorialStep = 0;
let currentTutorialPhase = 'dashboard';

const dashboardSteps = [
  {
    target: '.create-btn',
    title: 'Start Your Journey 🚀',
    content: 'Welcome to ProEdit! To begin, click here to create your first document.',
    action: 'wait-for-click'
  }
];

const editorSteps = [
  {
    target: '#editor',
    title: 'Your Canvas ✏️',
    content: 'This is where the magic happens. Start typing freely, or use the slash command (/) to access AI tools.',
    action: null
  },
  {
    target: '.toolbar',
    title: 'Style It Your Way 🎨',
    content: 'Format your text with precision using the toolbar. Fonts, sizes, and colors are all at your fingertips.',
    action: null
  },
  {
    target: '#proStyleBtn',
    title: 'Design with AI ✨',
    content: 'Need a landing page or a complex layout? Click "ProStyle" and just describe what you want. The AI will build the HTML for you.',
    action: null
  },
  {
    target: '#shareBtn',
    title: 'Collaborate Live 👥',
    content: 'Work together! Invite your team to edit in real-time, complete with cursor tracking and chat.',
    action: null
  },
  {
    target: '#aiTrigger',
    title: 'AI Assistant 🤖',
    content: 'Stuck? Access the AI Assistant here to write, edit, or summarize your content instantly.',
    action: 'complete'
  }
];

function startTutorial() {
  // Determine phase based on context
  if (!currentDocId) {
    currentTutorialPhase = 'dashboard';
  } else {
    currentTutorialPhase = 'editor';
    // If we just came from dashboard, ensure we start fresh
    if (localStorage.getItem('proedit_tutorial_phase') === 'editor') {
      currentTutorialStep = 0;
      localStorage.removeItem('proedit_tutorial_phase');
    }
  }

  // Add tutorial overlay if missing
  if (!document.getElementById('tutorialOverlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.id = 'tutorialOverlay';
    overlay.innerHTML = `
                                              <div class="tutorial-spotlight" id="tutorialSpotlight"></div>
                                              <div class="tutorial-card" id="tutorialCard">
                                                <div class="tutorial-header">
                                                  <h3 id="tutorialTitle"></h3>
                                                  <button class="tutorial-close" id="tutorialCloseBtn">×</button>
                                                </div>
                                                <div class="tutorial-content" id="tutorialContent"></div>
                                                <div class="tutorial-controls">
                                                  <button class="tutorial-skip" id="tutorialSkip">End Tour</button>
                                                  <div style="display: flex; align-items: center; gap: 1rem;">
                                                    <span class="tutorial-progress" id="tutorialProgress"></span>
                                                    <button class="tutorial-next" id="tutorialNext">Next</button>
                                                  </div>
                                                </div>
                                              </div>
                                              `;
    document.body.appendChild(overlay);

    document.getElementById('tutorialNext').addEventListener('click', nextTutorialStep);
    document.getElementById('tutorialSkip').addEventListener('click', endTutorial);
    document.getElementById('tutorialCloseBtn').addEventListener('click', endTutorial);
  }

  showTutorialStep();
}

function showTutorialStep() {
  const steps = currentTutorialPhase === 'dashboard' ? dashboardSteps : editorSteps;

  if (currentTutorialStep >= steps.length) {
    if (currentTutorialPhase === 'editor') {
      endTutorial();
    }
    return;
  }

  const step = steps[currentTutorialStep];
  const overlay = document.getElementById('tutorialOverlay');
  const spotlight = document.getElementById('tutorialSpotlight');
  const card = document.getElementById('tutorialCard');
  const nextBtn = document.getElementById('tutorialNext');

  overlay.style.display = 'block';

  // Update content
  document.getElementById('tutorialTitle').textContent = step.title;
  document.getElementById('tutorialContent').textContent = step.content;
  document.getElementById('tutorialProgress').textContent = `${currentTutorialStep + 1} of ${steps.length}`;

  // Button State
  if (step.action === 'wait-for-click') {
    nextBtn.style.display = 'none'; // Hide next button, force user action
    // Add listener to the target to advance
    const target = document.querySelector(step.target);
    if (target) {
      target.addEventListener('click', advanceFromDashboard, { once: true });
    }
  } else {
    nextBtn.style.display = 'block';
    nextBtn.textContent = currentTutorialStep === steps.length - 1 ? 'Finish' : 'Next';
  }

  // Position spotlight
  const targetEl = document.querySelector(step.target);
  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    spotlight.style.top = `${rect.top - 10}px`;
    spotlight.style.left = `${rect.left - 10}px`;
    spotlight.style.width = `${rect.width + 20}px`;
    spotlight.style.height = `${rect.height + 20}px`;

    // Smart positioning for card
    let cardTop = rect.bottom + 20;
    let cardLeft = rect.left;

    if (cardTop + 200 > window.innerHeight) cardTop = rect.top - 220;
    if (cardLeft + 400 > window.innerWidth) cardLeft = window.innerWidth - 420;
    if (cardLeft < 20) cardLeft = 20;

    card.style.top = `${cardTop}px`;
    card.style.left = `${cardLeft}px`;
  }
}

function advanceFromDashboard() {
  // Set flag for editor phase
  localStorage.setItem('proedit_tutorial_phase', 'editor');
  // Overlay will be removed by the page render/update
  document.getElementById('tutorialOverlay').style.display = 'none';
}

function nextTutorialStep() {
  currentTutorialStep++;
  showTutorialStep();
}

function endTutorial() {
  const overlay = document.getElementById('tutorialOverlay');
  if (overlay) overlay.style.display = 'none';
  localStorage.setItem('proedit_tutorial_completed', 'true');
  localStorage.removeItem('proedit_tutorial_phase');
}

window.startTutorial = startTutorial;
window.endTutorial = endTutorial;

// --- COLLABORATION HELPERS ---

function updateAvatars(users) {
  collabUsers = users; // Update global state
  const stack = document.getElementById('avatarStack');

  if (stack) {
    stack.innerHTML = users.map(u => `
        <div class="avatar" style="background: ${u.color}; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; border: 2px solid #18181b; margin-left: -10px;" title="${u.email}">
          ${u.email[0].toUpperCase()}
        </div>
      `).join('');
  }

  // Update Share Modal List
  const permList = document.getElementById('permList');
  if (permList) {
    permList.innerHTML = users.map(u => `
      <div class="collab-user" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0;">
        <div class="avatar-small" style="background: ${u.color}; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">${u.email[0].toUpperCase()}</div>
        <div class="user-info">
            <div class="user-email" style="font-size: 0.9rem; color: var(--text-main);">${u.email}</div>
            <div class="user-role" style="font-size: 0.8rem; color: #10b981;">● Online</div>
        </div>
      </div>
      `).join('');
  }
}

function renderRemoteCursor({ userId, color, coordinates }) {
  if (userId === user.id) return; // Ignore self

  let cursor = document.getElementById(`cursor-${userId}`);

  if (!coordinates) {
    if (cursor) cursor.remove();
    return;
  }

  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = `cursor-${userId}`;
    cursor.className = 'remote-cursor';
    cursor.innerHTML = `<div class="cursor-label" style="background: ${color};">${userId.slice(0, 4)}</div>`;
    document.getElementById('editorScroll').appendChild(cursor);
  }

  cursor.style.position = 'absolute';
  cursor.style.top = `${coordinates.top}px`;
  cursor.style.left = `${coordinates.left}px`;
  cursor.style.height = `${coordinates.height}px`;
  cursor.style.borderLeft = `2px solid ${color}`;
  cursor.style.pointerEvents = 'none';
  cursor.style.zIndex = '10';

  const label = cursor.querySelector('.cursor-label');
  if (label) {
    label.style.position = 'absolute';
    label.style.top = '-1.2em';
    label.style.left = '-2px';
    label.style.color = 'white';
    label.style.fontSize = '10px';
    label.style.padding = '1px 4px';
    label.style.borderRadius = '2px';
    label.style.whiteSpace = 'nowrap';
  }
}

function getCollabChatKey() {
  if (!user?.id || !currentDocId) return null;
  return collabChatStorageKey(user.id, currentDocId);
}

function persistCollabChatMessage({ userEmail, message, role, timestamp }) {
  const key = getCollabChatKey();
  if (!key) return;

  const entry = { userEmail, message, role, timestamp };
  const history = readPersistedMessages(key);
  const last = history[history.length - 1];
  if (
    last &&
    last.userEmail === entry.userEmail &&
    last.message === entry.message &&
    last.role === entry.role &&
    last.timestamp === entry.timestamp
  ) {
    return;
  }

  history.push(entry);
  writePersistedMessages(key, trimToMaxMessages(history));
}

function restoreCollabChatMessages() {
  const key = getCollabChatKey();
  const chatMessages = document.getElementById('chatMessages');
  if (!key || !chatMessages) return;

  chatMessages.innerHTML = '';
  const history = readPersistedMessages(key);
  history.forEach((msg) => addChatMessage(msg, { persist: false }));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearCollabChatMessages() {
  const key = getCollabChatKey();
  if (key) removeLocalStorageKey(key);
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) chatMessages.innerHTML = '';
}

function addChatMessage({ userEmail, message, role, timestamp }, { persist = true } = {}) {
  if (persist) persistCollabChatMessage({ userEmail, message, role, timestamp });

  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const div = document.createElement('div');
  const isMe = userEmail && user?.email && userEmail === user.email;
  const isAi = role === 'ai';

  div.className = `chat-message ${isMe ? 'me' : 'other'}`;
  div.style.marginBottom = '0.75rem';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  div.style.alignItems = isMe && !isAi ? 'flex-end' : 'flex-start'; // AI always left aligned or distinct

  const senderName = isAi ? '✨ AI Assistant' : (isMe ? 'You' : (userEmail ? userEmail.split('@')[0] : 'Unknown'));
  const bg = isAi ? 'linear-gradient(135deg, #a855f7, #ec4899)' : (isMe ? 'var(--primary)' : 'var(--bg-secondary)');
  const color = isAi || isMe ? 'white' : 'var(--text-main)';

  div.innerHTML = `
                                              <div class="message-meta" style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
                                                <span class="sender">${senderName}</span>
                                                <span class="time">${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                              </div>
                                              <div class="message-content" style="
            background: ${bg}; 
            color: ${color};
            padding: 0.5rem 0.75rem;
            border-radius: ${isMe && !isAi ? '12px 12px 0 12px' : '12px 12px 12px 0'};
            max-width: 85%;
            font-size: 0.9rem;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        ">${message}</div>
                                              `;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- COMMENTS LOGIC ---

async function setupComments() {
  const commentsSidebar = document.getElementById('commentsSidebar');
  const commentsToggleBtn = document.getElementById('commentsToggleBtn');
  const closeComments = document.getElementById('closeComments');
  const addCommentBtn = document.getElementById('addCommentBtn');
  const newCommentInput = document.getElementById('newCommentInput');
  const editor = document.getElementById('editor');

  if (commentsToggleBtn) {
    commentsToggleBtn.addEventListener('click', () => {
      commentsSidebar.style.display = commentsSidebar.style.display === 'none' ? 'flex' : 'none';
      if (commentsSidebar.style.display === 'flex') loadComments();
    });
  }

  if (closeComments) {
    closeComments.addEventListener('click', () => {
      commentsSidebar.style.display = 'none';
    });
  }

  if (addCommentBtn) {
    addCommentBtn.addEventListener('click', async () => {
      const content = newCommentInput.value.trim();
      if (!content) return;

      addCommentBtn.disabled = true;
      addCommentBtn.textContent = 'Posting...';

      const { error } = await addComment(currentDocId, content);

      addCommentBtn.disabled = false;
      addCommentBtn.textContent = 'Post';

      if (error) {
        alert('Failed to post comment');
      } else {
        newCommentInput.value = '';
        loadComments();
      }
    });
  }
}

async function loadComments() {
  const commentsList = document.getElementById('commentsList');
  if (!commentsList) return;

  commentsList.innerHTML = '<div style="text-align:center; padding: 1rem;">Loading...</div>';

  const { data: comments, error } = await getComments(currentDocId);

  if (error) {
    commentsList.innerHTML = '<div style="color:red; text-align:center;">Failed to load comments</div>';
    return;
  }

  if (!comments || comments.length === 0) {
    commentsList.innerHTML = '<div style="color:gray; text-align:center; padding: 1rem;">No comments yet</div>';
    return;
  }

  const { data: { user: currentUser } } = await supabase.auth.getUser();

  commentsList.innerHTML = comments.map(c => {
    const isOwner = currentUser && c.user_id === currentUser.id;
    const deleteBtn = isOwner ? `<button onclick="window.deleteCommentAction(${c.id})" style="color:red; background:none; border:none; cursor:pointer; font-size:0.8rem;">Delete</button>` : '';

    return `
                                              <div class="comment-card">
                                                <div class="comment-meta">
                                                  <span class="comment-author">${c.user_email.split('@')[0]}</span>
                                                  <span class="comment-time">${new Date(c.created_at).toLocaleDateString()}</span>
                                                  ${deleteBtn}
                                                </div>
                                                <div class="comment-content">${c.content}</div>
                                              </div>
                                              `;
  }).join('');
}

window.deleteCommentAction = async (id) => {
  if (!confirm('Delete this comment?')) return;
  const { error } = await deleteComment(id);
  if (error) alert('Failed to delete comment');
  else loadComments();
};

// --- SHARE LOGIC ---

async function setupShareLogic() {
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    // Remove old listeners by cloning
    const newBtn = shareBtn.cloneNode(true);
    shareBtn.parentNode.replaceChild(newBtn, shareBtn);

    newBtn.addEventListener('click', async () => {
      const shareModal = document.getElementById('shareModal');
      shareModal.style.display = 'flex';
      loadSharePermissions();
    });
  }
}

async function loadSharePermissions() {
  const permList = document.getElementById('permList');
  if (!permList) return;

  permList.innerHTML = '<div>Loading permissions...</div>';

  // Get current user role to see if they can edit roles
  const doc = documents.find(d => d.id === currentDocId);
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const isOwner = currentUser && doc.user_id === currentUser.id;

  const { data: perms } = await getDocumentPermissions(currentDocId);

  if (!perms) {
    permList.innerHTML = '<div>No permissions found (Public docs may not have explicit perms)</div>';
    return;
  }

  permList.innerHTML = perms.map(p => {
    const canEdit = isOwner && p.user_email !== currentUser.email; // Can't change own role easily here without risking lockout

    let roleBadge = `<span class="role-badge">${p.role}</span>`;

    if (canEdit) {
      roleBadge = `
                <select onchange="window.updateRoleAction('${p.user_email}', this.value)" style="padding:2px; font-size:0.8rem;">
                    <option value="viewer" ${p.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    <option value="commenter" ${p.role === 'commenter' ? 'selected' : ''}>Commenter</option>
                    <option value="editor" ${p.role === 'editor' ? 'selected' : ''}>Editor</option>
                </select>
            `;
    }

    return `
                                              <div class="collab-user" style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #eee;">
                                                <div class="user-info">
                                                  <div class="user-email" style="font-size: 0.9rem;">${p.user_email}</div>
                                                </div>
                                                ${roleBadge}
                                              </div>
                                              `;
  }).join('');
}

window.updateRoleAction = async (email, newRole) => {
  if (!confirm(`Change ${email} to ${newRole}?`)) return loadSharePermissions(); // Revert if cancelled

  try {
    await shareDocument(currentDocId, email, newRole);
    alert('Role updated!');
  } catch (e) {
    alert('Failed to update role');
    console.error(e);
  }
  loadSharePermissions();
};
window.addEventListener('popstate', () => {
  // Basic handling for back/forward browser buttons
  const urlParams = new URLSearchParams(window.location.search);
  const docId = urlParams.get('doc');

  if (docId && user) {
    // If we have a docId and user is logged in, try to open it
    // We might need to ensure docs are loaded, but usually they are if we are in app
    const targetDoc = documents.find(d => d.id === docId);
    if (targetDoc) {
      currentDocId = docId;
      renderEditor();
    } else {
      // Fallback if not found in loaded docs (maybe refresh needed, or invalid)
      // For now, just go to dashboard if valid doc not found
      closeDoc();
    }
  } else if (user) {
    // No docId, show dashboard
    if (currentDocId) {
      closeDoc();
    } else {
      renderDashboard();
    }
  }
});
