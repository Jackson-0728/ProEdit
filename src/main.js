import './style.css';
import './editor-minimal.css';
import { generateContent, evaluateModels, generateLayouts } from './api/gemini.js';
import { CollaborationManager } from './api/collaboration.js';
import {
  supabase, signIn, signUp, signOut, signInWithProvider, resetPassword, getDocuments, createDocument, updateDocument, deleteDocument, submitFeedback, getPublicDocument, getSharedDocuments, shareDocument, getDocumentPermissions, addComment, getComments, updateComment, deleteComment, getDocumentChatMessages, createDocumentChatMessage, deleteDocumentChatMessage, clearDocumentChatMessages, subscribeToDocumentChat
} from './api/supabase.js';


// State
let documents = [];
let currentDocId = null;
let user = null;
let collaborationManager = null;
let collabUsers = [];
let documentChatUnsubscribe = null;
let pendingCommentSelection = null;
let cachedComments = [];
let commentAnchors = [];
let activeCommentId = null;
let commentHighlightRaf = null;
let commentHighlightObserver = null;
let commentHighlightResizeHandler = null;

// DOM Elements
const app = document.querySelector('#app');
const RESET_PASSWORD_PATH = '/reset-password';
const TEMPLATE_ORDER = ['blank', 'meeting', 'proposal', 'report', 'letter', 'resume', 'blog'];
const TEMPLATE_LIBRARY = {
  blank: {
    name: 'Blank Document',
    desc: 'Start from scratch with a clean page.',
    icon: 'iconoir-page',
    gradient: 'blue',
    docTitle: 'Untitled Document',
    content: ''
  },
  meeting: {
    name: 'Meeting Notes',
    desc: 'Structured notes with decisions and action items.',
    icon: 'iconoir-pin',
    gradient: 'purple',
    docTitle: 'Weekly Product Sync',
    content: `
      <h1>Weekly Product Sync</h1>
      <p><strong>Date:</strong> [Month Day, Year] &nbsp;&nbsp; <strong>Time:</strong> [10:00 AM - 10:45 AM] &nbsp;&nbsp; <strong>Facilitator:</strong> [Name]</p>
      <p><strong>Meeting Goal:</strong> Align on priorities, unblock delivery, and confirm owners for next milestones.</p>

      <h2>Attendees</h2>
      <ul>
        <li>[Name, Role]</li>
        <li>[Name, Role]</li>
        <li>[Name, Role]</li>
      </ul>

      <h2>Agenda</h2>
      <ol>
        <li>Wins from last week</li>
        <li>Current sprint status</li>
        <li>Blockers and dependencies</li>
        <li>Decisions needed</li>
      </ol>

      <h2>Discussion Notes</h2>
      <h3>1. Progress Update</h3>
      <ul>
        <li>[What shipped this week]</li>
        <li>[What moved to next sprint]</li>
      </ul>
      <h3>2. Risks / Blockers</h3>
      <ul>
        <li>[Risk and impact]</li>
        <li>[Mitigation owner]</li>
      </ul>

      <h2>Decisions Made</h2>
      <ul>
        <li>[Decision] - <strong>Owner:</strong> [Name] - <strong>Date:</strong> [Date]</li>
      </ul>

      <h2>Action Items</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Action</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Owner</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Due Date</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Action item]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Name]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Date]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Not Started</td>
          </tr>
        </tbody>
      </table>

      <h2>Next Meeting</h2>
      <p><strong>Date:</strong> [Month Day, Year] &nbsp;&nbsp; <strong>Focus:</strong> [Main objective]</p>
      <p><em>Tip: replace bracketed placeholders and remove this note before sharing.</em></p>
    `
  },
  proposal: {
    name: 'Project Proposal',
    desc: 'Client-ready proposal with scope, timeline, and budget.',
    icon: 'iconoir-suitcase',
    gradient: 'pink',
    docTitle: 'Project Proposal - [Project Name]',
    content: `
      <h1>Project Proposal</h1>
      <p><strong>Project:</strong> [Project Name]</p>
      <p><strong>Prepared For:</strong> [Client / Team]</p>
      <p><strong>Prepared By:</strong> [Your Name / Company]</p>
      <p><strong>Date:</strong> [Month Day, Year]</p>

      <h2>Executive Summary</h2>
      <p>This proposal outlines a practical approach to deliver <strong>[target outcome]</strong> in <strong>[timeline]</strong>, with clear owners, measurable outcomes, and phased delivery to reduce risk.</p>

      <h2>Problem Statement</h2>
      <p>[Describe the current challenge, business impact, and why action is needed now.]</p>

      <h2>Objectives</h2>
      <ul>
        <li>Increase [metric] by [target percentage] within [timeframe]</li>
        <li>Reduce [pain point] by implementing [solution area]</li>
        <li>Establish a repeatable process for [team/workflow]</li>
      </ul>

      <h2>Scope</h2>
      <h3>In Scope</h3>
      <ul>
        <li>[Deliverable 1]</li>
        <li>[Deliverable 2]</li>
        <li>[Deliverable 3]</li>
      </ul>
      <h3>Out of Scope</h3>
      <ul>
        <li>[Boundary 1]</li>
        <li>[Boundary 2]</li>
      </ul>

      <h2>Implementation Plan</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Phase</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Activities</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Duration</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Output</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Discovery</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Stakeholder interviews, requirement mapping</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">1-2 weeks</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Approved requirements brief</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Build</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Implementation and weekly reviews</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">3-5 weeks</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Working solution</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Launch</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">QA, rollout, and handoff</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">1 week</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Go-live and documentation</td>
          </tr>
        </tbody>
      </table>

      <h2>Budget Estimate</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Line Item</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Discovery and planning</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">$[Amount]</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Build and testing</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">$[Amount]</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;"><strong>Total</strong></td>
            <td style="border: 1px solid #d1d5db; padding: 8px;"><strong>$[Total]</strong></td>
          </tr>
        </tbody>
      </table>

      <h2>Risks and Mitigations</h2>
      <ul>
        <li><strong>Risk:</strong> [Description] - <strong>Mitigation:</strong> [Plan]</li>
        <li><strong>Risk:</strong> [Description] - <strong>Mitigation:</strong> [Plan]</li>
      </ul>

      <h2>Approval</h2>
      <p>If approved, we can begin discovery on <strong>[Start Date]</strong>.</p>
      <p><strong>Sign-off:</strong> ____________________________</p>
    `
  },
  report: {
    name: 'Report',
    desc: 'Insight-focused report with metrics and recommendations.',
    icon: 'iconoir-graph-up',
    gradient: 'orange',
    docTitle: 'Performance Report - [Period]',
    content: `
      <h1>Performance Report</h1>
      <p><strong>Period:</strong> [Q1 2026]</p>
      <p><strong>Prepared By:</strong> [Name]</p>
      <p><strong>Date:</strong> [Month Day, Year]</p>

      <h2>Executive Summary</h2>
      <p>During this period, the team delivered strong progress against goals for <strong>[initiative]</strong>, with notable gains in <strong>[metric A]</strong> and <strong>[metric B]</strong>. The primary gap remains <strong>[area]</strong>, which is addressed in the recommendations section.</p>

      <h2>Key Metrics</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Metric</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Current</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Target</th>
            <th style="text-align: left; border: 1px solid #d1d5db; padding: 8px;">Trend</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Metric A]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Value]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Value]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Up / Flat / Down</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Metric B]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Value]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">[Value]</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Up / Flat / Down</td>
          </tr>
        </tbody>
      </table>

      <h2>Highlights</h2>
      <ul>
        <li>[Major win and why it mattered]</li>
        <li>[Operational improvement that increased efficiency]</li>
        <li>[Customer or stakeholder impact delivered]</li>
      </ul>

      <h2>Detailed Findings</h2>
      <h3>What Worked</h3>
      <p>[Summarize initiatives that performed well with supporting evidence.]</p>
      <h3>What Did Not Work</h3>
      <p>[Summarize underperforming areas and root causes.]</p>
      <h3>Notable Dependencies</h3>
      <p>[Cross-team or external factors that affected outcomes.]</p>

      <h2>Recommendations</h2>
      <ol>
        <li>[Recommendation 1] - Expected impact: [description]</li>
        <li>[Recommendation 2] - Expected impact: [description]</li>
        <li>[Recommendation 3] - Expected impact: [description]</li>
      </ol>

      <h2>Next Steps</h2>
      <ul>
        <li>[Action and owner]</li>
        <li>[Action and owner]</li>
      </ul>
    `
  },
  letter: {
    name: 'Letter',
    desc: 'Professional letter format for business communication.',
    icon: 'iconoir-mail',
    gradient: 'green',
    docTitle: 'Formal Letter - [Subject]',
    content: `
      <p>[Your Name]</p>
      <p>[Your Title]</p>
      <p>[Company Name]</p>
      <p>[Street Address]</p>
      <p>[City, State ZIP]</p>
      <p>[Email] | [Phone]</p>
      <p>[Month Day, Year]</p>

      <p>[Recipient Name]</p>
      <p>[Recipient Title]</p>
      <p>[Recipient Company]</p>
      <p>[Recipient Address]</p>
      <p>[City, State ZIP]</p>

      <p><strong>Subject:</strong> [Clear Subject Line]</p>

      <p>Dear [Recipient Name],</p>

      <p>I am writing to [purpose of letter] regarding [topic/context].</p>

      <p>[Second paragraph with supporting details, timeline, or request.]</p>

      <p>[Third paragraph with next steps, desired outcome, or closing context.]</p>

      <p>Thank you for your time and consideration. Please let me know if you would like to discuss this further.</p>

      <p>Sincerely,</p>

      <p>[Your Name]</p>
      <p>[Optional Signature Block]</p>
    `
  },
  resume: {
    name: 'Resume',
    desc: 'Modern resume layout with impact-focused sections.',
    icon: 'iconoir-user',
    gradient: 'teal',
    docTitle: 'Resume - [Your Name]',
    content: `
      <h1>[Your Name]</h1>
      <p><strong>[Target Role]</strong></p>
      <p>[City, State] | [Email] | [Phone] | [Portfolio / LinkedIn]</p>

      <h2>Professional Summary</h2>
      <p>Results-driven [role] with [X] years of experience in [domain]. Proven ability to [impact statement], lead cross-functional initiatives, and deliver measurable outcomes in fast-paced environments.</p>

      <h2>Core Skills</h2>
      <p><strong>Technical:</strong> [Skill], [Skill], [Skill], [Skill]</p>
      <p><strong>Business:</strong> Strategy, Stakeholder Management, Project Delivery, Communication</p>

      <h2>Experience</h2>
      <h3>[Most Recent Job Title] - [Company]</h3>
      <p><em>[Month Year] - Present | [Location]</em></p>
      <ul>
        <li>Led [initiative], increasing [metric] by <strong>[X]%</strong> in [timeframe].</li>
        <li>Built and launched [project], reducing [problem] by <strong>[X]%</strong>.</li>
        <li>Partnered with [teams] to deliver [outcome], improving [business impact].</li>
      </ul>

      <h3>[Previous Job Title] - [Company]</h3>
      <p><em>[Month Year] - [Month Year] | [Location]</em></p>
      <ul>
        <li>Managed [responsibility], delivering [result].</li>
        <li>Optimized [process], saving [time/cost] by [amount].</li>
      </ul>

      <h2>Projects</h2>
      <h3>[Project Name]</h3>
      <p>[One-line summary of project goal and what you built.]</p>
      <ul>
        <li><strong>Stack:</strong> [Tech stack]</li>
        <li><strong>Result:</strong> [Outcome or metric]</li>
      </ul>

      <h2>Education</h2>
      <p><strong>[Degree]</strong> - [School], [Year]</p>
      <p>[Relevant coursework, honors, or leadership if applicable]</p>

      <h2>Certifications</h2>
      <ul>
        <li>[Certification Name] - [Issuer], [Year]</li>
      </ul>
    `
  },
  blog: {
    name: 'Blog Post',
    desc: 'Editorial blog template with strong flow and CTA.',
    icon: 'iconoir-pen-tablet',
    gradient: 'indigo',
    docTitle: 'Blog Post - [Topic]',
    content: `
      <h1>[Compelling Blog Title]</h1>
      <p><em>[A sharp one-line subtitle that promises value.]</em></p>
      <p><strong>By:</strong> [Author Name] &nbsp;&nbsp; <strong>Published:</strong> [Month Day, Year] &nbsp;&nbsp; <strong>Read Time:</strong> [X min]</p>

      <h2>Introduction</h2>
      <p>Start with a relatable problem or surprising fact that hooks the reader. Explain why this topic matters now and what the reader will gain by finishing the article.</p>

      <h2>Key Insight #1</h2>
      <p>[Explain the first core idea clearly and practically. Add a concrete example.]</p>
      <ul>
        <li>[Specific takeaway]</li>
        <li>[Specific takeaway]</li>
      </ul>

      <h2>Key Insight #2</h2>
      <p>[Introduce a second angle, framework, or case study.]</p>
      <blockquote>[Optional quote, customer insight, or key statement.]</blockquote>

      <h2>How to Apply This</h2>
      <ol>
        <li>[Step 1 the reader can implement today]</li>
        <li>[Step 2 with expected result]</li>
        <li>[Step 3 with a practical checkpoint]</li>
      </ol>

      <h2>Common Mistakes to Avoid</h2>
      <ul>
        <li>[Mistake] - Better approach: [Fix]</li>
        <li>[Mistake] - Better approach: [Fix]</li>
      </ul>

      <h2>Conclusion</h2>
      <p>Summarize the main point in plain language and reinforce the next best action for the reader.</p>
      <p><strong>Call to Action:</strong> [Invite readers to comment, subscribe, or try the framework.]</p>
    `
  }
};

