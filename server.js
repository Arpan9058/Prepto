require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const Register = require("./RegisterSchema"); 
const ats = require('./ats'); 
const marked = require('marked');
const sanitizeHtml = require('sanitize-html');
const fs = require('fs');
const { executeCode } = require('./codeExecutor');
const { analyzeWithGemini } = require('./careerGuidance');
const { generateResume } = require('./resumeGenerator');
const puppeteer = require('puppeteer');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');

const port = process.env.PORT || 8080; 
const codingTest = require('./routes/codingTest')
const hrRound = require('./routes/hrRound')
const technical = require('./routes/Technical')

const admin = require('./firebase.js'); 
const db = admin.firestore();


// MongoDB Connection
// mongoose.connect(process.env.MONGODB_URI)
//     .then(() => console.log("MongoDB Atlas connected successfully"))
//     .catch((err) => console.log("Error connecting to MongoDB Atlas:", err));

    app.use(cookieParser());
// Session middleware
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));

// View engine setup
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));




app.use('/coding-test', codingTest);

app.use('/hr-round', hrRound);

app.use('/technical-round', technical);

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('register');
});



app.post('/api/store-user', async (req, res) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).send("No Firebase ID token provided");

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email } = decodedToken;
        const { fullName, mobile } = req.body;

        // Check if user already exists in Firestore
        const userRef = db.collection('users').doc(uid);
        const doc = await userRef.get();

        if (!doc.exists) {
            await userRef.set({
                fullName,
                email,
                mobile,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        res.status(200).send("User stored successfully.");
    } catch (error) {
        console.error("Error verifying Firebase token or storing user:", error);
        res.status(401).send("Unauthorized");
    }
});



app.post('/api/set-token', async (req, res) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).send("Token missing");

  try {
    const decoded = await admin.auth().verifyIdToken(token); // Firebase Admin SDK
    res.cookie("session_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    });
    res.status(200).send("Cookie set");
  } catch (error) {
    console.error("Token verify failed:", error);
    res.status(401).send("Invalid token");
  }
});




app.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.user });
});



app.get('/logout', (req, res) => {
    res.clearCookie('session_token', {
        path: '/',
    });
    res.redirect('/');
});

app.post('/analyze', ensureAuthenticated, ats.upload.single('resume'), async (req, res) => {
    try {
        const resumeFile = req.file;
        const jobDescriptionText = req.body.jobDescription;

        if (!resumeFile || !jobDescriptionText) {
            return res.status(400).send('Please upload a resume and enter a job description.');
        }

        const resumeText = await ats.extractTextFromFile(resumeFile);
        const analysisResult = await ats.analyzeWithGemini(resumeText, jobDescriptionText);

        const htmlResult = marked.parse(analysisResult);
        const sanitizedHtml = sanitizeHtml(htmlResult, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'p']),
            allowedAttributes: {},
        });

        res.render('ATSResult', { analysis: sanitizedHtml });
    } catch (error) {
        console.error("Error during analysis:", error);
        res.status(500).send(`An error occurred: ${error.message}`);
    }
});

app.get('/analyze', ensureAuthenticated, (req, res) => {
    res.render('ATS_JDandRESUME');
});

app.get('/mock-interviews', ensureAuthenticated, (req, res) => {
    res.render('mockInterviews'); 
});


app.get('/mocktest', ensureAuthenticated, (req,res)=>{
    res.redirect("https://mocktest-three.vercel.app/")
});

app.get('/careerguidance', ensureAuthenticated, (req, res) => {
    res.render('careerGuidance');
});

app.post("/career-guidance", ensureAuthenticated, async (req, res) => {
    try {
        const { skills } = req.body;
        
        if (!skills) {
            return res.status(400).send('Please provide your skills.');
        }

        const analysisResult = await analyzeWithGemini(skills);
        
        const htmlResult = marked.parse(analysisResult);
        const sanitizedHtml = sanitizeHtml(htmlResult, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'p']),
            allowedAttributes: {},
        });

        res.render('careerResult', { careerGuidance: sanitizedHtml });
    } catch (error) {
        console.error("Error generating career guidance:", error);
        res.status(500).send("Error generating career guidance");
    }
});

app.get('/resume-builder', ensureAuthenticated, (req, res) => {
    res.render('resumeBuilder');
});

app.post("/generate-resume", ensureAuthenticated, async (req, res) => {
    try {
        // const resumeData = req.body;
        
        // if (!resumeData.fullName || !resumeData.email || !resumeData.phone || !resumeData.location) {
        //     return res.status(400).send('Please provide all required information.');
        // }

        // const resumeContent = await generateResume(resumeData);
        
        // // Store the resume content in the session for later use
        // req.session.resumeContent = resumeContent;
        
        // res.render('resumeResult', { resumeContent });

        const fileName = `resume-${req.user.uid || req.user.email}.html`;
const tempHtmlPath = path.join(__dirname, 'temp', fileName);
fs.writeFileSync(tempHtmlPath, resumeContent);
res.cookie('resume_file', fileName); // Save filename in cookie
res.render('resumeResult', { resumeContent });

    } catch (error) {
        console.error("Error generating resume:", error);
        res.status(500).send("Error generating resume");
    }
});

app.get("/download-resume", ensureAuthenticated, async (req, res) => {
    try {
        const fileName = req.cookies.resume_file;
    if (!fileName) return res.status(400).send("No resume to download.");

    // const tempHtmlPath = path.join(__dirname, 'temp', fileName);
        const tempHtmlPath = path.join(__dirname, 'temp', 'resume.html');
        fs.writeFileSync(tempHtmlPath, req.session.resumeContent);

        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        const htmlContent = fs.readFileSync(tempHtmlPath, 'utf8');
        await page.setContent(htmlContent);

        const pdfPath = path.join(__dirname, 'temp', 'resume.pdf');
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true
        });

        res.download(pdfPath, 'resume.pdf', (err) => {
            if (err) {
                console.error('Error downloading file:', err);
            }
            fs.unlinkSync(tempHtmlPath);
            fs.unlinkSync(pdfPath);
        });

        await browser.close();
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).send("Error generating PDF");
    }
});

// Authentication Middleware
// function ensureAuthenticated(req, res, next) {
//     if (req.session.user) {
//         return next();
//     } else {
//         res.redirect('/login');
//     }
// }
// function ensureAuthenticated(req, res, next) {
//     const token = req.cookies['session_token'];
//     if (!token) {
//         return res.redirect('/login');
//     }
//     try {
//         const payload = jwt.verify(token, process.env.JWT_SECRET);
//         req.user = payload; // Attach user info to request
//         next();
//     } catch (err) {
//         return res.redirect('/login');
//     }
// }


async function ensureAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split('Bearer ')[1] || req.cookies['session_token'];
    if (!token) return res.redirect('/login');

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.redirect('/login');
    }
}




// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});