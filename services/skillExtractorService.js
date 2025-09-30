const { GoogleGenerativeAI } = require("@google/generative-ai");

async function extractSkills(text, jobDescription) {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Extract exactly 3 specific technical skills from the candidate's introduction that match the job description requirements.
    Focus on specific technical areas rather than broad categories.
    
    For example, if someone mentions "Java with DSA, HTML, CSS, JavaScript, Node.js":
    - "Data Structures & Algorithms (Java)"
    - "Node.js Backend Development"
    - "Frontend Development (HTML/CSS/JS)"
    
    If someone mentions "Python, Django, React, MongoDB":
    - "Python Programming"
    - "Django Backend Development"
    - "React Frontend Development"
    
    Text: ${text}
    Job Description: ${jobDescription}

    Return a JSON array of exactly 3 specific technical skills that match the job requirements.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedText = await response.text();
        const cleanedText = generatedText.replace(/```json|```/g, '').trim();

        try {
            const skills = JSON.parse(cleanedText);
            // Ensure we get exactly 3 skills
            return skills.slice(0, 3);
        } catch (e) {
            console.error("Failed to parse skills JSON:", e);
            return ["Data Structures & Algorithms", "Backend Development", "Frontend Development"]; // Default skills
        }
    } catch (error) {
        console.error("Skill extraction error:", error);
        return ["Data Structures & Algorithms", "Backend Development", "Frontend Development"]; // Default skills
    }
}

module.exports = { extractSkills }; 