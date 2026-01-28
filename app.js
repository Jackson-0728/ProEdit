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
            model: modelName,
            generationConfig: {
                responseMimeType: task === 'layout_generation' ? 'application/json' : 'text/plain'
            }
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
            `;
        }

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();
        const duration = Date.now() - startTime;

        if (task === 'layout_generation') {
            try {
                const json = JSON.parse(text);
                return res.json({ ...json, duration, model: modelName });
            } catch (e) {
                console.error("Failed to parse JSON from AI", text);
                // Fallback if JSON parsing fails
                return res.json({ layouts: [], error: "Failed to generate valid layouts", text, duration });
            }
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
