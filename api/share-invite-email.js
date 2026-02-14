const RESEND_API_KEY = process.env.RESEND_API_KEY;
const INVITE_FROM_EMAIL = process.env.INVITE_FROM_EMAIL || 'ProEdit <onboarding@resend.dev>';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

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
    if (APP_BASE_URL) return APP_BASE_URL;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || '';
    return `${protocol}://${host}`;
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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();
        const role = String(body.role || 'viewer').trim().toLowerCase();
        const docTitle = String(body.docTitle || 'Untitled Document').trim() || 'Untitled Document';
        const documentId = String(body.documentId || '').trim();

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
        const docLink = String(body.docLink || fallbackDocLink).trim() || fallbackDocLink;
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

        return res.status(200).json({ ok: true, id: resendPayload?.id || null });
    } catch (error) {
        console.error('Failed to send invitation email:', error);
        return res.status(500).json({ error: 'Failed to send invitation email' });
    }
}
