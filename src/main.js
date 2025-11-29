import './style.css';
import { generateContent } from './api/gemini.js';
import { supabase, signIn, signUp, signInWithProvider, signOut, getUser, submitFeedback, getDocuments, getPublicDocument, createDocument, updateDocument, deleteDocument } from './api/supabase.js';


// State
let documents = [];
let currentDocId = null;
let user = null;

// DOM Elements
const app = document.querySelector('#app');

// --- INITIALIZATION ---

window.renderLogin = renderLogin; // Expose to global scope for inline onclick handlers


async function init() {
  // Check for public document view first
  const urlParams = new URLSearchParams(window.location.search);
  const publicDocId = urlParams.get('doc');

  if (publicDocId) {
    await loadPublicDocument(publicDocId);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  user = session?.user;

  if (user) {
    await migrateLocalDocsToSupabase();
    await loadDocs();

    // Check if tutorial should be shown
    const tutorialCompleted = localStorage.getItem('proedit_tutorial_completed');
    if (!tutorialCompleted) {
      renderDashboard();
      setTimeout(() => startTutorial(), 500);
    } else {
      renderDashboard();
    }
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
        <div class="brand" style="justify-content: center; margin-bottom: 1rem;">ProEdit</div>
        <h1 class="login-title">Welcome back</h1>
        <p class="login-subtitle">Sign in to your account to continue</p>
        
        <div class="error-msg" id="errorMsg"></div>

        <form id="loginForm">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="email" placeholder="name@example.com" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" class="form-input" id="password" placeholder="••••••••" required>
          </div>
          <button type="submit" class="auth-btn">Sign In</button>
        </form>

        <div class="oauth-buttons">
          <button class="oauth-btn" id="googleBtn">
            <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQgMhgB-GccVnB-ZJFuZg7HUsmdifnuxStqmA&s" class="oauth-icon" alt="Google">
            Sign in with Google
          </button>
          <button class="oauth-btn" id="githubBtn">
            <img src="https://images.icon-icons.com/3685/PNG/512/github_logo_icon_229278.png" class="oauth-icon" alt="GitHub">
            Sign in with GitHub
          </button>
        </div>

        <div class="auth-link">
          Don't have an account? <a id="toggleAuth">Sign up</a>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('loginForm');
  const toggleBtn = document.getElementById('toggleAuth');
  const title = document.querySelector('.login-title');
  const btn = document.querySelector('.auth-btn');
  const subtitle = document.querySelector('.login-subtitle');
  let isSignUp = false;

  toggleBtn.addEventListener('click', () => {
    isSignUp = !isSignUp;
    title.textContent = isSignUp ? 'Create account' : 'Welcome back';
    subtitle.textContent = isSignUp ? 'Start your writing journey today' : 'Sign in to your account to continue';
    btn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    toggleBtn.textContent = isSignUp ? 'Sign in' : 'Sign up';
    document.querySelector('.auth-link').childNodes[0].textContent = isSignUp ? 'Already have an account? ' : "Don't have an account? ";
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMsg');



    btn.disabled = true;
    btn.textContent = 'Loading...';
    errorMsg.style.display = 'none';

    let result;
    if (isSignUp) {
      result = await signUp(email, password);
    } else {
      result = await signIn(email, password);
    }

    if (result.error) {
      console.error("Auth Error:", result.error);
      errorMsg.style.display = 'block';

      if (result.error.message.includes("Email not confirmed")) {
        errorMsg.innerHTML = `
          Please check your email to confirm your account.<br>
          <small>If you don't see it, check your spam folder.</small>
        `;
      } else {
        errorMsg.textContent = result.error.message;
      }

      btn.disabled = false;
      btn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    } else if (isSignUp && !result.data.session) {
      // Sign up successful but email confirmation needed
      errorMsg.style.display = 'block';
      errorMsg.style.background = '#dbeafe';
      errorMsg.style.color = '#1e40af';
      errorMsg.innerHTML = `
        Account created! Please check your email to confirm your account before logging in.
      `;
      btn.disabled = false;
      btn.textContent = 'Sign Up';
    }
  });

  document.getElementById('googleBtn').addEventListener('click', () => signInWithProvider('google'));
  document.getElementById('githubBtn').addEventListener('click', () => signInWithProvider('github'));
}

function renderDashboard() {
  app.innerHTML = `
    <div class="dashboard">
      <div class="dashboard-header">
        <div class="brand">Welcome to <b>ProEdit</b></div>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <span style="font-size: 0.9rem; color: var(--text-muted);">${user.email || 'User'}</span>
          <button class="create-btn" id="createBtn">
            <span>+</span> New Document
          </button>
          <button class="create-btn" id="logoutBtn" style="background: white; color: var(--text-main); border: 1px solid var(--border); box-shadow: none;">
            Sign Out
          </button>
        </div>
      </div>
      
      <div class="grid" id="docGrid">
        ${documents.map(doc => `
          <div class="doc-card" onclick="window.openDoc('${doc.id}')">
            <button class="delete-btn" onclick="window.deleteDoc(event, '${doc.id}')" title="Delete">
            <i class="iconoir-trash"></i>
            </button>
            <div class="doc-preview">
              ${doc.content.replace(/<[^>]*>/g, '').slice(0, 150) || 'Empty document...'}
            </div>
            <div class="doc-meta">
              <div class="doc-title">${doc.title || 'Untitled'}</div>
              <div class="doc-date">${new Date(doc.updatedAt).toLocaleDateString()}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('createBtn').addEventListener('click', createNewDoc);
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut();
  });
}

