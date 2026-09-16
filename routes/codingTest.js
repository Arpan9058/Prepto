const codingQuestions = {
    1: {
        id: 1,
        title: "Two Sum Problem",
        description: "Given an array of integers nums and an integer target, return indices of the two numbers in nums such that they add up to target.",
        skeletonCode: {
            Java: String.raw`import java.util.*;

public class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Your code here
        return new int[2];
    }
}`,
            Python: String.raw`def twoSum(nums, target):
    # Your code here
    return []`,
            C: String.raw`#include <stdio.h>
#include <stdlib.h>
int* twoSum(int nums[], int numsSize, int target) {
    // Your code here
    return NULL;
}`,
            'C++': String.raw`#include <iostream>
#include <vector>
using namespace std;
vector<int> twoSum(vector<int>& nums, int target) {
    // Your code here
    return {};
}`
        },
        testCases: [
            { input: "[2,7,11,15], target = 9", expectedOutput: "[0,1]" },
            { input: "[3,2,4], target = 6", expectedOutput: "[1,2]" },
            { input: "[3,3], target = 6", expectedOutput: "[0,1]" }
        ]
    },
    2: {
        id: 2,
        title: "Subarray Product Less Than K",
        description: "Return the number of contiguous subarrays where the product of all the elements is strictly less than k.",
        skeletonCode: {
            Java: String.raw`import java.util.*;

public class Solution {
    public int numSubarrayProductLessThanK(int[] nums, int k) {
        // Your code here
        return 0;
    }
}`,
            Python: String.raw`def numSubarrayProductLessThanK(nums, k):
    # Your code here
    return 0`,
            C: String.raw`#include <stdio.h>
int numSubarrayProductLessThanK(int nums[], int n, int k) {
    // Your code here
    return 0;
}`,
            'C++': String.raw`#include <iostream>
#include <vector>
using namespace std;
int numSubarrayProductLessThanK(vector<int>& nums, int k) {
    // Your code here
    return 0;
}`
        },
        testCases: [
            { input: "[10, 5, 2, 6], k = 100", expectedOutput: "8" },
            { input: "[1, 2, 3], k = 0", expectedOutput: "0" }
        ]
    },
    3: {
        id: 3,
        title: "Add Two Numbers (Linked Lists)",
        description: "Add two numbers represented as linked lists in reverse order and return the sum as a linked list.",
        skeletonCode: {
            Java: String.raw`import java.util.*;

public class ListNode {
    int val;
    ListNode next;
    ListNode(int x) { val = x; }
}

public class Solution {
    public ListNode addTwoNumbers(ListNode l1, ListNode l2) {
        // Your code here
        return null;
    }
}`,
            Python: String.raw`class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def addTwoNumbers(l1, l2):
    # Your code here
    return None`,
            C: String.raw`#include <stdio.h>
struct ListNode {
    int val;
    struct ListNode* next;
};

struct ListNode* addTwoNumbers(struct ListNode* l1, struct ListNode* l2) {
    // Your code here
    return NULL;
}`,
            'C++': String.raw`#include <iostream>
using namespace std;

struct ListNode {
    int val;
    ListNode* next;
    ListNode(int x) : val(x), next(NULL) {}
};

ListNode* addTwoNumbers(ListNode* l1, ListNode* l2) {
    // Your code here
    return nullptr;
}`
        },
        testCases: [
            { input: "[2, 4, 3], [5, 6, 4]", expectedOutput: "[7, 0, 8]" },
            { input: "[0], [0]", expectedOutput: "[0]" }
        ]
    }
};
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = 2000;
const { ensureAuthenticated } = require('../middleware/auth.js');

const admin = require('../firebase.js'); // already initialized
const db = admin.firestore();

// Gemini API Configuration
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// --- ROUTES ---

// Home Route
router.get('/', ensureAuthenticated, (req, res) => {
  res.render('CodingTestFront', { languages: ['Java', 'C', 'C++', 'Python'] });
});

