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
    try {
        if (!API_KEY) {
            return res.status(500).json({ error: 'Server configuration error: API Key missing' });
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ text });
    } catch (error) {
        console.error('Error generating content:', error);
        res.status(500).json({
            error: 'Failed to generate content',
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
