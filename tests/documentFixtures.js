const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
async function pdf(text = 'Sample Candidate Node.js PostgreSQL') {
  const doc = new PDFDocument({ compress: false }), chunks = [];
  const done = new Promise((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.text(text); doc.end(); return done;
}
async function docx(text = 'Sample Candidate Node.js PostgreSQL') {
  const zip = new JSZip();
  const escaped = text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escaped}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
module.exports = { pdf, docx };