// --- INITIALIZATION ---

window.renderLogin = renderLogin; // Expose to global scope for inline onclick handlers

function normalizePathname(pathname) {
  const normalized = String(pathname || '/').replace(/\/+$/, '');
  return normalized || '/';
}

function isResetPasswordRoute() {
  return normalizePathname(window.location.pathname) === RESET_PASSWORD_PATH;
}

async function establishRecoverySessionFromUrl() {
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);

  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  const recoveryType = hashParams.get('type');

  if (!accessToken || !refreshToken || recoveryType !== 'recovery') {
    return { consumed: false, error: null };
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (error) {
    return { consumed: true, error };
  }

  window.history.replaceState({}, '', RESET_PASSWORD_PATH);
  return { consumed: true, error: null };
}

async function handleResetPasswordRoute() {
  const { error } = await establishRecoverySessionFromUrl();
  if (error) {
    renderResetPassword({ valid: false, message: `This reset link is invalid or expired. ${error.message}` });
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    renderResetPassword({ valid: false, message: 'This reset link is invalid or expired. Please request a new one.' });
    return;
  }

  renderResetPassword({ valid: true });
}


async function init() {
  if (isResetPasswordRoute()) {
    await handleResetPasswordRoute();
    return;
  }

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

function renderResetPassword({ valid = false, message = '' } = {}) {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <div class="brand-logo">ProEdit</div>
          <p class="brand-tagline">Set a new password for your account.</p>
        </div>
        <div class="error-msg ${valid ? 'success' : 'error'}" id="resetStatus" style="display: ${message ? 'block' : 'none'};"></div>
        ${valid
      ? `
          <form id="resetPasswordForm" class="auth-form">
            <div class="form-group">
              <label class="form-label">New Password</label>
              <div class="input-with-icon">
                <i class="iconoir-lock"></i>
                <input type="password" class="form-input" id="newPassword" placeholder="At least 8 characters" required minlength="8">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Confirm Password</label>
              <div class="input-with-icon">
                <i class="iconoir-lock"></i>
                <input type="password" class="form-input" id="confirmPassword" placeholder="Re-enter password" required minlength="8">
              </div>
            </div>
            <button type="submit" class="auth-btn" id="resetPasswordSubmitBtn">
              <span id="resetPasswordSubmitText">Update Password</span>
            </button>
          </form>
        `
      : `
          <button class="auth-btn" id="resetBackToLoginBtn">
            <span>Back to Login</span>
          </button>
        `}
      </div>
    </div>
  `;

  const statusEl = document.getElementById('resetStatus');
  if (statusEl && message) {
    statusEl.textContent = message;
  }

  if (!valid) {
    const backBtn = document.getElementById('resetBackToLoginBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.history.replaceState({}, '', '/');
        renderLogin();
      });
    }
    return;
  }

  const form = document.getElementById('resetPasswordForm');
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const submitBtn = document.getElementById('resetPasswordSubmitBtn');
  const submitText = document.getElementById('resetPasswordSubmitText');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const password = newPassword.value;
    const confirm = confirmPassword.value;

    if (statusEl) {
      statusEl.style.display = 'none';
      statusEl.className = 'error-msg error';
    }

    if (password.length < 8) {
      if (statusEl) {
        statusEl.textContent = 'Password must be at least 8 characters.';
        statusEl.style.display = 'block';
      }
      return;
    }

    if (password !== confirm) {
      if (statusEl) {
        statusEl.textContent = 'Passwords do not match.';
        statusEl.style.display = 'block';
      }
      return;
    }

    submitBtn.disabled = true;
    submitText.textContent = 'Updating...';

    const { error } = await supabase.auth.updateUser({ password });

    submitBtn.disabled = false;
    submitText.textContent = 'Update Password';

    if (error) {
      if (statusEl) {
        statusEl.className = 'error-msg error';
        statusEl.textContent = error.message || 'Failed to update password.';
        statusEl.style.display = 'block';
      }
      return;
    }

    if (statusEl) {
      statusEl.className = 'error-msg success';
      statusEl.textContent = 'Password updated. Please sign in with your new password.';
      statusEl.style.display = 'block';
    }

    await signOut();
    setTimeout(() => {
      window.history.replaceState({}, '', '/');
      renderLogin();
    }, 1000);
  });
}

// Modern Dashboard Implementation
// This file contains the complete renderDashboard function with multi-view support

function renderDashboard() {
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
    const templates = TEMPLATE_ORDER.map((id) => ({ id, ...TEMPLATE_LIBRARY[id] }));

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
    enableDraggableModals(modal);

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
            alert('Layout generation returned no usable options. Please try a more specific prompt.');
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
    const template = TEMPLATE_LIBRARY[templateId] || TEMPLATE_LIBRARY.blank;
    const content = template.content ? template.content.trim() : '';
    const title = template.docTitle || 'Untitled Document';

    await window.createNewDoc();
    if (currentDocId) {
      const doc = documents.find(d => d.id === currentDocId);
      if (doc) {
        doc.content = content;
        doc.title = title;
        await updateCurrentDoc({ content, title });
        renderEditor();
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
  if (documentChatUnsubscribe) {
    documentChatUnsubscribe();
    documentChatUnsubscribe = null;
  }

  if (user) {
    collaborationManager = new CollaborationManager(currentDocId, user, {
      onPresenceUpdate: updateAvatars,
      onCursorUpdate: renderRemoteCursor,
      onChatMessage: addChatMessage,
      onTextUpdate: (payload) => {
        const editor = document.getElementById('editor');
        if (editor) {
          const editorArea = editor.closest('.editor-area');
          const savedScrollTop = editorArea ? editorArea.scrollTop : null;
          const savedScrollLeft = editorArea ? editorArea.scrollLeft : null;
          const selectionOffsets = getCurrentSelectionOffsetsInEditor(editor);

          editor.innerHTML = payload.content;

          if (selectionOffsets) {
            restoreSelectionOffsetsInEditor(editor, selectionOffsets);
          }

          if (editorArea && savedScrollTop != null) {
            editorArea.scrollTop = savedScrollTop;
            editorArea.scrollLeft = savedScrollLeft || 0;
          }

          scheduleCommentHighlightsRender();
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
  <div class="editor-layout editor-layout-editor">
    <!-- Top Bar: Title + Avatars only -->
    <div class="top-bar">
      <input type="text" class="doc-title" id="docTitle" value="${doc.title || 'Untitled'}" placeholder="Untitled Document"/>
      <div class="top-bar-presence">
        <span class="presence-label">Online</span>
        <div class="avatars-stack" id="avatarStack"></div>
      </div>
    </div>

    <div class="editor-workspace">
      <!-- Circular Sidebar -->
      <div class="circular-sidebar">
        <button class="sidebar-icon" id="sidebarBackBtn" title="Back to Dashboard">
          <i class="iconoir-arrow-left"></i>
        </button>
        <div class="sidebar-divider"></div>
        <button class="sidebar-icon" id="sidebarShareBtn" title="Share">
          <i class="iconoir-share-android"></i>
        </button>
        <button class="sidebar-icon" id="sidebarCommentBtn" title="Comments">
          <i class="iconoir-message-text"></i>
        </button>
        <button class="sidebar-icon" id="sidebarChatBtn" title="Chat">
          <i class="iconoir-chat-bubble"></i>
        </button>
        <button class="sidebar-icon ${doc.is_public ? 'active' : ''}" id="sidebarDeployBtn" title="${doc.is_public ? 'Published' : 'Deploy'}">
          <i class="iconoir-rocket"></i>
        </button>
      </div>

      <!-- Main Editor Layout (Original) -->
      <div class="editor-container">
        <!-- Toolbar -->
        <div class="toolbar">
        <button class="tool-btn" id="undoBtn" title="Undo">
          <i class="iconoir-undo"></i>
        </button>
        <button class="tool-btn" id="redoBtn" title="Redo">
          <i class="iconoir-redo"></i>
        </button>

        <select id="fontFamily" class="font-select">
          <option value="Arial">Arial</option>
          <option value="Inter">Inter</option>
          <option value="Merriweather">Merriweather</option>
          <option value="Playfair Display">Playfair</option>
          <option value="Georgia">Georgia</option>
        </select>

        <input id="fontSize" class="font-size-select" type="number" min="12" max="248" value="16"/>

        <button class="tool-btn" data-cmd="bold" title="Bold (⌘B)">
          <i class="iconoir-bold"></i>
        </button>
        <button class="tool-btn" data-cmd="italic" title="Italic (⌘I)">
          <i class="iconoir-italic"></i>
        </button>
        <button class="tool-btn" data-cmd="underline" title="Underline (⌘U)">
          <i class="iconoir-underline"></i>
        </button>

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

        <button class="tool-btn" data-cmd="insertUnorderedList" title="Bullet list">
          <i class="iconoir-list"></i>
        </button>
        <button class="tool-btn" data-cmd="insertOrderedList" title="Numbered list">
          <i class="iconoir-numbered-list-left"></i>
        </button>

        <button class="tool-btn" id="exportBtn2" title="Download">
          <i class="iconoir-download"></i>
        </button>
        </div>

        <!-- Editor -->
        <div class="editor-area">
          <div id="editor" contenteditable="${contentEditableState}" spellcheck="false" data-role="${userRole}">
            ${doc.content || ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Comments Sidebar -->
    <div class="comments-sidebar comments-sidebar-modern" id="commentsSidebar" style="display: none;">
      <div class="comments-header">
        <div class="comments-title">
          <i class="iconoir-message-text"></i>
          <span>Comments</span>
        </div>
        <button class="close-btn" id="closeComments">×</button>
      </div>
      <div class="comments-list" id="commentsList"></div>
      <div class="comment-input-area">
        <textarea placeholder="Add a comment..." id="newCommentInput"></textarea>
        <button class="primary-btn" id="addCommentBtn">Post</button>
      </div>
    </div>

    <!-- Chat Widget -->
    <div class="chat-widget chat-widget-modern" id="chatWidget" style="display: none;">
      <div class="chat-header">
        <div class="chat-title">
          <i class="iconoir-chat-bubble"></i>
          <span>Team Chat</span>
        </div>
        <div class="ai-controls">
          <button class="ai-btn-icon" id="clearCollabChat" title="Clear chat"><i class="iconoir-trash"></i></button>
          <button class="ai-btn-icon" id="closeCollabChat" title="Close">×</button>
        </div>
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" id="chatInput" placeholder="Type a message...">
        <button class="ai-send" type="button"><i class="iconoir-send"></i></button>
      </div>
    </div>

    <!-- Share Modal -->
    <div class="modal-overlay" id="shareModal" style="display: none;">
      <div class="modal-card share-modal-card" style="max-width: 500px;">
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

    <!-- Deploy Modal -->
    <div class="modal-overlay" id="deployModal" style="display: none;">
      <div class="modal-card deploy-modal-card" style="max-width: 520px;">
        <div class="modal-header">
          <h3>Published Document</h3>
          <button class="close-btn" id="closeDeployModal">×</button>
        </div>
        <div class="modal-body">
          <p class="deploy-help" id="deployStatusText">This document is live. Share this link:</p>
          <div class="deploy-link-row">
            <input type="text" class="share-input deploy-link-input" id="deployLinkInput" readonly>
            <button class="primary-btn" id="copyDeployLinkBtn">Copy</button>
          </div>
          <div class="deploy-actions">
            <button class="ghost-btn" id="unpublishDocBtn">Unpublish</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Export Modal -->
    <div class="modal-overlay" id="exportModal" style="display: none;">
      <div class="modal-card" style="max-width: 400px;">
        <div class="modal-header">
          <h3>Export Document</h3>
          <button class="close-btn" id="closeExportModal">×</button>
        </div>
        <div class="modal-body">
          <p style="color: #6B7280; margin-bottom: 1rem; font-size: 0.875rem;">Choose a file format to download your document:</p>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <button class="export-option-btn" data-format="pdf">
              <i class="iconoir-page"></i>
              <span>PDF Document (.pdf)</span>
            </button>
            <button class="export-option-btn" data-format="txt">
              <i class="iconoir-page-edit"></i>
              <span>Plain Text (.txt)</span>
            </button>
            <button class="export-option-btn" data-format="html">
              <i class="iconoir-code"></i>
              <span>HTML File (.html)</span>
            </button>
            <button class="export-option-btn" data-format="md">
              <i class="iconoir-text"></i>
              <span>Markdown (.md)</span>
            </button>
            <button class="export-option-btn" data-format="docx">
              <i class="iconoir-page-plus"></i>
              <span>Word Document (.docx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>

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
              <button class="edit-popup-btn" data-action="comment">
                <i class="iconoir-message-text"></i>
                <span>Comment</span>
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
  if (documentChatUnsubscribe) {
    documentChatUnsubscribe();
    documentChatUnsubscribe = null;
  }
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

let customAlertHost = null;

function ensureCustomAlertHost() {
  if (customAlertHost && document.body.contains(customAlertHost)) return customAlertHost;
  customAlertHost = document.createElement('div');
  customAlertHost.className = 'custom-alert-host';
  document.body.appendChild(customAlertHost);
  return customAlertHost;
}

function showCustomAlert(message, type = 'info') {
  const host = ensureCustomAlertHost();
  const alertEl = document.createElement('div');
  alertEl.className = `custom-alert ${type}`;
  alertEl.innerHTML = `
    <span class="custom-alert-icon"><i class="iconoir-info-circle"></i></span>
    <span class="custom-alert-text"></span>
  `;
  const msg = typeof message === 'string' ? message : String(message ?? '');
  alertEl.querySelector('.custom-alert-text').textContent = msg;
  host.appendChild(alertEl);

  requestAnimationFrame(() => alertEl.classList.add('show'));

  const dismiss = () => {
    alertEl.classList.remove('show');
    alertEl.classList.add('hide');
    setTimeout(() => {
      if (host.contains(alertEl)) host.removeChild(alertEl);
    }, 180);
  };

  setTimeout(dismiss, 2600);
  alertEl.addEventListener('click', dismiss);
}

window.showCustomAlert = showCustomAlert;
window.alert = (message) => showCustomAlert(message);

const exportLibraryCache = {};

async function loadRemoteModule(cacheKey, url) {
  if (!exportLibraryCache[cacheKey]) {
    exportLibraryCache[cacheKey] = import(url);
  }
  return exportLibraryCache[cacheKey];
}

function enableDraggableModals(root = document) {
  if (!root) return;

  const overlays = [];
  if (root.matches && root.matches('.modal-overlay')) overlays.push(root);
  if (root.querySelectorAll) overlays.push(...root.querySelectorAll('.modal-overlay'));

  overlays.forEach((overlay) => {
    if (!overlay || overlay.dataset.dragReady === 'true') return;
    overlay.dataset.dragReady = 'true';

    const modalCard = overlay.querySelector('.modal-card');
    const modalHeader = modalCard?.querySelector('.modal-header');
    if (!modalCard || !modalHeader) return;

    modalCard.classList.add('draggable-modal-card');
    modalHeader.classList.add('draggable-modal-header');

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const stopDrag = () => {
      isDragging = false;
      overlay.classList.remove('dragging');
      document.body.classList.remove('modal-dragging');
      document.removeEventListener('mousemove', onDrag);
    };

    const onDrag = (event) => {
      if (!isDragging) return;
      const overlayRect = overlay.getBoundingClientRect();
      const cardWidth = modalCard.offsetWidth;
      const cardHeight = modalCard.offsetHeight;
      const maxLeft = Math.max(0, overlayRect.width - cardWidth);
      const maxTop = Math.max(0, overlayRect.height - cardHeight);
      const nextLeft = Math.max(0, Math.min(maxLeft, event.clientX - overlayRect.left - offsetX));
      const nextTop = Math.max(0, Math.min(maxTop, event.clientY - overlayRect.top - offsetY));

      modalCard.style.left = `${nextLeft}px`;
      modalCard.style.top = `${nextTop}px`;
    };

    modalHeader.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('button, input, textarea, select, a, [data-no-drag]')) return;

      const overlayRect = overlay.getBoundingClientRect();
      const cardRect = modalCard.getBoundingClientRect();

      if (getComputedStyle(modalCard).position !== 'absolute') {
        modalCard.style.position = 'absolute';
        modalCard.style.margin = '0';
        modalCard.style.width = `${cardRect.width}px`;
        modalCard.style.left = `${cardRect.left - overlayRect.left}px`;
        modalCard.style.top = `${cardRect.top - overlayRect.top}px`;
      }

      offsetX = event.clientX - modalCard.getBoundingClientRect().left;
      offsetY = event.clientY - modalCard.getBoundingClientRect().top;
      isDragging = true;
      overlay.classList.add('dragging');
      document.body.classList.add('modal-dragging');
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag, { once: true });
      event.preventDefault();
    });
  });
}

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

  // Sidebar button handlers
  const sidebarBackBtn = document.getElementById('sidebarBackBtn');
  const sidebarShareBtn = document.getElementById('sidebarShareBtn');
  const sidebarCommentBtn = document.getElementById('sidebarCommentBtn');
  const sidebarChatBtn = document.getElementById('sidebarChatBtn');
  const sidebarDeployBtn = document.getElementById('sidebarDeployBtn');
  const shareModalEl = document.getElementById('shareModal');
  const deployModal = document.getElementById('deployModal');
  const closeDeployModal = document.getElementById('closeDeployModal');
  const copyDeployLinkBtn = document.getElementById('copyDeployLinkBtn');
  const deployLinkInput = document.getElementById('deployLinkInput');
  const deployStatusText = document.getElementById('deployStatusText');
  const unpublishDocBtn = document.getElementById('unpublishDocBtn');
  enableDraggableModals(app);

  const getPublishedLink = () => `${window.location.origin}?doc=${currentDocId}`;

  const openDeployModal = (justPublished = false) => {
    const currentDoc = documents.find(d => d.id === currentDocId);
    if (!currentDoc || !currentDoc.is_public || !deployModal) return;
    if (deployLinkInput) deployLinkInput.value = getPublishedLink();
    if (deployStatusText) {
      deployStatusText.textContent = justPublished
        ? 'Published successfully. Share this live link:'
        : 'This document is already published. Share this live link:';
    }
    deployModal.style.display = 'flex';
  };

  if (sidebarBackBtn) {
    sidebarBackBtn.addEventListener('click', () => {
      closeDoc();
    });
  }

  if (sidebarShareBtn && shareModalEl) {
    sidebarShareBtn.addEventListener('click', () => {
      shareModalEl.style.display = 'flex';
    });
  }

  if (sidebarCommentBtn) {
    sidebarCommentBtn.addEventListener('click', () => {
      const commentsSidebar = document.getElementById('commentsSidebar');
      if (commentsSidebar) {
        const isVisible = commentsSidebar.style.display !== 'none';
        commentsSidebar.style.display = isVisible ? 'none' : 'flex';
        sidebarCommentBtn.classList.toggle('active', !isVisible);
        if (!isVisible) loadComments();
      }
    });
  }

  if (sidebarChatBtn) {
    sidebarChatBtn.addEventListener('click', () => {
      const chatWidget = document.getElementById('chatWidget');
      if (chatWidget) {
        const isVisible = chatWidget.style.display !== 'none';
        chatWidget.style.display = isVisible ? 'none' : 'flex';
        sidebarChatBtn.classList.toggle('active', !isVisible);
      }
    });
  }

  const closeCommentsBtn = document.getElementById('closeComments');
  if (closeCommentsBtn) {
    closeCommentsBtn.addEventListener('click', () => {
      const commentsSidebar = document.getElementById('commentsSidebar');
      if (commentsSidebar) commentsSidebar.style.display = 'none';
      if (sidebarCommentBtn) sidebarCommentBtn.classList.remove('active');
    });
  }

  const closeCollabChatBtn = document.getElementById('closeCollabChat');
  if (closeCollabChatBtn) {
    closeCollabChatBtn.addEventListener('click', () => {
      const chatWidget = document.getElementById('chatWidget');
      if (chatWidget) chatWidget.style.display = 'none';
      if (sidebarChatBtn) sidebarChatBtn.classList.remove('active');
    });
  }

  if (sidebarDeployBtn) {
    sidebarDeployBtn.addEventListener('click', async () => {
      const currentDoc = documents.find(d => d.id === currentDocId);
      if (!currentDoc) return;

      if (currentDoc.is_public) {
        openDeployModal(false);
        return;
      }

      sidebarDeployBtn.disabled = true;
      const { error } = await updateDocument(currentDocId, { is_public: true });
      sidebarDeployBtn.disabled = false;

      if (error) {
        alert('Failed to publish document');
        return;
      }

      currentDoc.is_public = true;
      sidebarDeployBtn.classList.add('active');
      sidebarDeployBtn.title = 'Published';
      openDeployModal(true);
    });
  }

  if (closeDeployModal && deployModal) {
    closeDeployModal.addEventListener('click', () => {
      deployModal.style.display = 'none';
    });
  }

  if (shareModalEl) {
    shareModalEl.addEventListener('click', (event) => {
      if (event.target === shareModalEl) shareModalEl.style.display = 'none';
    });
  }

  if (deployModal) {
    deployModal.addEventListener('click', (event) => {
      if (event.target === deployModal) deployModal.style.display = 'none';
    });
  }

  if (copyDeployLinkBtn && deployLinkInput) {
    copyDeployLinkBtn.addEventListener('click', async () => {
      const url = deployLinkInput.value.trim();
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        alert('Published link copied');
      } catch (error) {
        deployLinkInput.select();
        document.execCommand('copy');
        alert('Published link copied');
      }
    });
  }

  if (unpublishDocBtn && deployModal && sidebarDeployBtn) {
    unpublishDocBtn.addEventListener('click', async () => {
      const currentDoc = documents.find(d => d.id === currentDocId);
      if (!currentDoc || !currentDoc.is_public) return;

      unpublishDocBtn.disabled = true;
      const { error } = await updateDocument(currentDocId, { is_public: false });
      unpublishDocBtn.disabled = false;

      if (error) {
        alert('Failed to unpublish document');
        return;
      }

      currentDoc.is_public = false;
      sidebarDeployBtn.classList.remove('active');
      sidebarDeployBtn.title = 'Deploy';
      deployModal.style.display = 'none';
      alert('Document unpublished');
    });
  }

  // Toolbar download button - opens export modal
  const exportBtn2 = document.getElementById('exportBtn2');
  if (exportBtn2) {
    exportBtn2.addEventListener('click', () => {
      document.getElementById('exportModal').style.display = 'flex';
    });
  }

  // Export modal handlers
  const closeExportModal = document.getElementById('closeExportModal');
  if (closeExportModal) {
    closeExportModal.addEventListener('click', () => {
      document.getElementById('exportModal').style.display = 'none';
    });
  }

  // Export format selection
  document.querySelectorAll('.export-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      downloadDocument(format);
      document.getElementById('exportModal').style.display = 'none';
    });
  });

  // Download function for different formats
  async function downloadDocument(format) {
    const doc = documents.find(d => d.id === currentDocId);
    if (!doc) return;

    const editor = document.getElementById('editor');
    if (!editor) return;

    const content = editor.innerHTML;
    const textContent = editor.innerText;
    const safeTitle = (doc.title || 'Untitled Document')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled Document';

    const buildExportHtml = () => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <style>
    body { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: Georgia, serif; line-height: 1.6; color: #1f2937; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
    const toBlob = async (value, fallbackMime = 'application/octet-stream') => {
      const resolved = await Promise.resolve(value);

      if (resolved instanceof Blob) return resolved;
      if (resolved instanceof ArrayBuffer) return new Blob([resolved], { type: fallbackMime });
      if (ArrayBuffer.isView(resolved)) return new Blob([resolved], { type: fallbackMime });
      if (typeof resolved === 'string' && resolved.startsWith('data:')) {
        const response = await fetch(resolved);
        return await response.blob();
      }
      if (typeof resolved === 'string') {
        return new Blob([resolved], { type: fallbackMime });
      }
      if (resolved && typeof resolved === 'object' && resolved.buffer && ArrayBuffer.isView(resolved)) {
        return new Blob([resolved], { type: fallbackMime });
      }

      throw new TypeError('Unsupported export payload type');
    };

    const triggerBlobDownload = async (payload, filename, mimeType = 'application/octet-stream') => {
      const blob = await toBlob(payload, mimeType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const fallbackMarkdown = () => content
      .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i>(.*?)<\/i>/gi, '*$1*')
      .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
      .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const buildDocxBlob = async () => {
      const docxModule = await loadRemoteModule('docx', 'https://esm.sh/docx@9.0.2');
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docxModule;
      if (!Document || !Packer || !Paragraph || !TextRun) {
        throw new Error('DOCX package unavailable');
      }

      const parser = new DOMParser();
      const parsed = parser.parseFromString(`<div>${content || ''}</div>`, 'text/html');
      const root = parsed.body.firstElementChild || parsed.body;

      const collectRuns = (node, style = {}) => {
        if (!node) return [];
        if (node.nodeType === Node.TEXT_NODE) {
          const raw = (node.textContent || '').replace(/\s+/g, ' ');
          if (!raw.trim()) return [];
          return [new TextRun({
            text: raw,
            bold: !!style.bold,
            italics: !!style.italics,
            underline: style.underline ? {} : undefined
          })];
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return [];

        const tag = node.tagName.toLowerCase();
        const nextStyle = { ...style };
        if (tag === 'strong' || tag === 'b') nextStyle.bold = true;
        if (tag === 'em' || tag === 'i') nextStyle.italics = true;
        if (tag === 'u') nextStyle.underline = true;

        const runs = [];
        node.childNodes.forEach((child) => {
          runs.push(...collectRuns(child, nextStyle));
        });
        return runs;
      };

      const paragraphs = [];
      const pushParagraph = (runs, options = {}) => {
        if (!runs || runs.length === 0) return;
        paragraphs.push(new Paragraph({ children: runs, ...options }));
      };

      root.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node.textContent || '').trim();
          if (text) pushParagraph([new TextRun(text)]);
          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();

        if (tag === 'ul' || tag === 'ol') {
          Array.from(node.children).forEach((li) => {
            if (li.tagName?.toLowerCase() !== 'li') return;
            const runs = collectRuns(li);
            if (runs.length) {
              paragraphs.push(new Paragraph({ children: runs, bullet: { level: 0 } }));
            }
          });
          return;
        }

        if (tag === 'br') {
          paragraphs.push(new Paragraph({ children: [new TextRun('')] }));
          return;
        }

        const runs = collectRuns(node);
        if (!runs.length) return;

        if (tag === 'h1') {
          pushParagraph(runs, { heading: HeadingLevel.HEADING_1 });
          return;
        }
        if (tag === 'h2') {
          pushParagraph(runs, { heading: HeadingLevel.HEADING_2 });
          return;
        }
        if (tag === 'h3') {
          pushParagraph(runs, { heading: HeadingLevel.HEADING_3 });
          return;
        }

        pushParagraph(runs);
      });

      if (paragraphs.length === 0) {
        paragraphs.push(new Paragraph({ children: [new TextRun(textContent || '')] }));
      }

      const docxDoc = new Document({
        sections: [{
          properties: {},
          children: paragraphs
        }]
      });

      return Packer.toBlob(docxDoc);
    };

    try {
      let blob = null;
      let filename = '';
      let mimeType = 'application/octet-stream';

      switch (format) {
        case 'txt': {
          mimeType = 'text/plain;charset=utf-8';
          blob = new Blob([textContent], { type: mimeType });
          filename = `${safeTitle}.txt`;
          break;
        }

        case 'html': {
          mimeType = 'text/html;charset=utf-8';
          blob = new Blob([buildExportHtml()], { type: mimeType });
          filename = `${safeTitle}.html`;
          break;
        }

        case 'md': {
          let markdown = '';
          try {
            const turndownModule = await loadRemoteModule('turndown', 'https://esm.sh/turndown@7.2.0');
            const TurndownService = turndownModule.default || turndownModule.TurndownService;
            if (!TurndownService) throw new Error('Turndown unavailable');
            const turndownService = new TurndownService({
              headingStyle: 'atx',
              bulletListMarker: '-',
              codeBlockStyle: 'fenced'
            });
            turndownService.addRule('underline', {
              filter: ['u'],
              replacement: (text) => `<u>${text}</u>`
            });
            markdown = turndownService.turndown(content || '');
          } catch {
            markdown = fallbackMarkdown();
          }
          mimeType = 'text/markdown;charset=utf-8';
          blob = new Blob([markdown], { type: mimeType });
          filename = `${safeTitle}.md`;
          break;
        }

        case 'pdf': {
          alert('Generating PDF...');
          const [html2canvasModule, jsPdfModule] = await Promise.all([
            loadRemoteModule('html2canvas', 'https://esm.sh/html2canvas@1.4.1'),
            loadRemoteModule('jspdf', 'https://esm.sh/jspdf@2.5.1')
          ]);

          const html2canvas = html2canvasModule.default || html2canvasModule;
          const jsPDF = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;
          if (!html2canvas || !jsPDF) throw new Error('PDF libraries failed to load');

          const renderRoot = document.createElement('div');
          renderRoot.style.position = 'fixed';
          renderRoot.style.left = '-100000px';
          renderRoot.style.top = '0';
          renderRoot.style.width = '816px';
          renderRoot.style.padding = '48px';
          renderRoot.style.background = '#ffffff';
          renderRoot.style.color = '#111827';
          renderRoot.style.fontFamily = 'Georgia, serif';
          renderRoot.style.lineHeight = '1.6';
          renderRoot.innerHTML = content;
          document.body.appendChild(renderRoot);

          const canvas = await html2canvas(renderRoot, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
          });
          document.body.removeChild(renderRoot);

          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          let heightLeft = imgHeight;
          let position = 0;

          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;

          while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
          }

          pdf.save(`${safeTitle}.pdf`);
          alert('PDF downloaded');
          return;
        }

        case 'docx': {
          alert('Generating DOCX...');
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          blob = await buildDocxBlob();
          filename = `${safeTitle}.docx`;
          break;
        }

        default:
          alert('Unknown format');
          return;
      }

      if (blob && filename) {
        await triggerBlobDownload(blob, filename, mimeType);
        alert(`${filename.split('.').pop().toUpperCase()} downloaded`);
      }
    } catch (error) {
      console.error(`Export ${format} failed:`, error);
      alert(`Failed to export ${format.toUpperCase()}`);
    }
  }


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
        const selectedModel = proStyleModelSelector?.value || savedModel;
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
    scheduleCommentHighlightsRender();

    // Broadcast changes
    if (collaborationManager) {
      collaborationManager.sendTextUpdate(editor.innerHTML);
    }

    checkForSlash(editor);
    handleMarkdownShortcuts(editor, e);
  });

  // Undo/Redo
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      document.execCommand('undo', false, null);
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      document.execCommand('redo', false, null);
    });
  }

  // Font family & size
  const fontFamily = document.getElementById('fontFamily');
  const fontSize = document.getElementById('fontSize');

  fontFamily.addEventListener('change', () => {
    document.execCommand('fontName', false, fontFamily.value);
  });

  fontSize.addEventListener('change', () => {
    const val = fontSize.value;
    document.execCommand('fontSize', false, '7');
    const fontElements = document.querySelectorAll('font[size="7"]');
    fontElements.forEach(el => {
      el.removeAttribute('size');
      el.style.fontSize = val;
    });
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
      const selectedModel = aiModelSelector?.value || savedModel;
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
  if (closeFeedback && feedbackModal) {
    closeFeedback.addEventListener('click', () => {
      feedbackModal.style.display = 'none';
    });
  }

  if (feedbackModal) {
    feedbackModal.addEventListener('click', (e) => {
      if (e.target === feedbackModal) {
        feedbackModal.style.display = 'none';
      }
    });
  }

  if (feedbackForm) {
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
        if (feedbackModal) feedbackModal.style.display = 'none';
        feedbackForm.reset();
      }

      btn.disabled = false;
      btn.textContent = originalText;
    });
  }

  // Help Panel Logic
  const helpTrigger = document.getElementById('helpTrigger');
  const helpPanel = document.getElementById('helpPanel');
  const closeHelp = document.getElementById('closeHelp');
  const openAiChatBtn = document.getElementById('openAiChatBtn');
  const restartTutorialBtn = document.getElementById('restartTutorialBtn');

  // Help Chat Logic
  const helpChatPopup = document.getElementById('helpChatPopup');
  const closeHelpChat = document.getElementById('closeHelpChat');
  const helpChatInput = document.getElementById('helpChatInput');
  const helpChatSend = document.getElementById('helpChatSend');
  const helpChatMessages = document.getElementById('helpChatMessages');

  if (helpTrigger && helpPanel && closeHelp && openAiChatBtn && restartTutorialBtn && helpChatPopup && closeHelpChat && helpChatInput && helpChatSend && helpChatMessages) {
    helpTrigger.addEventListener('click', () => {
      helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none';
    });

    closeHelp.addEventListener('click', () => {
      helpPanel.style.display = 'none';
    });

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
      case 'comment': {
        const commentsSidebar = document.getElementById('commentsSidebar');
        const newCommentInput = document.getElementById('newCommentInput');
        const selectionOffsets = getRangeOffsetsWithinEditor(editor, selectedTextRange);
        pendingCommentSelection = {
          quote: selectedText,
          start: selectionOffsets?.start ?? null,
          end: selectionOffsets?.end ?? null,
          created_at: new Date().toISOString()
        };

        if (commentsSidebar) commentsSidebar.style.display = 'flex';
        if (sidebarCommentBtn) sidebarCommentBtn.classList.add('active');
        if (newCommentInput) {
          newCommentInput.focus();
        }
        loadComments();
        textEditPopup.classList.remove('visible');
        editPopupCustom.classList.remove('visible');
        selectedText = '';
        selectedTextRange = null;
        return;
      }
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
      const selectedModel = aiModelSelector?.value || savedModel;
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
  const shareModalCollab = document.getElementById('shareModal');
  const sendInviteBtn = document.getElementById('sendInviteBtn');
  const chatToggleBtn = document.getElementById('chatToggleBtn');
  const chatWidget = document.getElementById('chatWidget');
  const chatInput = document.getElementById('chatInput');
  const closeChat = chatWidget?.querySelector('.close-btn');

  // Share Modal
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareModalCollab.style.display = 'flex';
      updateAvatars(collabUsers);
    });
  }

  if (sendInviteBtn) {
    sendInviteBtn.addEventListener('click', async () => {
      const email = document.getElementById('shareEmail').value;
      const role = document.getElementById('shareRole').value;
      if (!email) return;
      const currentDoc = documents.find(d => d.id === currentDocId);

      sendInviteBtn.disabled = true;
      sendInviteBtn.textContent = 'Inviting...';

      try {
        const { error, emailError } = await shareDocument(currentDocId, email, role, {
          sendEmail: true,
          docTitle: currentDoc?.title || 'Untitled Document',
          docLink: `${window.location.origin}?doc=${currentDocId}`
        });
        if (error) throw error;
        if (emailError) {
          alert(`Access granted, but invitation email failed: ${emailError.message}`);
        } else {
          alert('Invitation sent!');
        }
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

  const clearCollabChatBtn = document.getElementById('clearCollabChat');
  const chatMessagesEl = document.getElementById('chatMessages');
  const chatMessageIds = new Set();

  const renderChatHistory = (messages) => {
    if (!chatMessagesEl) return;
    chatMessagesEl.innerHTML = '';
    chatMessageIds.clear();
    (messages || []).forEach((msg) => {
      if (msg?.id != null) chatMessageIds.add(msg.id);
      addChatMessage(msg, { persist: false });
    });
  };

  const upsertIncomingChatMessage = (msg) => {
    if (!msg || msg.document_id !== currentDocId) return;
    if (msg.id != null && chatMessageIds.has(msg.id)) return;
    if (msg.id != null) chatMessageIds.add(msg.id);
    addChatMessage(msg, { persist: false });
  };

  const removeIncomingChatMessage = (msg) => {
    if (!msg?.id) return;
    chatMessageIds.delete(msg.id);
    const row = document.querySelector(`[data-chat-id="${msg.id}"]`);
    if (row) row.remove();
  };

  const loadDocumentChat = async () => {
    if (!currentDocId) return;
    const { data, error } = await getDocumentChatMessages(currentDocId);
    if (error) {
      console.error('Failed to load chat history:', error);
      alert('Failed to load chat history');
      return;
    }
    renderChatHistory(data || []);
  };

  loadDocumentChat();
  if (documentChatUnsubscribe) documentChatUnsubscribe();
  documentChatUnsubscribe = subscribeToDocumentChat(currentDocId, {
    onInsert: upsertIncomingChatMessage,
    onDelete: removeIncomingChatMessage,
    onError: (status) => console.error('Chat realtime channel error:', status)
  });

  const sendChatMsg = async () => {
    if (!chatInput || !currentDocId) return;
    const msg = chatInput.value.trim();
    if (!msg) return;

    chatInput.value = '';
    const { data: sentMessage, error } = await createDocumentChatMessage(currentDocId, msg, 'user');
    if (error) {
      console.error('Failed to send chat message:', error);
      alert('Failed to send message');
      return;
    }
    if (sentMessage) upsertIncomingChatMessage(sentMessage);

    // AI Interception
    if (msg.toLowerCase().startsWith('@ai')) {
      const query = msg.substring(3).trim();
      if (!query) return;

      try {
        const context = editor.innerText.substring(0, 1000);
        const prompt = `Context: ${context}\n\nUser Question: ${query}\n\nAnswer briefly as a helpful assistant in the chat.`;
        const selectedModel = aiModelSelector?.value || savedModel;
        const response = await generateContent(prompt, selectedModel);
        const { data: aiMessage } = await createDocumentChatMessage(currentDocId, response, 'ai');
        if (aiMessage) upsertIncomingChatMessage(aiMessage);
      } catch (e) {
        console.error('AI Chat Error', e);
        const { data: aiFailureMessage } = await createDocumentChatMessage(currentDocId, 'Failed to get AI response.', 'ai');
        if (aiFailureMessage) upsertIncomingChatMessage(aiFailureMessage);
      }
    }
  };

  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMsg();
    });
    chatWidget.querySelector('.ai-send')?.addEventListener('click', sendChatMsg);
  }

  if (clearCollabChatBtn) {
    clearCollabChatBtn.addEventListener('click', async () => {
      if (!currentDocId) return;
      const { error } = await clearDocumentChatMessages(currentDocId);
      if (error) {
        console.error('Failed to clear chat:', error);
        alert('Failed to clear chat');
        return;
      }
      await loadDocumentChat();
      alert('Chat cleared');
    });
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
      const editorScroll = document.getElementById('editorScroll') || document.querySelector('.editor-area');
      if (!editorScroll) return;
      const wrapperRect = editorScroll.getBoundingClientRect();
      const scrollTop = editorScroll.scrollTop || 0;
      const scrollLeft = editorScroll.scrollLeft || 0;

      const relTop = rect.top - wrapperRect.top + scrollTop;
      const relLeft = rect.left - wrapperRect.left + scrollLeft;

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

function addChatMessage({ id, userEmail, message, role, timestamp, created_at }, { persist = false } = {}) {
  if (persist) persistCollabChatMessage({ userEmail, message, role, timestamp: timestamp || created_at });

  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const safeMessage = String(message ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const div = document.createElement('div');
  const isMe = userEmail && user?.email && userEmail === user.email;
  const isAi = role === 'ai';
  const when = timestamp || created_at || new Date().toISOString();
  const senderName = isAi ? 'AI Assistant' : (isMe ? 'You' : (userEmail ? userEmail.split('@')[0] : 'Unknown'));
  const deleteBtn = (isMe && !isAi && id != null)
    ? `<button class="chat-delete-btn" onclick="window.deleteChatMessageAction(${id})">Delete</button>`
    : '';

  div.className = `chat-message-row ${isMe && !isAi ? 'me' : 'other'} ${isAi ? 'ai' : ''}`;
  if (id != null) div.dataset.chatId = String(id);

  div.innerHTML = `
    <div class="chat-message-meta">
      <span class="chat-sender">${senderName}</span>
      <span class="chat-time">${new Date(when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      ${deleteBtn}
    </div>
    <div class="chat-bubble">${safeMessage}</div>
  `;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.deleteChatMessageAction = async (id) => {
  const { error } = await deleteDocumentChatMessage(id);
  if (error) {
    console.error('Failed to delete chat message:', error);
    alert('Failed to delete message');
  }
};

// --- COMMENTS LOGIC ---

function escapeHtmlValue(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getRangeOffsetsWithinEditor(editor, range) {
  if (!editor || !range) return null;

  let start = null;
  let end = null;
  let cursor = 0;

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.nodeValue?.length || 0;

    if (node === range.startContainer) {
      start = cursor + Math.min(range.startOffset, length);
    }

    if (node === range.endContainer) {
      end = cursor + Math.min(range.endOffset, length);
    }

    cursor += length;
  }

  if (start == null || end == null) {
    const beforeStart = range.cloneRange();
    beforeStart.selectNodeContents(editor);
    beforeStart.setEnd(range.startContainer, range.startOffset);

    const beforeEnd = range.cloneRange();
    beforeEnd.selectNodeContents(editor);
    beforeEnd.setEnd(range.endContainer, range.endOffset);

    start = beforeStart.toString().length;
    end = beforeEnd.toString().length;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end };
}

function getCurrentSelectionOffsetsInEditor(editor) {
  if (!editor) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== editor) {
    return null;
  }

  return getRangeOffsetsWithinEditor(editor, range);
}

function restoreSelectionOffsetsInEditor(editor, offsets) {
  if (!editor || !offsets) return;

  const start = Number(offsets.start);
  const end = Number(offsets.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;

  const { textNodes } = buildEditorTextIndex(editor);
  if (!textNodes.length) return;

  const maxOffset = textNodes[textNodes.length - 1].end;
  const safeStart = Math.max(0, Math.min(start, maxOffset));
  const safeEnd = Math.max(0, Math.min(end, maxOffset));
  const range = createRangeFromOffsets(textNodes, safeStart, safeEnd, { allowCollapsed: true });
  if (!range) return;

  const selection = window.getSelection();
  if (!selection) return;

  selection.removeAllRanges();
  selection.addRange(range);
}

function openCommentsSidebar() {
  const commentsSidebar = document.getElementById('commentsSidebar');
  const sidebarCommentBtn = document.getElementById('sidebarCommentBtn');
  if (commentsSidebar) commentsSidebar.style.display = 'flex';
  if (sidebarCommentBtn) sidebarCommentBtn.classList.add('active');
}

function focusCommentCard(commentId) {
  const commentsList = document.getElementById('commentsList');
  if (!commentsList) return false;

  const card = commentsList.querySelector(`.comment-card[data-comment-id="${commentId}"]`);
  if (!card) return false;

  commentsList.querySelectorAll('.comment-card-focus').forEach((node) => {
    node.classList.remove('comment-card-focus');
  });

  card.classList.add('comment-card-focus');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    card.classList.remove('comment-card-focus');
  }, 1500);

  return true;
}

function getCommentHighlightLayer() {
  const editorArea = document.querySelector('.editor-area');
  if (!editorArea) return null;

  let layer = editorArea.querySelector('#commentHighlightLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'commentHighlightLayer';
    layer.className = 'comment-highlight-layer';
    editorArea.appendChild(layer);

    layer.addEventListener('click', (event) => {
      const rect = event.target.closest('.comment-highlight-rect');
      if (!rect) return;
      event.preventDefault();
      event.stopPropagation();

      const commentId = Number(rect.dataset.commentId);
      if (!Number.isFinite(commentId)) return;

      activeCommentId = commentId;
      openCommentsSidebar();
      scheduleCommentHighlightsRender();

      if (!focusCommentCard(commentId)) {
        loadComments({ focusCommentId: commentId });
      }
    });
  }

  return layer;
}

function buildEditorTextIndex(editor) {
  const textNodes = [];
  let fullText = '';
  let cursor = 0;

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue || '';
    if (!text.length) continue;

    const start = cursor;
    cursor += text.length;
    textNodes.push({ node, start, end: cursor });
    fullText += text;
  }

  return { textNodes, fullText };
}

function resolveOffsetToNode(textNodes, offset, preferNext = false) {
  if (!textNodes.length) return null;

  for (let index = 0; index < textNodes.length; index += 1) {
    const item = textNodes[index];
    if (offset < item.end || (!preferNext && offset === item.end)) {
      const localOffset = Math.max(0, Math.min(offset - item.start, item.node.nodeValue.length));
      return { node: item.node, offset: localOffset };
    }

    if (offset === item.end && preferNext) {
      const next = textNodes[index + 1];
      if (next) return { node: next.node, offset: 0 };
    }
  }

  const last = textNodes[textNodes.length - 1];
  return { node: last.node, offset: last.node.nodeValue.length };
}

function createRangeFromOffsets(textNodes, start, end, { allowCollapsed = false } = {}) {
  if (!textNodes.length) return null;

  const maxOffset = textNodes[textNodes.length - 1].end;
  const safeStart = Math.max(0, Math.min(start, maxOffset));
  const safeEnd = Math.max(0, Math.min(end, maxOffset));
  if (safeEnd < safeStart) return null;
  if (safeEnd === safeStart && !allowCollapsed) return null;

  const startPoint = resolveOffsetToNode(textNodes, safeStart, false);
  const endPoint = resolveOffsetToNode(textNodes, safeEnd, false);
  if (!startPoint || !endPoint) return null;

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  if (range.collapsed && !allowCollapsed) return null;
  return range;
}

function rangesOverlap(start, end, range) {
  return start < range.end && end > range.start;
}

function findQuoteOffsets(fullText, quote, reservedRanges, preferredStart = null) {
  if (!quote) return null;

  const target = String(quote);
  let matchIndex = fullText.indexOf(target);
  if (matchIndex === -1) return null;

  const candidates = [];
  while (matchIndex !== -1) {
    const candidate = { start: matchIndex, end: matchIndex + target.length };
    const overlap = reservedRanges.some((range) => rangesOverlap(candidate.start, candidate.end, range));
    const distance = Number.isFinite(preferredStart) ? Math.abs(candidate.start - preferredStart) : 0;
    candidates.push({ ...candidate, overlap, distance });
    matchIndex = fullText.indexOf(target, matchIndex + 1);
  }

  const nonOverlapping = candidates.filter((candidate) => !candidate.overlap);
  const pool = nonOverlapping.length > 0 ? nonOverlapping : candidates;
  pool.sort((a, b) => a.distance - b.distance || a.start - b.start);
  const best = pool[0];
  return best ? { start: best.start, end: best.end } : null;
}

function buildCommentAnchors(editor, comments) {
  const { textNodes, fullText } = buildEditorTextIndex(editor);
  if (!textNodes.length || !Array.isArray(comments) || comments.length === 0) return [];

  const anchors = [];
  const reservedRanges = [];

  comments.forEach((comment) => {
    const selection = comment?.selection_range || {};
    const quote = typeof selection.quote === 'string' ? selection.quote : '';
    const maybeStart = Number(selection.start ?? selection.start_offset);
    const maybeEnd = Number(selection.end ?? selection.end_offset);

    let start = Number.isFinite(maybeStart) ? maybeStart : null;
    let end = Number.isFinite(maybeEnd) ? maybeEnd : null;
    let range = null;

    if (start != null && end != null && end > start) {
      range = createRangeFromOffsets(textNodes, start, end);
    }

    if ((!range || !range.toString().trim()) && quote) {
      const offsets = findQuoteOffsets(fullText, quote, reservedRanges, start);
      if (offsets) {
        start = offsets.start;
        end = offsets.end;
        range = createRangeFromOffsets(textNodes, start, end);
      }
    }

    if (!range || !range.toString().trim()) return;

    reservedRanges.push({ start, end });
    anchors.push({
      commentId: Number(comment.id),
      range,
      start,
      end
    });
  });

  return anchors;
}

function renderCommentHighlights(comments = cachedComments) {
  const editor = document.getElementById('editor');
  const editorArea = document.querySelector('.editor-area');
  const layer = getCommentHighlightLayer();

  if (!editor || !editorArea || !layer) return;

  layer.innerHTML = '';
  commentAnchors = [];

  if (!Array.isArray(comments) || comments.length === 0) {
    layer.style.display = 'none';
    return;
  }

  const anchors = buildCommentAnchors(editor, comments);
  commentAnchors = anchors;

  if (!anchors.length) {
    layer.style.display = 'none';
    return;
  }

  const areaRect = editorArea.getBoundingClientRect();
  const scrollLeft = editorArea.scrollLeft;
  const scrollTop = editorArea.scrollTop;

  layer.style.display = 'block';
  layer.style.width = `${Math.max(editorArea.clientWidth, editorArea.scrollWidth)}px`;
  layer.style.height = `${Math.max(editorArea.clientHeight, editorArea.scrollHeight)}px`;

  anchors.forEach((anchor) => {
    const rects = Array.from(anchor.range.getClientRects());
    rects.forEach((rect) => {
      if (rect.width <= 0 || rect.height <= 0) return;

      const highlightRect = document.createElement('button');
      highlightRect.type = 'button';
      highlightRect.className = `comment-highlight-rect${activeCommentId === anchor.commentId ? ' active' : ''}`;
      highlightRect.dataset.commentId = String(anchor.commentId);
      highlightRect.style.left = `${rect.left - areaRect.left + scrollLeft}px`;
      highlightRect.style.top = `${rect.top - areaRect.top + scrollTop}px`;
      highlightRect.style.width = `${rect.width}px`;
      highlightRect.style.height = `${rect.height}px`;

      layer.appendChild(highlightRect);
    });
  });
}

function scheduleCommentHighlightsRender() {
  if (commentHighlightRaf != null) cancelAnimationFrame(commentHighlightRaf);
  commentHighlightRaf = requestAnimationFrame(() => {
    commentHighlightRaf = null;
    renderCommentHighlights(cachedComments);
  });
}

window.aiFixCommentAction = async (id) => {
  const commentId = Number(id);
  if (!Number.isFinite(commentId)) return;

  const triggerBtn = document.querySelector(`.comment-ai-fix-btn[data-comment-id="${commentId}"]`);
  const originalLabel = triggerBtn?.textContent || 'AI Fix';
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Fixing...';
  }

  try {
    const comment = cachedComments.find((entry) => Number(entry.id) === commentId);
    if (!comment) {
      alert('Could not find this comment');
      return;
    }

    if (!commentAnchors.length) renderCommentHighlights(cachedComments);
    const anchor = commentAnchors.find((entry) => entry.commentId === commentId);
    if (!anchor?.range) {
      alert('Could not locate the highlighted text for this comment');
      return;
    }

    const textToFix = anchor.range.toString().trim();
    if (!textToFix) {
      alert('The highlighted text is empty');
      return;
    }

    const commentInstruction = String(comment.content || '').trim();
    if (!commentInstruction) {
      alert('This comment does not include instructions for AI fix');
      return;
    }

    const prompt = `You are editing a document snippet based on a reviewer comment.
Reviewer comment:
"${commentInstruction}"

Text to revise:
"""${textToFix}"""

Rules:
- Return ONLY the revised text.
- Keep the same language and intent.
- Do not add explanations, prefixes, or quotation marks.`;

    const selectedModel = document.getElementById('aiModelSelector')?.value
      || localStorage.getItem('proedit_ai_model')
      || 'gemini-2.5-flash';
    const response = await generateContent(prompt, selectedModel);
    let revisedText = String(response || '').trim();
    revisedText = revisedText.replace(/^```(?:text)?/i, '').replace(/```$/i, '').trim();

    if (!revisedText) {
      alert('AI returned empty text');
      return;
    }

    const editor = document.getElementById('editor');
    if (!editor) return;

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(anchor.range.cloneRange());
    document.execCommand('insertText', false, revisedText);

    updateCurrentDoc({ content: editor.innerHTML });
    if (collaborationManager) collaborationManager.sendTextUpdate(editor.innerHTML);

    activeCommentId = commentId;
    alert('AI fix applied');
    await loadComments({ focusCommentId: commentId });
  } catch (error) {
    console.error('Failed to apply AI fix:', error);
    alert('Failed to apply AI fix');
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = originalLabel;
    }
  }
};

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

      const selectionPayload = pendingCommentSelection ? { ...pendingCommentSelection } : null;
      const { error } = await addComment(currentDocId, content, selectionPayload);

      addCommentBtn.disabled = false;
      addCommentBtn.textContent = 'Post';

      if (error) {
        alert('Failed to post comment');
      } else {
        newCommentInput.value = '';
        pendingCommentSelection = null;
        loadComments();
      }
    });
  }

  if (commentHighlightObserver) {
    commentHighlightObserver.disconnect();
    commentHighlightObserver = null;
  }
  if (editor) {
    commentHighlightObserver = new MutationObserver(() => {
      scheduleCommentHighlightsRender();
    });
    commentHighlightObserver.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (commentHighlightResizeHandler) {
    window.removeEventListener('resize', commentHighlightResizeHandler);
  }
  commentHighlightResizeHandler = () => scheduleCommentHighlightsRender();
  window.addEventListener('resize', commentHighlightResizeHandler);

  await loadComments();
}

async function loadComments({ focusCommentId = null } = {}) {
  const commentsList = document.getElementById('commentsList');
  if (!commentsList) return;

  commentsList.innerHTML = '<div class="panel-empty">Loading comments...</div>';

  const { data: comments, error } = await getComments(currentDocId);

  if (error) {
    commentsList.innerHTML = '<div class="panel-empty">Failed to load comments</div>';
    cachedComments = [];
    scheduleCommentHighlightsRender();
    return;
  }

  cachedComments = Array.isArray(comments) ? comments : [];
  if (activeCommentId != null && !cachedComments.some((entry) => Number(entry.id) === Number(activeCommentId))) {
    activeCommentId = null;
  }
  if (focusCommentId != null) {
    activeCommentId = Number(focusCommentId);
  }

  scheduleCommentHighlightsRender();

  if (cachedComments.length === 0) {
    commentsList.innerHTML = '<div class="panel-empty">No comments yet</div>';
    return;
  }

  const { data: { user: currentUser } } = await supabase.auth.getUser();

  commentsList.innerHTML = cachedComments.map((c) => {
    const isOwner = currentUser && c.user_id === currentUser.id;
    const safeAuthor = escapeHtmlValue(c.user_email?.split('@')[0] || 'unknown');
    const safeContent = escapeHtmlValue(c.content || '')
      .replace(/\n/g, '<br>');
    const selectionQuote = c.selection_range?.quote;
    const safeQuote = selectionQuote
      ? escapeHtmlValue(selectionQuote)
        .replace(/\n/g, '<br>')
        .replace(/"/g, '&quot;')
      : '';
    const selection = c.selection_range || {};
    const hasAnchor = (typeof selection.quote === 'string' && selection.quote.trim().length > 0)
      || (
        Number.isFinite(Number(selection.start ?? selection.start_offset))
        && Number.isFinite(Number(selection.end ?? selection.end_offset))
      );
    const deleteBtn = isOwner ? `<button class="comment-delete-btn" onclick="window.deleteCommentAction(${c.id})">Delete</button>` : '';
    const aiFixBtn = `
      <button
        class="comment-ai-fix-btn"
        data-comment-id="${c.id}"
        onclick="window.aiFixCommentAction(${c.id})"
        ${hasAnchor ? '' : 'disabled title="This comment has no linked text range"'}
      >
        AI Fix
      </button>
    `;

    return `
      <div class="comment-card" data-comment-id="${c.id}">
        <div class="comment-meta">
          <span class="comment-author">${safeAuthor}</span>
          <span class="comment-time">${new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <div class="comment-meta-actions">
            ${aiFixBtn}
            ${deleteBtn}
          </div>
        </div>
        ${selectionQuote ? `<div class="comment-quote">"${safeQuote}"</div>` : ''}
        <div class="comment-content">${safeContent}</div>
      </div>
    `;
  }).join('');

  commentsList.querySelectorAll('.comment-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      const commentId = Number(card.dataset.commentId);
      if (!Number.isFinite(commentId)) return;
      activeCommentId = commentId;
      scheduleCommentHighlightsRender();
    });
  });

  if (focusCommentId != null) {
    focusCommentCard(Number(focusCommentId));
  }
}

window.deleteCommentAction = async (id) => {
  if (!confirm('Delete this comment?')) return;
  const { error } = await deleteComment(id);
  if (error) alert('Failed to delete comment');
  else {
    if (Number(activeCommentId) === Number(id)) activeCommentId = null;
    loadComments();
  }
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
    const { error } = await shareDocument(currentDocId, email, newRole);
    if (error) throw error;
    alert('Role updated!');
  } catch (e) {
    alert('Failed to update role');
    console.error(e);
  }
  loadSharePermissions();
};
window.addEventListener('popstate', () => {
  if (isResetPasswordRoute()) {
    handleResetPasswordRoute();
    return;
  }

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