router.post('/submit-test', ensureAuthenticated, async (req, res) => {
  if (!req.session.testStarted) return res.redirect('/');

  const { code } = req.body;
  const questionNumber = Object.keys(req.session.answers).length + 1;

  // ✅ Save last question if code exists
  if (code && codingQuestions[questionNumber]) {
    const question = codingQuestions[questionNumber];

    const evaluation = await evaluateCode(question, code, req.session.language);

    req.session.answers[questionNumber] = {
      code,
      evaluation,
      question,
      timeTaken: (Date.now() - req.session.startTime) / 1000
    };

    req.session.score += evaluation.score;
  }

  return res.redirect('/coding-test/results');
});

// Start Test
router.post('/start-test', ensureAuthenticated, (req, res) => {
  const language = req.body.language;
  if (!language || !['Java', 'C', 'C++', 'Python'].includes(language)) {
    return res.status(400).send('Invalid language selected.');
  }

  req.session.testStarted = true;
  req.session.uid = req.user.uid;
  req.session.language = language;
  req.session.answers = {};
  req.session.score = 0;
  req.session.questionsAsked = [];
  req.session.startTime = Date.now();
  res.redirect('/coding-test/question/1');
});

// Load Question
router.get('/question/:id', ensureAuthenticated, (req, res) => {
  if (!req.session.testStarted) {
    return res.redirect('/');
  }

  const questionId = parseInt(req.params.id);
  const language = req.session.language || 'Java';
  const question = codingQuestions[questionId];

  if (!question) {
    return res.status(404).send('Question not found.');
  }

  const startTime = req.session.startTime;
  const now = Date.now();
  const timeElapsed = (now - startTime) / 1000;
  const maxTimeAllowed = 45 * 60;

  if (timeElapsed > maxTimeAllowed) {
    return res.redirect('/coding-test/results');
  }

  req.session.currentQuestion = question;
  const skeletonCode = question.skeletonCode[language].trim();

  res.render('question', {
    question: question,
    language: language,
    skeletonCode: skeletonCode,
    testCases: question.testCases,
    questionNumber: questionId,
    timeRemaining: maxTimeAllowed - timeElapsed
  });
});

// Submit Answer
router.post('/submit-answer/:questionNumber', ensureAuthenticated, async (req, res) => {
  const questionNumber = parseInt(req.params.questionNumber);
  const isEarly = req.body.earlySubmit;

  if (!req.session.testStarted || questionNumber < 1 || questionNumber > 3) {
    return res.redirect('/');
  }

  const { code } = req.body;

  // ✅ FIX: always get correct question
  const question = codingQuestions[questionNumber];

  const startTime = req.session.startTime;
  const now = Date.now();
  const timeElapsed = (now - startTime) / 1000;
  const maxTimeAllowed = 45 * 60;

  if (timeElapsed > maxTimeAllowed) {
    return res.status(400).json({ error: 'Time limit exceeded.' });
  }

  try {
    console.log(`Submitting Q${questionNumber}`);

    const evaluation = await evaluateCode(question, code, req.session.language);

    // ✅ ALWAYS SAVE ANSWER
    req.session.answers[questionNumber] = {
      code,
      evaluation,
      question,
      timeTaken: timeElapsed
    };

    req.session.score += evaluation.score;

    // ✅ If early submit, go to results; otherwise go to next question
    if (isEarly === "true") {
      return res.redirect('/coding-test/results');
    }

    const nextQuestion = questionNumber + 1;

    await new Promise(res => setTimeout(res, 1000)); // small delay

    if (nextQuestion <= 3) {
      return res.redirect(`/coding-test/question/${nextQuestion}`);
    } else {
      return res.redirect('/coding-test/results');
    }

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).send('Error evaluating code');
  }
});