function renderEditor() {
  const doc = documents.find(d => d.id === currentDocId);
  if (!doc) return;

  app.innerHTML = `
    <div class="editor-layout">
      <!-- Beta Top Bar -->
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
      <!-- Top Bar: Menu + Toolbar -->
      <div class="top-bar">
        <div class="menu-bar">
          <div class="doc-info">
            <input type="text" class="doc-title-input" id="docTitle" value="${doc.title || 'Untitled Document'}" placeholder="Untitled Document">
          </div>
          <div style="flex: 1"></div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="deploy-btn ${doc.is_public ? 'published' : ''}" id="deployBtn" title="Deploy to Web">
              <i class="iconoir-rocket"></i>
              <span id="deployText">${doc.is_public ? 'Published' : 'Deploy'}</span>
            </button>
            <button class="tool-btn" id="backBtn" title="Back to Dashboard">
              <i class="iconoir-arrow-left"></i>
            </button>
          </div>
        </div>

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

      <!-- Editor Area -->
      <div class="editor-scroll-container">
        <div id="editor" contenteditable="true" spellcheck="false">
          ${doc.content}
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
            <button class="ai-btn-icon" id="closeHelpChat">×</button>
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

function openDoc(id) {
  currentDocId = id;
  renderEditor();
}

window.openDoc = openDoc;

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
  const { data, error } = await getDocuments();
  if (error) {
    console.error('Error loading documents:', error);
    documents = [];
    return;
  }
  documents = data || [];
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
          <div style="display: flex; gap: 1rem; align-items: center;">
            <span style="font-size: 0.9rem; color: var(--text-muted);">📖 Read-Only View</span>
            <button class="cta-btn" onclick="window.location.href='${window.location.origin}'">Sign in to Edit</button>
          </div>
        </div>
      </div>

      <div class="editor-scroll-container">
        <div id="editor" contenteditable="false" spellcheck="false">
          ${doc.content}
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

  backBtn.addEventListener('click', () => {
    currentDocId = null;
    renderDashboard();
  });

  // Deploy button
  const deployBtn = document.getElementById('deployBtn');
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
    document.getElementById('deployText').textContent = newPublicStatus ? 'Published' : 'Deploy';

    // Show appropriate message
    if (newPublicStatus) {
      const shareUrl = `${window.location.origin}?doc=${currentDocId}`;
      prompt('Document is now public! Share this URL:', shareUrl);
    } else {
      alert('Document is now private');
    }
  });

  docTitle.addEventListener('input', (e) => {
    updateCurrentDoc({ title: e.target.value });
  });

  editor.addEventListener('input', (e) => {
    updateCurrentDoc({ content: editor.innerHTML });
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
    popup.style.display = 'flex';
    document.getElementById('aiInput').focus();

    // If text is selected, show a hint in the input
    if (currentSelection && currentSelection.text) {
      document.getElementById('aiInput').placeholder = `Edit: "${currentSelection.text.slice(0, 20)}..."`;
    } else {
      document.getElementById('aiInput').placeholder = "Ask AI to write, edit, or summarize...";
    }
  });

  // AI Panel Drag Logic
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  aiHeader.addEventListener("mousedown", dragStart);
  document.addEventListener("mouseup", dragEnd);
  document.addEventListener("mousemove", drag);

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

  expandAi.addEventListener('click', () => {
    aiPopup.classList.toggle('split-view');
    document.querySelector('.editor-layout').classList.toggle('has-sidebar');
    expandAi.textContent = aiPopup.classList.contains('split-view') ? '⤡' : '⤢';
  });

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
      const response = await generateContent(prompt);

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

  aiSend.addEventListener('click', handleSend);
  aiInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  // Slash Menu
  document.querySelectorAll('.slash-item').forEach(item => {
    item.addEventListener('click', () => triggerSlashAction(item.dataset.action));
  });

  editor.addEventListener('keydown', (e) => {
    if (slashMenu.classList.contains('visible')) {
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
  const msgs = document.getElementById('aiMessages');
  const div = document.createElement('div');
  div.className = `ai-message ${sender}`;

  // Format markdown-ish
  const formatted = text
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
      margin: 1,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
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
      const response = await generateContent(prompt);
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
let tutorialDemoDocId = null;

const tutorialSteps = [
  {
    target: '.create-btn',
    title: 'Welcome to ProEdit! 👋',
    content: 'Let\'s take a quick tour to help you get started. First, click the "+ New Document" button to create your first document.',
    action: null
  },
  {
    target: '#editor',
    title: 'Meet the Editor ✏️',
    content: 'This is your canvas! Start typing to create beautiful documents. The editor supports rich text and auto-saving.',
    action: null
  },
  {
    target: '.toolbar',
    title: 'Formatting Tools 🎨',
    content: 'Use the toolbar to style your text. You can change fonts, adjust sizes, add colors, and apply bold or italic styles to make your document pop.',
    action: null
  },
  {
    target: '.ai-trigger',
    title: 'AI Assistant 🤖',
    content: 'Click this button to open your AI assistant. It can help you write, edit, and improve your content. Try asking it to "continue writing" or "fix grammar"!',
    action: null
  },
  {
    target: '#deployBtn',
    title: 'Deploy to Web 🚀',
    content: 'Share your work with the world! Click "Deploy" to make your document public and get a shareable link. Perfect for portfolios, blogs, or sharing ideas.',
    action: null
  },
  {
    target: '.dropdown',
    title: 'Export & More 📥',
    content: 'Export your documents as PDF, Word, or Markdown. ProEdit makes it easy to take your work anywhere!',
    action: 'complete'
  }
];

function startTutorial() {
  currentTutorialStep = 0;

  // Add tutorial overlay to body
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
          <button class="tutorial-skip" id="tutorialSkip">Skip Tutorial</button>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <span class="tutorial-progress" id="tutorialProgress"></span>
            <button class="tutorial-next" id="tutorialNext">Next</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById('tutorialNext').addEventListener('click', nextTutorialStep);
    document.getElementById('tutorialSkip').addEventListener('click', endTutorial);
    document.getElementById('tutorialCloseBtn').addEventListener('click', endTutorial);
  }

  showTutorialStep();
}

function showTutorialStep() {
  if (currentTutorialStep >= tutorialSteps.length) {
    endTutorial();
    return;
  }

  const step = tutorialSteps[currentTutorialStep];
  const overlay = document.getElementById('tutorialOverlay');
  const spotlight = document.getElementById('tutorialSpotlight');
  const card = document.getElementById('tutorialCard');

  overlay.style.display = 'block';

  // Update content
  document.getElementById('tutorialTitle').textContent = step.title;
  document.getElementById('tutorialContent').textContent = step.content;
  document.getElementById('tutorialProgress').textContent = `${currentTutorialStep + 1} of ${tutorialSteps.length}`;

  // Update button text for last step
  const nextBtn = document.getElementById('tutorialNext');
  nextBtn.textContent = currentTutorialStep === tutorialSteps.length - 1 ? 'Finish' : 'Next';

  // Position spotlight and card
  const targetEl = document.querySelector(step.target);
  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();

    // Position spotlight
    spotlight.style.top = `${rect.top - 10}px`;
    spotlight.style.left = `${rect.left - 10}px`;
    spotlight.style.width = `${rect.width + 20}px`;
    spotlight.style.height = `${rect.height + 20}px`;

    // Position card
    let cardTop = rect.bottom + 20;
    let cardLeft = rect.left;

    // Adjust if card goes off screen
    if (cardTop + 300 > window.innerHeight) {
      cardTop = rect.top - 320;
    }
    if (cardLeft + 380 > window.innerWidth) {
      cardLeft = window.innerWidth - 400;
    }
    if (cardLeft < 20) {
      cardLeft = 20;
    }

    card.style.top = `${cardTop}px`;
    card.style.left = `${cardLeft}px`;
  }

  // Handle special actions for certain steps
  if (step.action === 'create-doc' && currentTutorialStep === 0) {
    // Wait for user to create doc, then auto-proceed
    const createBtn = document.querySelector('.create-btn');
    const originalOnClick = createBtn.onclick;
    createBtn.onclick = async function () {
      await createDemoDocument();
      setTimeout(() => nextTutorialStep(), 1000);
    };
  }
}

async function createDemoDocument() {
  const demoContent = `
    <h1 style="font-size: 36px; font-family: 'Playfair Display', serif; margin-bottom: 0.5rem;">Meet <strong>ProEdit</strong>, the AI text editor that can...</h1>
    
    <p style="font-family: 'Courier Prime', monospace; margin: 1rem 0; color: #666;">learn your unique style.</p>
    
    <p style="margin: 1rem 0;"><em>transform raw ideas into polished prose.</em></p>
    
    <p style="margin: 1rem 0;"><em>accelerate your workflow, and boost your creativity.</em></p>
    
    <h2 style="font-size: 28px; font-family: 'Playfair Display', serif; margin: 2rem 0 1rem 0;">From emails to epic narratives, perfected instantly.</h2>
  `;

  const newDoc = {
    id: Date.now().toString(),
    user_id: user.id,
    title: 'Meet ProEdit',
    content: demoContent,
    is_public: false
  };

  const { data, error } = await createDocument(newDoc);
  if (!error && data) {
    documents.unshift(data);
    tutorialDemoDocId = data.id;
    currentDocId = data.id;
    renderEditor();
  }
}

function nextTutorialStep() {
  // Handle step-specific actions
  const currentStep = tutorialSteps[currentTutorialStep];

  if (currentStep.action === 'complete') {
    endTutorial();
    return;
  }

  // Special handling for first step - create demo doc
  if (currentTutorialStep === 0) {
    // Hide overlay temporarily while document loads
    document.getElementById('tutorialOverlay').style.display = 'none';

    createDemoDocument().then(() => {
      currentTutorialStep++;
      // Wait for editor to render, then show next step
      // Use polling to ensure overlay is found and shown
      let attempts = 0;
      const interval = setInterval(() => {
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay) {
          overlay.style.display = 'block';
          showTutorialStep();
          clearInterval(interval);
        }
        attempts++;
        if (attempts > 20) clearInterval(interval); // Stop after 2 seconds
      }, 100);
    });
    return;
  }

  currentTutorialStep++;
  showTutorialStep();
}

function endTutorial() {
  const overlay = document.getElementById('tutorialOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  localStorage.setItem('proedit_tutorial_completed', 'true');
}

window.startTutorial = startTutorial;
window.endTutorial = endTutorial; // Expose for help button
