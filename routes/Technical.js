const express = require('express');
const router = express.Router();
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const interviewController = require('../controller/interviewController'); 
const {ensureAuthenticated} = require('../middleware/auth.js')


const initialQuestion = "Give me your introduction and your technical skills?";
let currentQuestion = initialQuestion;

router.get('/', ensureAuthenticated,  (req, res) => {
    const userEmail = req.query.email;
    res.render('TechnicalInterview', { question: currentQuestion });
});

router.get('/technical*', ensureAuthenticated, (req, res) => {
    const userEmail = req.query.email;
    res.render('TechnicalInterview', { question: currentQuestion });
});


router.post('/analyze-text', interviewController.analyzeText); 

module.exports = router;