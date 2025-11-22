import './style.css';
import { generateContent } from './api/gemini.js';
import { supabase, signIn, signUp, signInWithProvider, signOut, getUser } from './api/supabase.js';

// State
let documents = [];
let currentDocId = null;
let user = null;

// DOM Elements
const app = document.querySelector('#app');

// --- INITIALIZATION ---

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  user = session?.user;

  if (user) {
    loadDocs();
    renderDashboard();
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
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" class="oauth-icon" alt="Google">
            Sign in with Google
          </button>
          <button class="oauth-btn" id="githubBtn">
            <img src="https://www.svgrepo.com/show/475654/github-color.svg" class="oauth-icon" alt="GitHub">
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
      <!-- Top Bar: Menu + Toolbar -->
      <div class="top-bar">
        <div class="menu-bar">
          <div class="doc-info">
            <input type="text" class="doc-title-input" id="docTitle" value="${doc.title || 'Untitled Document'}" placeholder="Untitled Document">
          </div>
          <div style="flex: 1"></div>
          <div style="display: flex; gap: 1rem; align-items: center;">
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
      <div class="ai-popup" id="aiPopup">
        <div class="ai-header">
          <div class="ai-title">AI Assistant</div>
          <div class="ai-controls">
            <button class="ai-btn-icon" id="expandAi" title="Expand">⤢</button>
            <button class="ai-btn-icon" id="closeAi" title="Close">×</button>
          </div>
        </div>
        <div class="ai-messages" id="aiMessages">
          <!-- Messages will appear here -->
        </div>
        <div class="ai-input-area">
          <input type="text" class="ai-input" id="aiInput" placeholder="Ask AI to write, edit, or summarize...">
          <button class="ai-send" id="aiSend">➤</button>
        </div>
      </div>
    </div>
  `;

  setupEditorListeners();

  // Page Break Listener
  document.getElementById('pageBreakBtn').addEventListener('click', () => {
    const pageBreak = '<div class="page-break" contenteditable="false"></div>';
    document.execCommand('insertHTML', false, pageBreak);
  });
}

// --- ACTIONS ---

function createNewDoc() {
  const newDoc = {
    id: Date.now().toString(),
    title: 'Untitled Document',
    content: '',
    updatedAt: Date.now()
  };
  documents.unshift(newDoc);
  saveDocs();
  openDoc(newDoc.id);
}

function openDoc(id) {
  currentDocId = id;
  renderEditor();
}

window.openDoc = openDoc;

window.deleteDoc = (e, id) => {
  e.stopPropagation();
  if (confirm('Are you sure you want to delete this document?')) {
    documents = documents.filter(d => d.id !== id);
    saveDocs();
    renderDashboard();
  }
};

function loadDocs() {
  if (!user) return;
  const key = `proedit_docs_${user.id}`;
  documents = JSON.parse(localStorage.getItem(key)) || [];
}

function saveDocs() {
  if (!user) return;
  const key = `proedit_docs_${user.id}`;
  localStorage.setItem(key, JSON.stringify(documents));
}

function updateCurrentDoc(updates) {
  const index = documents.findIndex(d => d.id === currentDocId);
  if (index !== -1) {
    documents[index] = { ...documents[index], ...updates, updatedAt: Date.now() };
    saveDocs();
  }
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
  const closeAi = document.getElementById('closeAi');
  const expandAi = document.getElementById('expandAi');
  const aiTrigger = document.getElementById('aiTrigger');
  const aiInput = document.getElementById('aiInput');
  const aiSend = document.getElementById('aiSend');

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

  closeAi.addEventListener('click', () => {
    aiPopup.classList.remove('visible');
    aiPopup.classList.remove('split-view');
    document.querySelector('.editor-layout').classList.remove('has-sidebar');
    expandAi.textContent = '⤢';
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

function renderLanding() {
  window.renderLogin = renderLogin; // Ensure global access
  app.innerHTML = `
    <div class="landing-container">
      <nav class="landing-nav">
        <div class="brand">ProEdit</div>
        <button class="auth-btn" style="width: auto; padding: 0.5rem 1.5rem;" onclick="renderLogin()">Sign In</button>
      </nav>
      
      <main class="landing-hero">
        <h1 class="hero-title">Write Smarter, Not Harder</h1>
        <p class="hero-subtitle">The intelligent writing assistant that helps you create, edit, and format your documents with the power of AI.</p>
        <button class="cta-btn" onclick="renderLogin()">Start Writing for Free</button>
      </main>
      
      
      <footer class="landing-footer">
        &copy; 2025 ProEdit. All rights reserved.
      </footer>
    </div>
  `;
}
