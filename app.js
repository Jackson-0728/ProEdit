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

// Only check for API key if we are actually trying to use it, or warn but don't crash immediately on import
// This allows build steps to proceed without env vars if needed
if (!API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set in .env file');
}

// API endpoint
app.post('/api/generate', async (req, res) => {
    const startTime = Date.now();
    try {
        if (!API_KEY) {
            return res.status(500).json({ error: 'Server configuration error: API Key missing' });
        }

        const genAI = new GoogleGenerativeAI(API_KEY);

        const { prompt, model: requestedModel } = req.body;

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

        const model = genAI.getGenerativeModel({ model: modelName });

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const duration = Date.now() - startTime;

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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', model: 'gemini-2.5-flash' });
});

// Serve static files from the dist directory
// Vercel handles static files via vercel.json rewrites, so we only need this for local/Node deployment
// We can detect Vercel environment, or just serve if the directory exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In Vercel, we don't want Express to try to serve static files usually, 
// but it doesn't hurt to have it as fallback. 
// However, for clean separation, we can check process.env.VERCEL
if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, 'dist')));

    // Handle React routing, return all requests to React app
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

export default app;
