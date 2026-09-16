const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function generateHRReportPDF(answers, totalScore, avgScore, userUid) {
    return new Promise((resolve, reject) => {
        const fileName = `HR_Report_${userUid}_${Date.now()}.pdf`;
        const filePath = path.join(__dirname, "..", "pdfs", fileName);

        // ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);

        const doc = new PDFDocument();
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Title
        doc.fontSize(22).text("HR Interview Report", { align: "center" });
        doc.moveDown();

        // Summary
        doc.fontSize(14).text(`User: ${userUid}`);
        doc.text(`Total Score: ${totalScore}`);
        doc.text(`Average Score: ${avgScore.toFixed(2)}`);
        doc.moveDown();

        doc.fontSize(18).text("Detailed Review:");
        doc.moveDown();

        // Each answer
        answers.forEach((item, index) => {
            doc.fontSize(14).text(`Q${index + 1}: ${item.question}`);
            doc.text(`Answer: ${item.answer}`);
            doc.text(`Score: ${item.score}`);
            doc.text(`Analysis: ${item.analysis}`);
            doc.text(`Recommendation: ${item.recommendation}`);
            doc.moveDown();
        });

        doc.end();

        stream.on("finish", () => resolve(filePath));
        stream.on("error", (err) => reject(err));
    });
}

module.exports = generateHRReportPDF;
