export async function generateContent(prompt) {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
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
