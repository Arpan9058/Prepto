const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function analyzeWithGemini(skills) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        
        const prompt = `As a career guidance expert, analyze the following skills and provide focused career guidance:
        Skills: ${skills}
        
        Please provide career paths that directly match these specific skills. Do not suggest careers that require additional skills not mentioned above.
        
        Please provide:
        1. Career paths that directly match the provided skills
        2. Job roles where these specific skills are most valuable
        3. Recommended certifications related to these skills
        4. Growth opportunities within these specific skill areas
        5. Salary expectations for roles matching these skills in both india and US
        
        Format the response in a clear, structured way. Focus only on careers that can be pursued with the exact skills provided.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error in Gemini analysis:", error);
        throw error;
    }
}

module.exports = {
    analyzeWithGemini
}; 