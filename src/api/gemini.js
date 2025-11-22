import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export async function generateContent(prompt) {
    console.log("Generating content for prompt:", prompt.slice(0, 50) + "...");
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("Content generated successfully");
        return text;
    } catch (error) {
        console.error("Gemini API Error:", error);
        return `Error: ${error.message || "Something went wrong with the AI."}`;
    }
}
