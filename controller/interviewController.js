const geminiService = require('../services/geminiService');
const skillExtractorService = require('../services/skillExtractorService');
const fileHandler = require('../utils/fileHandler');
const admin = require("../firebase"); // Initialize once at the top

const initialQuestion = "Give me your introduction and your technical skills?"; 

const jobdescription = `Key Responsibilities:
Web Development: Design, develop, and maintain web applications and websites with clean, maintainable, and efficient code.
Front-End Development: Create responsive, user-friendly interfaces using HTML, CSS, JavaScript, and frameworks like React, Angular, or Vue.js.
Back-End Development: Build and maintain server-side logic, databases, and APIs using languages like PHP, Node.js, Ruby, or Django.
Collaboration: Work closely with designers, product managers, and other developers to create seamless user experiences.
Troubleshooting & Debugging: Identify and resolve issues with websites and applications, optimizing for speed and scalability.
Version Control: Use Git and GitHub/GitLab/Bitbucket for version control and collaborative development.
Qualifications:
Proven experience as a Web Developer, Web Designer, or similar role.
Strong knowledge of front-end technologies: HTML, CSS, JavaScript, and frameworks like React, Vue.js, or Angular.
Proficiency in back-end technologies: Node.js, PHP, Django, Ruby, or similar.
Experience with database management systems (e.g., MySQL, MongoDB, PostgreSQL).
Familiarity with version control (Git).
Understanding of responsive design and mobile-first development.
Knowledge of website optimization techniques, such as performance tuning and SEO.
Familiarity with API development and integration (RESTful APIs, GraphQL).
Ability to work independently and as part of a team in a fast-paced environment.
Strong problem-solving skills and attention to detail.
Excellent communication skills, both verbal and written.`;

