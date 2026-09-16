module.exports = [
    // paste the questions you provided (converted to objects)
    {
      category: "English Comprehension",
      question: "Passage : Artificial intelligence (AI) is transforming industries worldwide. Many companies use AI for automation, customer service, and data analysis. The technology is constantly evolving and impacting different sectors in unique ways \n Question : What is AI commonly used for?",
      options: ["Entertainment", "Automation", "Cooking", "None of the above"],
      answer: "Automation"
    },
    {
      category: "English Comprehension",
      question: "Passage : Artificial intelligence (AI) is transforming industries worldwide. Many companies use AI for automation, customer service, and data analysis. The technology is constantly evolving and impacting different sectors in unique ways \n Question : Which industry is NOT mentioned as being impacted by AI?",
      options: ["Healthcare", "Customer Service", "Data Analysis", "Sports"],
      answer: "Sports"
    },
    {
      category: "English Comprehension",
      question: "Passage : Artificial intelligence (AI) is transforming industries worldwide. Many companies use AI for automation, customer service, and data analysis. The technology is constantly evolving and impacting different sectors in unique ways \n Question : What does AI help companies with?",
      options: ["Data Analysis", "Sleeping", "Playing", "Fishing"],
      answer: "Data Analysis"
    },
    {
      category: "English Comprehension",
      question: "Passage : Artificial intelligence (AI) is transforming industries worldwide. Many companies use AI for automation, customer service, and data analysis. The technology is constantly evolving and impacting different sectors in unique ways \n Question : Is AI evolving?",
      options: ["Yes", "No", "Maybe", "Not sure"],
      answer: "Yes"
    },
    {
      category: "English Comprehension",
      question: "Passage : Artificial intelligence (AI) is transforming industries worldwide. Many companies use AI for automation, customer service, and data analysis. The technology is constantly evolving and impacting different sectors in unique ways \n Question : Which of these is an application of AI?",
      options: ["Customer Service", "Baking", "Swimming", "Gardening"],
      answer: "Customer Service"
    },
  
    // Personality (answers marked 'Varies' - keep one answer; server comparisons expect exact match,
    // but we can accept any: for personality we'll store answer 'Varies' and treat scoring differently
    {
      category: "Personality",
      question: "Which statement best describes your decision-making style?",
      options: ["I analyze every detail before deciding.", "I trust my instincts and go with my gut.", "I seek opinions from others before making a decision.", "I prefer to let others decide."],
      answer: "Varies"
    },
    {
      category: "Personality",
      question: "How do you handle stressful situations?",
      options: ["I stay calm and find logical solutions.", "I seek support from friends or family.", "I take a break and return to the problem later.", "I tend to get overwhelmed."],
      answer: "Varies"
    },
    {
      category: "Personality",
      question: "What motivates you the most in your career?",
      options: ["Recognition and rewards", "Personal growth and learning", "Helping others and making an impact", "Job security and stability"],
      answer: "Varies"
    },
    {
      category: "Personality",
      question: "How do you approach teamwork?",
      options: ["I prefer to take the lead.", "I collaborate and support my team.", "I work better alone.", "I follow instructions without question."],
      answer: "Varies"
    },
    {
      category: "Personality",
      question: "How do you react to constructive criticism?",
      options: ["I appreciate it and use it for growth.", "I feel defensive but try to improve.", "I ignore it if I disagree.", "I take it personally and feel discouraged."],
      answer: "Varies"
    },
  
    // aptitude
    {
      category: "aptitude",
      question: "The sum of three numbers is 98. The ratio of the first to the second is 2:3, and the ratio of the second to the third is 5:8. What is the second number?",
      options: ["30", "35", "40", "45"],
      answer: "35"
    },
    {
      category: "aptitude",
      question: "A man invests ₹12,000 in a scheme that offers compound interest at 10% per annum, compounded annually. What will be the amount after 3 years?",
      options: ["₹15,972", "₹16,500", "₹17,500", "₹18,000"],
      answer: "₹15,972"
    },
    {
      category: "aptitude",
      question: "The speed of a boat in still water is 12 km/h, and the speed of the stream is 4 km/h. If the boat travels 48 km downstream and returns, what is the total time taken?",
      options: ["10 hours", "12 hours", "8 hours", "6 hours"],
      answer: "10 hours"
    },
    {
      category: "aptitude",
      question: "Find the missing number in the series: 3, 9, 27, 81, __, 729",
      options: ["162", "243", "324", "486"],
      answer: "243"
    },
    {
      category: "aptitude",
      question: "A company’s revenue increased from ₹2,40,000 in 2020 to ₹3,60,000 in 2023. What is the average annual growth rate (AAGR)?",
      options: ["25%", "33.3%", "50%", "20%"],
      answer: "33.3%"
    },
  
    // reasoning
    {
      category: "reasoning",
      question: "A, C, F, J, O, ? What comes next in the sequence?",
      options: ["T", "U", "V", "W"],
      answer: "U"
    },
    {
      category: "reasoning",
      question: "If in a certain code, ‘MANGO’ is written as ‘OCPHQ’, how is ‘APPLE’ written in that code?",
      options: ["CRRNG", "CRNPG", "CQNNH", "CQRNG"],
      answer: "CQRNG"
    },
    {
      category: "reasoning",
      question: "A man is facing north. He turns 90 degrees clockwise, then 180 degrees counterclockwise, then 90 degrees clockwise. Which direction is he facing now?",
      options: ["North", "South", "East", "West"],
      answer: "North"
    },
    {
      category: "reasoning",
      question: "If A + B means A is the mother of B, A - B means A is the father of B, A * B means A is the sister of B, then what does P * Q - R mean?",
      options: ["P is the aunt of R", "P is the sister of R", "P is the mother of R", "P is the grandmother of R"],
      answer: "P is the aunt of R"
    },
    {
      category: "reasoning",
      question: "Complete the analogy: Mountain is to Hill as River is to __?",
      options: ["Pond", "Stream", "Lake", "Waterfall"],
      answer: "Stream"
    },
  
    // coding
    {
      category: "coding",
      question: "What does HTML stand for?",
      options: ["HyperText Markup Language", "Hyper Transfer Markup Language", "HighText Machine Learning", "None"],
      answer: "HyperText Markup Language"
    },
    {
    category: "automata",
    question: "Which of the following is NOT a type of grammar in Chomsky hierarchy?",
    options: ["Type 0", "Type 4", "Type 2", "Type 1"],
    answer: "Type 4"
  },
  {
    category: "automata",
    question: "Which automaton accepts only regular languages?",
    options: ["Pushdown Automata", "Linear Bounded Automata", "Finite Automata", "Turing Machine"],
    answer: "Finite Automata"
  },
  {
    category: "automata",
    question: "PDA is more powerful than FA because it uses:",
    options: ["Queue", "Stack", "Tape", "Registers"],
    answer: "Stack"
  },
  {
    category: "automata",
    question: "Which of the following is TRUE for regular languages?",
    options: [
      "Closed under union",
      "Closed under intersection",
      "Closed under complementation",
      "All of the above"
    ],
    answer: "All of the above"
  },
  {
    category: "automata",
    question: "A language is context-free if and only if it is accepted by:",
    options: ["DFA", "NFA", "PDA", "TM"],
    answer: "PDA"
  },
  
  
    // Essay category: We'll store the topic as a 'question' with empty options and answer
    {
      category: "Essay",
      question: "Essay Topic: The Impact of Technology on Society",
      options: [],
      answer: "N/A" // no answer
    }
  ];