const geminiService = require('../services/geminiService');
const skillExtractorService = require('../services/skillExtractorService');
const fileHandler = require('../utils/fileHandler');

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
            if (skillScores[currentSkillIndex] >= 30) {
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