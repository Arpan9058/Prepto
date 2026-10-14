// Never allow injected production credentials to be used by the test process.
for (const name of Object.keys(process.env)) {
  if (/^(FIREBASE_|GEMINI_|SESSION_SECRET$|GOOGLE_APPLICATION_CREDENTIALS$|GOOGLE_CLOUD_PROJECT$|JWT_SECRET$|MONGODB_URI$)/.test(name)) delete process.env[name];
}
process.env.NODE_ENV = 'test';