// Show Results
// Show Results with Full Report Storage
router.get('/results', ensureAuthenticated, async (req, res) => {
  if (!req.session.testStarted || !req.session.uid) {
    return res.redirect('/');
  }

  const answers = req.session.answers;
  const language = req.session.language;
  const userUid = req.session.uid;

  const totalScore = Object.values(answers).reduce((acc, a) => acc + (a.evaluation?.score || 0), 0);
  const avgScore = Object.values(answers).length > 0 ? totalScore / Object.values(answers).length : 0;

  // Generate **student-friendly HTML report**
  let fullReport = `
    <h2 style="color:#0057ff;">Coding Test Report</h2>
    <p><strong>User ID:</strong> ${userUid}</p>
    <p><strong>Total Score:</strong> ${totalScore}</p>
    <p><strong>Average Score:</strong> ${avgScore.toFixed(2)}</p>
    <p><strong>Language:</strong> ${language}</p>
    <hr style="margin:20px 0;">
    <h3>Detailed Question Analysis</h3>
  `;

  Object.entries(answers).forEach(([qNum, a]) => {
    const evalData = a.evaluation || {};
    const feedback = evalData.feedback || {};

    fullReport += `
      <div style="padding:12px; border:1px solid #ddd; border-radius:8px; margin-bottom:15px;">
        <p><strong>Q${qNum}:</strong> ${a.question.title}</p>
        <p><strong>Description:</strong> ${a.question.description}</p>

        <p><strong>Submitted Code:</strong></p>
        <pre style="background:#f4f4f4; padding:10px; border-radius:4px;">${a.code}</pre>

        <p><strong>Score:</strong> ${evalData.score || 0}</p>
        <p><strong>Feedback:</strong></p>
        <ul>
          <li><strong>Code Structure:</strong> ${feedback.codeStructure || 'N/A'}</li>
          <li><strong>Implementation:</strong> ${feedback.implementation || 'N/A'}</li>
          <li><strong>Edge Cases:</strong> ${feedback.edgeCases || 'N/A'}</li>
          ${feedback.suggestions ? feedback.suggestions.map(s => `<li>${s}</li>`).join('') : ''}
        </ul>

        <p><strong>Time Taken (s):</strong> ${a.timeTaken.toFixed(2)}</p>
      </div>
    `;
  });

  try {
    const attemptRef = db
      .collection('users')
      .doc(userUid)
      .collection('progress')
      .doc('CodingTest')
      .collection('attempts');

    await attemptRef.add({
      score: totalScore,
      avgScore: avgScore,
      language,
      // answers,
      fullReport, // store formatted HTML
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Render results page
    res.render('results', { score: totalScore, answers, language, fullReport });

    // Destroy session
    req.session.destroy(err => {
      if (err) console.error('Session destroy error:', err);
    });

  } catch (error) {
    console.error('Error saving coding test result:', error);
    res.status(500).send('Error saving coding test result');
  }
});



// --- Gemini Function (with Retry + Backoff) ---
async function evaluateCode(question, code, language) {
  if (!question || !question.testCases) {
    throw new Error('Test cases not found.');
  }

  const testCasesString = JSON.stringify(question.testCases);
  const prompt = `Evaluate the following ${language} code based on the given question and test cases.
  Question: ${question.description}
  Code:\n${code}\n
  Test Cases: ${testCasesString}

  Provide a detailed evaluation in this JSON format:
  {
      "score": <number between 0-100>,
      "feedback": {
          "codeStructure": "<feedback about code structure>",
          "implementation": "<feedback about implementation>",
          "edgeCases": "<feedback about edge cases>",
          "suggestions": ["<suggestion 1>", "<suggestion 2>"]
      }
  }

  If the code is empty:
  - Set score to 0
  - Suggest a structured approach and key concepts
  - No code in the response, only text feedback.`;

  // --- Safe Gemini call with retry & exponential backoff ---
  async function safeGeminiRequest(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await model.generateContent(prompt);
      } catch (err) {
        if (err.status === 429 && i < retries - 1) {
          const wait = (i + 1) * 2000; // 2s, then 4s, then 6s
          console.warn(`Gemini rate limit hit. Retrying in ${wait} ms...`);
          await new Promise(res => setTimeout(res, wait));
        } else {
          throw err;
        }
      }
    }
  }

  try {
    const result = await safeGeminiRequest();
    let text = result.response.candidates[0].content.parts[0].text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    return JSON.parse(text);

  } catch (err) {
    console.error("Gemini error:", err);
    return {
      score: 0,
      feedback: {
        codeStructure: "Could not evaluate due to API limit or network error.",
        implementation: "Try again later.",
        edgeCases: "Evaluation skipped.",
        suggestions: ["Wait a few seconds and retry."]
      }
    };
  }
}

module.exports = router;
