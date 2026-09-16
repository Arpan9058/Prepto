require('dotenv').config();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

async function extractTextFromFile(file) {
    const buffer = file.buffer;
    const fileType = file.originalname.split('.').pop().toLowerCase();

    try {
        if (fileType === 'pdf') {
            const data = await pdfParse(buffer);
            return data.text;
        } else if (fileType === 'docx') {
            const result = await mammoth.extractRawText({ buffer: buffer });
            return result.value;
        } else {
            throw new Error('Unsupported file type. Please upload PDF or DOCX.');
        }
    } catch (error) {
        console.error("Error extracting text:", error);
        throw error;
    }
}

async function generateInterviewQuestions(resumeText) {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `You are an expert technical interviewer. Based on the resume below, generate highly specific and personalized interview questions.

Resume:
${resumeText.slice(0, 3000)}

STRICT RULES:
- Generate EXACTLY 15 questions per section
- Each question MUST be on its own new line
- Never combine questions into a paragraph
- Always reference specific technologies, project names, and experiences from the resume

Generate in EXACTLY this format (one question per line):

## 🛠️ Technical Questions
1. [question based on specific skill from resume]
2. [question]
3. [question]
4. [question]
5. [question]
6. [question]
7. [question]
8. [question]
9. [question]
10. [question]

## 📁 Project-Based Questions
1. [question referencing exact project name from resume]
2. [question]
3. [question]
4. [question]
5. [question]
6. [question]
7. [question]
8. [question]
9. [question]
10. [question]

## 🤝 HR & Behavioural Questions
1. [question based on their background]
2. [question]
3. [question]
4. [question]
5. [question]

## 💡 Situational Questions
1. [question]
2. [question]
3. [question]
4. [question]
5. [question]

## ⚠️ Tricky / Resume Gap Questions
1. [question about something weak or missing]
2. [question]
3. [question]
4. [question]
5. [question]

Each question must be specific to THIS resume. No generic questions.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error(`Gemini API request failed: ${error.message}`);
    }
}

module.exports = {
    extractTextFromFile,
    generateInterviewQuestions,
    upload
};