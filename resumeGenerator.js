const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateResume(resumeData) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        
        const prompt = `Create an ATS-friendly resume in HTML format using the following information. Format it professionally with proper HTML tags and styling. Do not include any markdown or asterisks. Use semantic HTML elements and clean formatting:

        <div style="max-width: 800px; margin: 40px auto; font-family: 'Times New Roman', serif; line-height: 1.6;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="font-size: 24px; margin-bottom: 10px;">${resumeData.fullName}</h1>
                <p style="margin: 5px 0;">${resumeData.location} | ${resumeData.email} | ${resumeData.phone}</p>
                <p style="margin: 5px 0;">${resumeData.links || ''}</p>
            </div>

            <!-- Professional Summary -->
            <p style="text-align: justify; margin-bottom: 20px;">${resumeData.objective}</p>

            <!-- Education -->
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 1px solid #000; margin-bottom: 10px;">Education</h2>
                ${resumeData.education}
            </div>

            <!-- Projects -->
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 1px solid #000; margin-bottom: 10px;">Projects</h2>
                ${resumeData.projects}
            </div>

            <!-- Technologies -->
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 1px solid #000; margin-bottom: 10px;">Technologies</h2>
                <p><strong>Languages:</strong> ${resumeData.skills}</p>
                ${resumeData.tools ? `<p><strong>Tools and Frameworks:</strong> ${resumeData.tools}</p>` : ''}
                ${resumeData.core ? `<p><strong>Core Concepts:</strong> ${resumeData.core}</p>` : ''}
            </div>

            <!-- Work Experience (if provided) -->
            ${resumeData.experience ? `
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 1px solid #000; margin-bottom: 10px;">Work Experience</h2>
                ${resumeData.experience}
            </div>` : ''}

            <!-- Certifications -->
            ${resumeData.certifications ? `
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 1px solid #000; margin-bottom: 10px;">Certifications</h2>
                ${resumeData.certifications}
            </div>` : ''}

            <!-- Competitive Programming (if provided) -->
            ${resumeData.competitive ? `
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 1px solid #000; margin-bottom: 10px;">Competitive Programming</h2>
                ${resumeData.competitive}
            </div>` : ''}
        </div>`;

        const result = await model.generateContent(prompt);
        const rawText = await result.response.text();
        const cleanedHTML = rawText.replace(/^```html\s*/, '').replace(/```$/, '');
        return cleanedHTML;
    } catch (error) {
        console.error("Error generating resume:", error);
        throw error;
    }
}

module.exports = {
    generateResume
};