exports.analyzeText = async (req, res) => {
    try {
        const { 
            text, 
            question, 
            questionCounter,
            // State from frontend
            currentSkillIndex = 0,
            currentDifficulty = 'easy',
            questionsPerSkill = 0,
            totalQuestions = 0,
            skillScores = [0, 0, 0],
            extractedSkills
        } = req.body;

        // Initialize session state for technical interview answers
        if (!req.session.technicalInterview) {
            req.session.technicalInterview = {
                answers: []
            };
        }

        console.log('Question Number:', questionCounter);
        console.log(text);

        // Extract skills from first answer only (questionCounter === 1 and extractedSkills is empty)
        if (questionCounter === 1 && (!extractedSkills || extractedSkills.length === 0)) {
            const newSkills = await skillExtractorService.extractSkills(text, jobdescription);
            console.log("Extracted Skills:", newSkills);
            
            // Return initial state
            return res.json({
                analysis: {
                    followUpQuestion: `Tell me about ${newSkills[0]} (easy level)`
                },
                currentSkillIndex: 0,
                currentDifficulty: 'easy',
                questionsPerSkill: 0,
                totalQuestions: 1,
                skillScores: new Array(newSkills.length).fill(0), // Match length dynamically
                extractedSkills: newSkills
            });
        }

        let analyzeResult = await geminiService.geminianalysis(text, question, questionCounter, jobdescription);
        console.log("Analyzing...");
        console.log("Analyze Result:", analyzeResult);

        // Store the detailed analysis in the session
        req.session.technicalInterview.answers.push({
            question,
            answer: text,
            ...analyzeResult
        });

        // Track score for current skill
        if (typeof skillScores[currentSkillIndex] !== 'number') skillScores[currentSkillIndex] = 0;
        skillScores[currentSkillIndex] += analyzeResult.totalScore || 0;
        const newQuestionsPerSkill = questionsPerSkill + 1;
        const newTotalQuestions = totalQuestions + 1;

        // Update difficulty level based on questions per skill
        let newDifficulty = currentDifficulty;
        if (newQuestionsPerSkill === 2) {
            newDifficulty = 'medium';
        } else if (newQuestionsPerSkill === 4) {
            newDifficulty = 'hard';
        }

        let interviewComplete = false;
        let feedback = '';
        let newSkillIndex = currentSkillIndex;
        let newQuestionsPerSkillFinal = newQuestionsPerSkill;
 
        // Check if we need to move to next skill or end interview
        if (newQuestionsPerSkill === 6) {
            if (skillScores[currentSkillIndex] >= 20) { // Lowered threshold
                // Passed threshold, move to next skill
                newSkillIndex = currentSkillIndex + 1;
                if (newSkillIndex < extractedSkills.length) {
                    newDifficulty = 'easy';
                    newQuestionsPerSkillFinal = 0;
                    feedback = `You've passed the ${extractedSkills[currentSkillIndex]} section. Let's move on to ${extractedSkills[newSkillIndex]}.`;
                } else {
                    interviewComplete = true;
                    feedback = "Congratulations! You've completed all sections of the interview.";
                }
            } else {
                // Did not pass threshold, end interview
                feedback = `You did not meet the required score for ${extractedSkills[currentSkillIndex]}. Interview will end here.`;
                interviewComplete = true;
            }
        }

        // Generate next question
        let nextQuestion;
        if (!interviewComplete && newTotalQuestions < 18) {
            const currentSkill = extractedSkills[newSkillIndex];
            if (currentSkill) {
                if (newQuestionsPerSkillFinal === 0 && newSkillIndex !== currentSkillIndex) {
                    // Just switched to a new skill
                    nextQuestion = `Tell me about ${extractedSkills[newSkillIndex]} (easy level)`;
                } else {
                    // Use Gemini's follow-up question
                    nextQuestion = analyzeResult.followUpQuestion || `Tell me about ${currentSkill} (${newDifficulty} level)`;
                }
            } else {
                nextQuestion = "Interview complete. Thank you!";
            }
        } else {
            nextQuestion = feedback || "Interview complete. Thank you!";
        }

        // Log the state for debugging
        console.log({
            currentSkillIndex: newSkillIndex,
            currentDifficulty: newDifficulty,
            questionsPerSkill: newQuestionsPerSkillFinal,
            totalQuestions: newTotalQuestions,
            skillScores,
            nextQuestion,
            extractedSkills
        });

        await fileHandler.saveToJsonFile(analyzeResult);
        
        if (interviewComplete) {

            // Ensure user is authenticated before saving
            if (!req.user || !req.user.uid) {
                console.log("Anonymous user or missing UID. Skipping Firestore save.");
                const anonymousReport = "Interview report is not saved for anonymous users.";
                return res.json({
                    message: "Interview completed. Report not saved for anonymous user.",
                    fullReport: anonymousReport,
                    interviewComplete: true
                });
            }

            const userUid = req.user.uid;
            const interviewType = "technical";
            const totalScore = skillScores.reduce((a, b) => a + b, 0);
            const avgScore = totalQuestions > 0 ? totalScore / totalQuestions : 0;
        
            // Get all stored answers from the session
            const answers = req.session.technicalInterview.answers || [];
        
            // Build HTML Report
            let fullReport = `
                <h2 style="color:#0057ff;">Technical Interview Report</h2>
                <p><strong>User ID:</strong> ${userUid}</p>
                <p><strong>Skills Evaluated:</strong> ${extractedSkills.join(", ")}</p>
                <p><strong>Total Score:</strong> ${totalScore}</p>
                <p><strong>Average Score:</strong> ${avgScore.toFixed(2)}</p>
                <p><strong>Total Questions:</strong> ${newTotalQuestions}</p>
        
                <hr style="margin:20px 0;">
                <h3>Skill-wise Summary</h3>
            `;
        
            extractedSkills.forEach((skill, index) => {
                fullReport += `
                    <div style="padding:10px; border:1px solid #ddd; border-radius:8px; margin-bottom:10px;">
                        <p><strong>${skill} Score:</strong> ${skillScores[index]}</p>
                    </div>
                `;
            });
        
            fullReport += `<hr style="margin:20px 0;"><h3>Detailed Question Analysis</h3>`;
        
            // Only process answers if we have them (and they're an array)
            if (Array.isArray(answers) && answers.length > 0) {
                answers.forEach((a, i) => {
                    fullReport += `
                        <div style="padding:12px; border:1px solid #ddd; border-radius:8px; margin-bottom:15px;">
                            <p><strong>Q${i + 1}:</strong> ${a.question || 'N/A'}</p>
                            <p><strong>Answer:</strong> ${a.answer || 'N/A'}</p>
                            <p><strong>Analysis:</strong> ${a.analysis || 'N/A'}</p>
                            <p><strong>Recommendation:</strong> ${a.recommendation || 'N/A'}</p>
                            <p><strong>Score:</strong> <span style="color:green; font-weight:bold;">${a.totalScore || 0}/10</span></p>
                        </div>
                    `;
                });
            } else {
                fullReport += `<p><em>Detailed question analysis data not available in backup.</em></p>`;
            }
        
            // ⭐ FIX: Save report to user's subcollection, matching HR round flow
            await admin.firestore()
                .collection("users")
                .doc(userUid)
                .collection("progress")
                .doc("TechnicalInterview")
                .collection("attempts")
                .add({
                    totalScore,
                    avgScore,
                    extractedSkills,
                    skillScores,
                    fullReport,
                    submittedAt: admin.firestore.FieldValue.serverTimestamp()
                });
        
            console.log("Technical Interview Report Saved to Firestore!");

            // Clear the session data after saving
            req.session.technicalInterview = null;
        
            return res.json({
                message: "Interview completed and report saved.",
                fullReport,
                interviewComplete: true
            });
        }

        // Return updated state with response
        res.json({
            analysis: {
                ...analyzeResult,
                followUpQuestion: nextQuestion
            },
            currentSkillIndex: newSkillIndex,
            currentDifficulty: newDifficulty,
            questionsPerSkill: newQuestionsPerSkillFinal,
            totalQuestions: newTotalQuestions,
            skillScores,
            extractedSkills
        });

    } catch (error) {
        console.error("Error during analysis:", error);
        res.status(500).json({ error: 'An error occurred during text analysis' });
    }
};