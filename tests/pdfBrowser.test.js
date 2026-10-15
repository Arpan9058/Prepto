const { exportPdf, chromiumPath } = require('../resumeGenerator');
const { extractTextFromFile } = require('../ats');
test('real Chromium creates a PDF that real PDF extraction can read', async () => {
  expect(chromiumPath(process.env)).toBeTruthy();
  const buffer = await exportPdf('<html><body><h1>Alice Node.js Engineer</h1><p>PostgreSQL experience</p></body></html>', { env: { CHROMIUM_EXECUTABLE_PATH: chromiumPath(process.env), CHROMIUM_NO_SANDBOX: 'true' } });
  expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  const text = await extractTextFromFile({ originalname: 'resume.pdf', buffer });
  expect(text).toContain('Alice Node.js Engineer');
  expect(text).toContain('PostgreSQL experience');
}, 30000);
