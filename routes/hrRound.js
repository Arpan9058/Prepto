const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const {ensureAuthenticated} = require('../middleware/auth.js')

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const questionsPath = path.join(__dirname, '..', 'HRQuestions.json');
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

const saveToJsonFile = (data) => {
    const filePath = path.join(__dirname, '..', 'data', 'analysisResults.json');
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Analysis saved to: ${filePath}`);
};

router.get('/', ensureAuthenticated,  (req, res) => {
    res.render('hrRound', { question: questions });
});

router.post('/analyze-text', ensureAuthenticated, async (req, res) => {
    const { text, question, questionCounter } = req.body;
    const maxQuestions = 9; 
    const nextQuestionIndex = parseInt(questionCounter) + 1;

    const prompt = `You are an experienced HR professional and interviewer. Analyze the candidate's response to the following question,
    taking into consideration that this is a HR level interview for a Software Engineer position.

    Question: ${question}
    Candidate's Answer: ${text}

    Your analysis should:
    1. Assess the candidate's response based on relevance to the question, clarity of communication, and completeness of the answer.
    2. Provide a score out of 5 for the response, keeping in mind that it is a speech to text transcription interview so adjust some terms accordingly and Calculate the score in a lenient way.
    3. Offer a recommendation for improving the answer in a way that encourages the candidate to expand without making them feel discouraged.

    Please make sure the output is in the following valid JSON format without any additional markdown or formatting issues:

    {
        "analysis": "Your analysis here (Ensure proper escaping of quotes using \\" for any quotes inside the string).",
        "recommendation": "Your recommendation here (Ensure proper escaping of quotes using \\" for any quotes inside the string).",
        "score": <integer between 1 and 5>
    }`;

    console.log("Generated Prompt: ", prompt);

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedText = await response.text();
        console.log("API Response Text: ", generatedText);
        const cleanedText = generatedText.replace(/```json|```/g, '').trim();

        let analyzeResult;

        try {
            analyzeResult = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            console.error("Failed to parse JSON. Raw text:", cleanedText);
            return res.status(500).json({ error: `Failed to parse Gemini API response: ${parseError.message}. Raw text: ${cleanedText}` });
        }

        console.log("Analyzing...");
        console.log("Analyze Result:", analyzeResult);

        saveToJsonFile(analyzeResult);

        let followUpQuestion;

        if (nextQuestionIndex < questions.length) {
            followUpQuestion = { question: questions[nextQuestionIndex] };
        } else {
            followUpQuestion = { question: "Thank you, that concludes this question." };
        }

        res.json({ analysis: analyzeResult, followUpQuestion: followUpQuestion });

    } catch (error) {
        console.error("Error processing the request:", error);
        res.status(500).json({ error: 'Failed to generate content.' });
    }
});

router.get('/initial-question', ensureAuthenticated, (req, res) => {
    if (questions.length > 0) {
        res.json({ question: questions[0] });
    } else {
        res.status(404).json({ error: 'No questions available.' });
    }
});

module.exports = router;
