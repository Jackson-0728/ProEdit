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
