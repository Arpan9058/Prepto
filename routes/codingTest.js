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
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { attempts, answerReport } = require('../utils/reports');
function createCodingRouter() {
  const router = express.Router();
  router.use(ensureAuthenticated);
  router.get('/', (_req, res) => res.render('CodingTestFront', { languages: ['Java', 'C', 'C++', 'Python'] }));
  router.post('/start-test', (req, res, next) => {
    const { language } = req.body;
    if (!['Java', 'C', 'C++', 'Python'].includes(language)) return next(httpError(400, 'Invalid language'));
    req.session.coding = { language, answers: {}, startTime: Date.now() };
    res.redirect('/coding-test/question/1');
  });
  router.get('/question/:id', (req, res, next) => {
    const state = req.session.coding;
    const q = codingQuestions[req.params.id];
    if (!state) return res.redirect('/coding-test');
    if (!q) return next(httpError(404, 'Question not found'));
    res.render('question', { question: q, language: state.language, skeletonCode: q.skeletonCode[state.language].trim(), testCases: q.testCases, questionNumber: q.id, timeRemaining: Math.max(0, 2700 - (Date.now() - state.startTime) / 1000) });
  });
  async function submit(req, id) {
    const state = req.session.coding;
    if (!state || state.completed) throw httpError(409, 'No active coding test');
    if (!codingQuestions[id] || state.answers[id]) throw httpError(409, 'Invalid or repeated question');
    if (Date.now() - state.startTime > 2700000) throw httpError(400, 'Time limit exceeded');
    if (typeof req.body.code !== 'string') throw httpError(400, 'Code is required');
    const q = codingQuestions[id];
    const evaluation = await req.app.locals.gemini.generate(`Evaluate this ${state.language} code for ${q.description}. Test cases: ${JSON.stringify(q.testCases)}. Return JSON score (0-100), feedback with codeStructure, implementation, edgeCases, suggestions array. Code: ${req.body.code}`, { json: true });
    if (!Number.isFinite(evaluation.score) || evaluation.score < 0 || evaluation.score > 100) throw new Error('Invalid coding score');
    state.answers[id] = { code: req.body.code, question: q, evaluation, timeTaken: (Date.now() - state.startTime) / 1000 };
  }
  router.post('/submit-answer/:questionNumber', asyncHandler(async (req, res) => {
    const id = Number(req.params.questionNumber);
    await submit(req, id);
    res.redirect(req.body.earlySubmit === 'true' || id === 3 ? '/coding-test/results' : `/coding-test/question/${id + 1}`);
  }));
  router.post('/submit-test', asyncHandler(async (req, res) => {
    const state = req.session.coding;
    if (!state) throw httpError(409, 'No active coding test');
    if (req.body.code !== undefined && Object.keys(state.answers).length < 3) await submit(req, Object.keys(state.answers).length + 1);
    res.redirect('/coding-test/results');
  }));
  router.get('/results', asyncHandler(async (req, res) => {
    const state = req.session.coding;
    if (!state) return res.redirect('/coding-test');
    const score = Object.values(state.answers).reduce((sum, a) => sum + a.evaluation.score, 0);
    const fullReport = answerReport('Coding Test Report', Object.values(state.answers).map(a => ({ question: a.question.title, answer: a.code, score: a.evaluation.score, analysis: a.evaluation.feedback?.implementation })));
    if (!state.completed) {
      await attempts(req.app.locals.firebase.firestore(), req.user.uid, 'CodingTest').add({ score, fullReport, submittedAt: new Date() });
      state.completed = true;
    }
    res.render('results', { score, answers: state.answers, language: state.language, fullReport });
  }));
  return router;
}
module.exports = { createCodingRouter };
