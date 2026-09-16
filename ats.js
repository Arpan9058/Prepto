require('dotenv').config(); // Load .env here (if not already loaded in app.js)
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const marked = require('marked');
const sanitizeHtml = require('sanitize-html');

// Multer setup (can be part of the module or done in main app)
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
        }  else if (fileType === 'doc') {
            throw new Error("DOC files are not supported. Please upload PDF or DOCX.");
        } else {
            throw new Error('Unsupported file type. Please upload PDF or DOCX.');
        }
    } catch (error) {
        console.error("Error extracting text:", error);
        throw error;
    }
}

async function analyzeWithGemini(resumeText, jobDescriptionText) {
    const apiKey = process.env.GEMINI_API_KEY;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `
You are an expert ATS (Applicant Tracking System) analyst with deep experience in reviewing resumes for job compatibility. Analyze the following resume and job description thoroughly to determine how well the resume matches the job requirements.

**Resume:**
${resumeText}

**Job Description:**
${jobDescriptionText}

**ATS Scoring Rubric:**

*   **Excellent Match (85-100):** Almost all key skills are present and well-demonstrated. Experience and education strongly align with the job requirements. Few areas for improvement.
*   **Good Match (70-84):** Most key skills are present, but some may lack sufficient detail. Experience and education generally align. Some areas for improvement.
*   **Fair Match (55-69):** Some key skills are present, but many are missing or poorly demonstrated. Experience and education have moderate alignment. Significant areas for improvement.
*   **Poor Match (0-54):** Few key skills are present. Experience and education have little alignment with the job. Extensive areas for improvement.

When determining the score based on keyword matches use this criteria:
    - Exact keyword match: 10 points
    - Close variation of keyword match: 7 points
    - The skill keyword is found in the summary/objective: +5 points
    - The keyword is in the skill sections: +3 points

When assessing skill matches, consider the *context* in which the skill is mentioned. A skill mentioned in passing is less valuable than a skill that is central to a project or responsibility. Provide extra emphasis on the skills/keywords found in the summary/objective section of the resume.

Provide a detailed, step-by-step analysis that includes:

1.  **Overall ATS Score (0-100):** A numerical score representing how well the resume matches the job description. Explain why the score was assigned, breaking down the specific factors influencing the score. Base your score solely on the rubric.

2.  **Key Skills Match:**
        - List every key skill mentioned in the job description.
        - For each skill, indicate if it is present in the resume (Yes/No).
        - If the skill is not present, explain why this is a gap and what could be added to improve this area.
        - If the skill is present, provide examples of how it is showcased in the resume and any additional context or areas for improvement.

3.  **Experience Match:**
        - Analyze how well the candidate's experience aligns with the job description.
        - Provide specific examples from the resume where the candidate’s experience matches or doesn't match the job requirements.
        - Discuss the candidate's past projects, work experience, internships, and achievements. For each section, determine how relevant and detailed the experience is.
        - If there are gaps, suggest areas where the candidate could add more details or focus their experience to better align with the job.

4.  **Education Match:**
        - Assess the match between the candidate's education and the job requirements.
        - Discuss the relevance of the candidate’s degree, courses, academic projects, certifications, or any other education-related experiences.
        - If the education section could be improved, provide recommendations for how the candidate might enhance it to align better with the job.

5.  **Areas for Improvement:**
        - Provide a **comprehensive** list of specific changes the candidate can make to optimize their resume for ATS compatibility.
        - Suggest ways to enhance resume formatting, keyword usage, skills highlighting, and experience detailing to improve ATS scanning.
        - Identify any missing key skills or experiences that the candidate should add to boost their chances of success.
        - Recommend how to tailor the resume for better keyword optimization based on the job description.

6.  **Summary:**
        - Provide a **thorough summary** of how well the candidate's resume matches the job description.
        - Mention the key strengths of the resume and areas that require attention for improvement.
        - Conclude by offering actionable insights into how the candidate could improve their resume’s ATS score and increase their chances of getting through ATS filters.

Make sure your analysis is **comprehensive, detailed, and actionable**. Use clear examples from the resume and job description to support your analysis, and provide suggestions for specific improvements that will help the candidate optimize their resume for ATS screening.

Use the following structure for your response:

**1. Overall ATS Score:** [Score]
**Justification:** [Brief explanation of why the score was assigned, referencing the rubric.]

**2. Key Skills Match:**
[Skill 1]: Present: [Yes/No], Explanation: [If Yes, evidence from resume; if No, why it's a gap]
[Skill 2]: Present: [Yes/No], Explanation: [If Yes, evidence from resume; if No, why it's a gap]
... (Repeat for each skill in the job description)

**3. Experience Match:**
[Example 1 from Resume]: Matches Requirement: [Yes/No], Explanation: [Justification]
[Example 2 from Resume]: Matches Requirement: [Yes/No], Explanation: [Justification]
...

**4. Education Match:** [Analysis of Education Match]

**5. Areas for Improvement:**
- [Improvement Point 1]
- [Improvement Point 2]
...

**6. Summary:** [Thorough Summary]
`;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return text;
    } catch (error) {
        console.error("Gemini API Error:", error);
        return `Error: Gemini API request failed: ${error.message}`;
    }
}

module.exports = {
    extractTextFromFile,
    analyzeWithGemini,
    upload // Optionally export multer instance
};