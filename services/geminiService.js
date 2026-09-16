const { GoogleGenerativeAI } = require("@google/generative-ai");

async function geminianalysis(text, question, questionCounter, jobDescription) {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    let difficultyLevel;
    if (questionCounter < 3) {
        difficultyLevel = 'easy';
    } else if (questionCounter < 6) {
        difficultyLevel = 'medium';
    } else {
        difficultyLevel = 'hard';
    }

    // Added leniency note about transcription
    let promptInstructions = `You are an expert AI interviewer. The candidate has answered ${questionCounter} questions. This is a spoken interview — answers are transcribed from speech. Focus on content and structure, not grammar. 
Please allow for occasional transcription inaccuracies — especially with acronyms or technical terms (e.g., DSA vs TSA). Focus on the intent and technical understanding rather than exact wording or spelling. Minor misunderstandings or unclear phrases should not heavily affect scoring unless they impact the overall meaning.
If the candidate clearly attempted to answer the question with reasonable understanding, be lenient with small errors in terminology or structure.

Job Description: ${jobDescription}. Do not ask for code, pseudocode, or written syntax.`;

    const scoringCriteria = `Evaluate the candidate's answer using the following criteria (score each out of 10, based on weighting):
- Technical Knowledge (40%) → Score out of 10 based on depth, correctness, and accuracy of technical content.
- Problem Solving (20%) → Score out of 10 based on how well they reason, analyze, or approach issues.
- Communication (20%) → Score out of 10 for clarity, coherence, and ability to explain concepts clearly.
- Relevance (10%) → Score out of 10 based on how well the answer addresses the question.
- Professionalism (10%) → Score out of 10 for tone, confidence, and structure of the response.

The overall score is a weighted average of these criteria, returned out of 10.

If the answer appears AI-generated, robotic, or inauthentic, assign 0 in all categories and note: "Answer may have been generated using AI. Please respond in your own words."

All questions are verbal — do NOT ask for or suggest code snippets, pseudocode, or implementation details.
The total score must be rounded to the nearest whole number.
Return the following JSON:
{
  "analysis": "Detailed feedback",
  "recommendation": "Encouraging suggestion to improve the answer",
  "scores": {
    "technicalKnowledge": number,
    "problemSolving": number,
    "communication": number,
    "relevance": number,
    "professionalism": number
  },
  "totalScore": number,
  "followUpQuestion": "A verbal follow-up question"
}
`;

    const prompt = `${promptInstructions}
${scoringCriteria}

Use the following:
Question: ${question}
Answer: ${text}
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedText = await response.text();
        const cleanedText = generatedText.replace(/```json|```/g, '').trim();

        try {
            return JSON.parse(cleanedText);
        } catch (e) {
            const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (e2) {
                    console.error("Failed to parse extracted JSON:", jsonMatch[0]);
                }
            }
            console.error("Gemini API returned non-JSON response:", cleanedText);
            return { "error": "Gemini API did not return valid JSON.", "raw": cleanedText };
        }
    } catch (error) {
        console.error("Gemini API Error:", error);
        return { "error": `Gemini API request failed: ${error.message}` };
    }
}

module.exports = { geminianalysis };
