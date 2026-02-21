import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;

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

function parseRequestBody(req) {
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body || '{}');
        } catch {
            return {};
        }
    }
    return req.body || {};
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const startTime = Date.now();

    try {
        if (!API_KEY) {
            return res.status(500).json({ error: 'Server configuration error: API Key missing' });
        }

        const { prompt, model: requestedModel, task } = parseRequestBody(req);
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const supportedModels = [
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.5-pro'
        ];
        const modelName = supportedModels.includes(requestedModel)
            ? requestedModel
            : 'gemini-2.5-flash';

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: modelName });

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
                  "content": "<h1>Title</h1><p>...</p>"
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
                return res.status(200).json({ layouts, duration, model: modelName });
            }
            return res.status(200).json({ layouts: [], error: 'Failed to generate valid layouts', text, duration, model: modelName });
        }

        return res.status(200).json({ text, duration, model: modelName });
    } catch (error) {
        console.error('Error generating content:', error);
        return res.status(500).json({
            error: 'Failed to generate content',
            message: error?.message || 'Unknown error',
            duration: Date.now() - startTime
        });
    }
}

