import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;

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

    try {
        if (!API_KEY) {
            return res.status(500).json({ error: 'Server configuration error: API Key missing' });
        }

        const { prompt } = parseRequestBody(req);
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        const models = [
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.5-pro'
        ];

        const promises = models.map(async (modelName) => {
            const startTime = Date.now();
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                return {
                    model: modelName,
                    text,
                    duration: Date.now() - startTime,
                    status: 'success'
                };
            } catch (error) {
                return {
                    model: modelName,
                    error: error?.message || 'Unknown error',
                    duration: Date.now() - startTime,
                    status: 'error'
                };
            }
        });

        const results = await Promise.all(promises);
        return res.status(200).json({ results });
    } catch (error) {
        console.error('Error in evaluation:', error);
        return res.status(500).json({
            error: 'Failed to run evaluation',
            message: error?.message || 'Unknown error'
        });
    }
}

