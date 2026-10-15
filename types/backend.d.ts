import 'express-session';
import 'multer';
import type { Logger } from 'pino';
export interface Identity {
  uid: string;
  email?: string;
  admin?: unknown;
}
interface Answer {
  question: string;
  answer: string;
  analysis: string;
  recommendation: string;
  score?: number;
  totalScore?: number;
  skills?: string[];
}
interface CodingQuestion {
  id: number;
  title: string;
  description: string;
  skeletonCode: Record<string, string>;
  testCases: { input: string; expectedOutput: string }[];
}
interface Evaluation {
  score: number;
  feedback?: { implementation?: string; suggestions?: string[] };
}
declare module 'express-serve-static-core' {
  interface Request {
    user?: Identity;
    log: Logger;
  }
}
declare module 'express-session' {
  interface SessionData {
    ownerUid?: string;
    resumeContent?: string;
    hrInterview?: { answers: Answer[]; completed?: boolean };
    technicalInterview?: {
      skills: string[];
      answers: Answer[];
      skillScores: number[];
      currentSkillIndex: number;
      question: string;
      completed?: boolean;
    };
    coding?: {
      language: string;
      answers: Record<
        string,
        { code: string; question: CodingQuestion; evaluation: Evaluation; timeTaken: number }
      >;
      startTime: number;
      completed?: boolean;
    };
  }
}
interface TransactionBoundary {
  get(ref: unknown): Promise<{ exists: boolean }>;
  set(ref: unknown, data: unknown): unknown;
}
interface DatabaseBoundary {
  collection(name: string): { doc(id: string): unknown };
  runTransaction<T>(fn: (tx: TransactionBoundary) => Promise<T>): Promise<T>;
}
export interface AppOptions {
  env?: NodeJS.ProcessEnv;
  firebase?: {
    auth(): { verifyIdToken(token: string, revoked?: boolean): Promise<Identity> };
    firestore(): DatabaseBoundary;
  };
  gemini?: ReturnType<typeof import('../adapters/gemini').createGemini>;
  frontend?:
    | boolean
    | {
        vite: {
          middlewares: import('express').RequestHandler;
          transformIndexHtml(url: string, html: string): Promise<string>;
        };
      };
  pdf?: typeof import('../resumeGenerator').exportPdf;
  sessionStore?: import('express-session').Store;
  sessionName?: string;
  authCookieName?: string;
  logger?: Logger;
}
