import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const API_KEY = process.env.GEMINI_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const INVITE_FROM_EMAIL = process.env.INVITE_FROM_EMAIL || 'ProEdit <onboarding@resend.dev>';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

// Only check for API key if we are actually trying to use it, or warn but don't crash immediately on import
if (!API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set in .env file');
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveAppBaseUrl(req) {
    return APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function stripMarkdownCodeFence(value) {
    const text = String(value || '').trim();
    const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fence ? fence[1].trim() : text;
}

function extractJsonCandidate(text, openChar, closeChar) {
    const source = String(text || '');
    const start = source.indexOf(openChar);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < source.length; index += 1) {
        const ch = source[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === openChar) depth += 1;
        if (ch === closeChar) {
            depth -= 1;
            if (depth === 0) {
                return source.slice(start, index + 1);
            }
        }
    }

    return null;
}

function normalizeLayoutsPayload(payload) {
    const layouts = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.layouts) ? payload.layouts : []);

    return layouts
        .map((entry, index) => {
            const content = String(entry?.content ?? entry?.html ?? '').trim();
            if (!content) return null;

            const title = String(entry?.title || `Option ${index + 1}`).trim();
            const description = String(entry?.description || 'AI Generated Layout').trim();

            return { title, description, content };
        })
        .filter(Boolean);
}

function parseGeneratedLayouts(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return [];

    const candidates = [
        text,
        stripMarkdownCodeFence(text),
        extractJsonCandidate(text, '{', '}'),
        extractJsonCandidate(text, '[', ']')
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const layouts = normalizeLayoutsPayload(parsed);
            if (layouts.length > 0) return layouts;
        } catch (_) {
            // try next parse strategy
        }
    }

    return [];
}

async function getSupabaseUserFromToken(accessToken) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return { data: null, error: new Error('Supabase server environment is missing') };
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        return { data: null, error: new Error('Invalid session token') };
    }

    const data = await response.json();
    return { data, error: null };
}

// API endpoint
app.post('/api/generate', async (req, res) => {
    const startTime = Date.now();
    try {
        if (!API_KEY) {
            return res.status(500).json({ error: 'Server configuration error: API Key missing' });
        }

        const genAI = new GoogleGenerativeAI(API_KEY);

        const { prompt, model: requestedModel, task } = req.body;

        // Supported models
        const supportedModels = [
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.5-pro'
        ];

        // Use requested model if valid, otherwise default to gemini-2.5-flash
        const modelName = supportedModels.includes(requestedModel)
            ? requestedModel
            : 'gemini-2.5-flash';

        const model = genAI.getGenerativeModel({
            model: modelName
        });

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        let finalPrompt = prompt;
        if (task === 'layout_generation') {
            finalPrompt = `
            You are a document layout generator. Based on the user's idea: "${prompt}", 
            generate 3 distinct document layouts.
            Return a JSON object with this structure:
            {
              "layouts": [
                {
                  "title": "Document Title",
                  "description": "Brief description of this layout approach",
                  "content": "<h1>Title</h1><p>...</p>" // HTML content for the document
                }
              ]
            }
            Ensure the content is valid HTML suitable for a rich text editor.
            Return ONLY raw JSON. Do not use markdown code fences. Do not include any text before or after the JSON.
            `;
        }

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();
        const duration = Date.now() - startTime;

        if (task === 'layout_generation') {
            const layouts = parseGeneratedLayouts(text);
            if (layouts.length > 0) {
                return res.json({ layouts, duration, model: modelName });
            }

            console.error('Failed to parse layout JSON from AI output');
            return res.json({ layouts: [], error: 'Failed to generate valid layouts', text, duration, model: modelName });
        }

        res.json({ text, duration, model: modelName });
    } catch (error) {
        console.error('Error generating content:', error);
        res.status(500).json({
            error: 'Failed to generate content',
            message: error.message,
            duration: Date.now() - startTime
        });
    }
});

