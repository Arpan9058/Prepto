const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../data/analysisResults.json');
async function saveToJsonFile(data, fileName = 'analysis.json') {
    // Optional: Set to false to disable JSON file storage (data is already saved to Firestore)
    const SAVE_TO_JSON = false; // Set to true if you want to keep JSON backup
    
    if (!SAVE_TO_JSON) {
        console.log('JSON file storage disabled (data saved to Firestore only)');
        return;
    }

    try {
        if (fs.existsSync(filePath)) {
            // If the file exists, read its current content and append the new data
            const fileContent = fs.readFileSync(filePath, 'utf8');
            let jsonData = JSON.parse(fileContent);

            // Ensure jsonData is an array (fix for corrupted files)
            if (!Array.isArray(jsonData)) {
                console.warn('Warning: analysisResults.json is not an array. Reinitializing as array.');
                jsonData = [];
            }

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
async function getAllSavedJson() {
    try {
        if (!fs.existsSync(filePath)) {
            console.log("analysis.json not found — returning empty array");
            return [];
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        let data = JSON.parse(fileContent);
        
        // Ensure the data is an array
        if (!Array.isArray(data)) {
            console.warn("Warning: analysisResults.json is not an array format. Returning empty array.");
            return [];
        }
        
        return data;
    } catch (error) {
        console.error("Error reading analysis.json:", error);
        return [];
    }
}

module.exports = { 
    saveToJsonFile,
    getAllSavedJson
};
