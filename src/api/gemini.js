export async function generateContent(prompt, model = 'gemini-2.5-flash') {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, model }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate content');
        }

        const data = await response.json();
        return data.text;
    } catch (error) {
        console.error('Error calling AI:', error);
        return "I'm sorry, I encountered an error while processing your request.";
    }
}

export async function evaluateModels(prompt) {
    try {
        const response = await fetch('/api/evaluate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            throw new Error('Failed to evaluate models');
        }

        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error('Error evaluating models:', error);
        throw error;
    }
}

export async function generateLayouts(prompt) {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, task: 'layout_generation' })
        });

        if (!response.ok) throw new Error('Failed to generate layouts');

        const data = await response.json();
        const normalizeLayouts = (payload) => {
            const layouts = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.layouts) ? payload.layouts : []);

            return layouts
                .map((entry, index) => {
                    const content = String(entry?.content ?? entry?.html ?? '').trim();
                    if (!content) return null;

                    return {
                        title: String(entry?.title || `Option ${index + 1}`),
                        description: String(entry?.description || 'AI Generated Layout'),
                        content
                    };
                })
                .filter(Boolean);
        };

        const stripFence = (raw) => {
            const text = String(raw || '').trim();
            const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
            return match ? match[1].trim() : text;
        };

        const tryParseLayouts = (rawText) => {
            const text = String(rawText || '').trim();
            if (!text) return [];

            const candidates = [text, stripFence(text)];
            for (const candidate of candidates) {
                try {
                    const parsed = JSON.parse(candidate);
                    const layouts = normalizeLayouts(parsed);
                    if (layouts.length > 0) return layouts;
                } catch (_) {
                    // try next candidate
                }
            }
            return [];
        };

        const normalized = normalizeLayouts(data);
        if (normalized.length > 0) return normalized;

        const parsedFromText = tryParseLayouts(data?.text);
        if (parsedFromText.length > 0) return parsedFromText;

        if (data?.error) {
            throw new Error(data.error);
        }

        return [];
    } catch (error) {
        console.error('Layout generation failed:', error);
        return [];
    }
}