// Evaluation endpoint - runs all models concurrently
app.post('/api/evaluate', async (req, res) => {
    try {
        if (!API_KEY) {
            return res.status(500).json({ error: 'Server configuration error: API Key missing' });
        }

        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        const models = [
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.5-pro'
        ];

        // Run all models concurrently
        const promises = models.map(async (modelName) => {
            const startTime = Date.now();
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                const duration = Date.now() - startTime;

                return {
                    model: modelName,
                    text,
                    duration,
                    status: 'success'
                };
            } catch (error) {
                console.error(`Error with model ${modelName}:`, error);
                return {
                    model: modelName,
                    error: error.message,
                    duration: Date.now() - startTime,
                    status: 'error'
                };
            }
        });

        const results = await Promise.all(promises);
        res.json({ results });

    } catch (error) {
        console.error('Error in evaluation:', error);
        res.status(500).json({
            error: 'Failed to run evaluation',
            message: error.message
        });
    }
});

app.post('/api/share-invite-email', async (req, res) => {
    try {
        if (!RESEND_API_KEY) {
            return res.status(500).json({ error: 'Invite email service is not configured on this server' });
        }

        const authHeader = req.headers.authorization || '';
        const accessToken = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7).trim()
            : '';

        if (!accessToken) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }

        const { data: inviter, error: userError } = await getSupabaseUserFromToken(accessToken);
        if (userError || !inviter?.email) {
            return res.status(401).json({ error: 'Invalid authorization token' });
        }

        const recipientEmail = String(req.body?.recipientEmail || '').trim().toLowerCase();
        const role = String(req.body?.role || 'viewer').trim().toLowerCase();
        const docTitle = String(req.body?.docTitle || 'Untitled Document').trim() || 'Untitled Document';
        const documentId = String(req.body?.documentId || '').trim();

        if (!isValidEmail(recipientEmail)) {
            return res.status(400).json({ error: 'A valid recipientEmail is required' });
        }
        if (!['viewer', 'commenter', 'editor'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const appBase = resolveAppBaseUrl(req);
        const fallbackDocLink = documentId
            ? `${appBase}?doc=${encodeURIComponent(documentId)}`
            : appBase;
        const docLink = String(req.body?.docLink || fallbackDocLink).trim() || fallbackDocLink;
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

        const subject = `${inviter.email} invited you to collaborate on "${docTitle}"`;
        const text = `${inviter.email} invited you as ${roleLabel} on ProEdit.

Document: ${docTitle}
Open: ${docLink}

If you do not have a ProEdit account yet, sign up first using this email address.`;

        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
            <p><strong>${escapeHtml(inviter.email)}</strong> invited you as <strong>${escapeHtml(roleLabel)}</strong> in ProEdit.</p>
            <p>Document: <strong>${escapeHtml(docTitle)}</strong></p>
            <p><a href="${escapeHtml(docLink)}">Open Document</a></p>
            <p style="color:#64748b;font-size:13px;">If you do not have a ProEdit account yet, sign up first using this email address.</p>
          </div>
        `;

        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: INVITE_FROM_EMAIL,
                to: [recipientEmail],
                subject,
                text,
                html
            })
        });

        const resendPayload = await resendResponse.json().catch(() => ({}));
        if (!resendResponse.ok) {
            return res.status(502).json({
                error: resendPayload?.message || resendPayload?.error || 'Failed to send invitation email'
            });
        }

        return res.json({ ok: true, id: resendPayload?.id || null });
    } catch (error) {
        console.error('Failed to send invitation email:', error);
        return res.status(500).json({ error: 'Failed to send invitation email' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', model: 'gemini-2.5-flash' });
});

// Serve static files from the dist directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.VERCEL) {
    const distPath = path.join(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');

    app.use(express.static(distPath));

    // Handle React routing, return all requests to React app
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }

        // Simple existence check using fs
        import('fs').then(fs => {
            if (fs.existsSync(indexHtmlPath)) {
                res.sendFile(indexHtmlPath);
            } else {
                res.status(404).send('Application build not found. Please run "npm run build".');
            }
        });
    });
}

export default app;
