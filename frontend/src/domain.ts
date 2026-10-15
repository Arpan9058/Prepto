import type { Overview, Resume, Interview } from './api';
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface Question {
  id: string;
  title: string;
  prompt: string;
  category: string;
  difficulty: string;
  skills: string[];
  type: string;
  options: string[];
  bookmarked?: boolean;
  revision?: number;
  answer?: string;
  explanation?: string;
  correctAnswer?: string | null;
}
export interface Session extends Interview {
  version: number;
  busy: boolean;
  score: number | null;
  currentQuestionId: string | null;
  questions: Question[];
  answers: {
    questionId: string;
    text: string;
    score: number;
    feedback: string;
    nextStep: string;
  }[];
}
export interface ResumeDetail extends Resume {
  currentVersionId: string;
  revision: number;
}
export interface Version {
  id: string;
  number: number;
  label: string;
  text: string;
  characterCount: number;
  source: { kind: string };
}
export interface Match {
  id: string;
  resumeId: string;
  resumeVersionId: string;
  jobTitle: string;
  resumeTitle: string;
  versionNumber: number;
  jobDescription: string;
  score: number | null;
  status: string;
  summary: string | null;
  canRetry: boolean;
  modelId: string;
  result: {
    score: number;
    summary: string;
    matchedSkills: string[];
    missingSkills: string[];
    recommendations: string[];
  } | null;
}
export interface Problem {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  prompt: string;
  topics: string[];
  examples: string[];
  edgeCases: string[];
  starter: Record<string, string>;
  solution?: string;
}
export interface CodingReview {
  id: string;
  problemId: string;
  problem: Problem;
  language: string;
  code: string;
  status: string;
  canRetry: boolean;
  feedback: { score: number; summary: string; improvements: string[] } | null;
}
export interface Goal {
  id: string;
  skill: string;
  targetScore: number;
  weeklySessions: number;
  revision: number;
  currentScore: number | null;
  weekCompleted: number;
  achieved: boolean;
}
export interface Trend {
  skill: string;
  latest: number | null;
  previous: number | null;
  sampleCount: number;
  delta?: number | null;
  nextStep?: string;
  history: { score: number; submittedAt: string }[];
}
export interface Progress extends Overview {
  skills: (Trend & { latest: number; nextStep: string })[];
  comparisons: { type: string; latest: number; previous: number | null; delta: number | null }[];
  codingPractice: { attempts: number; description: string; skills: Trend[] };
  goals: Goal[];
  recommendations: { skill: string | null; message: string; nextStep: string }[];
}
export interface Attempt {
  key: string;
  id: string;
  title: string;
  type: string;
  submittedAt: string;
  score: number | null;
  aiScore: number | null;
  reportUrl: string;
}
export interface Report {
  id: string;
  type: string;
  subTest?: string;
  title: string;
  score: string | number;
  submittedAt: string;
  fullReport: string;
}
