const fs = require('fs');
const path = require('path');

async function saveToJsonFile(data, fileName = 'analysis.json') {
    const filePath = path.join(__dirname, fileName); // Use the provided filename or default to 'data.json'

    try {
        if (fs.existsSync(filePath)) {
            // If the file exists, read its current content and append the new data
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(fileContent);

            // Append the new data to the existing JSON array
            jsonData.push(data);

            // Write back the updated content to the file
            fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
            console.log('Analysis saved successfully to', fileName);
        } else {
            // If the file doesn't exist, create a new file and write the data in an array format
            fs.writeFileSync(filePath, JSON.stringify([data], null, 2), 'utf8');
            console.log('Analysis file created and data saved to', fileName);
        }
    } catch (error) {
        console.error('Error saving analysis to file:', error);
    }
}

module.exports = { saveToJsonFile };
