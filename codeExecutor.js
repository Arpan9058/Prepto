const { exec } = require('child_process');
const fs = require('fs').promises; 
const path = require('path');


async function createTempFile(code, language) {
  const tempFilePath = path.join(__dirname, 'temp', `temp_${Date.now()}.${getFileExtension(language)}`); // Ensure 'temp' dir exists
  await fs.writeFile(tempFilePath, code, 'utf8');
  return tempFilePath;
}

function getFileExtension(language) {
  switch (language) {
    case 'python': return 'py';
    case 'javascript': return 'js';
    case 'java': return 'java';
    case 'cpp': return 'cpp';
    default: return 'txt'; // Fallback
  }
}

async function executeCode(code, language) {
  let tempFilePath;
  try {
    tempFilePath = await createTempFile(code, language);
    let command;
    let executionTimeout = 10000; // 10 seconds (adjust as needed)
    let cleanupCommand;

    switch (language) {
      case 'python':
        command = `python ${tempFilePath}`;
        cleanupCommand = `rm ${tempFilePath}`;
        break;
      case 'javascript':
        command = `node ${tempFilePath}`;
        cleanupCommand = `rm ${tempFilePath}`;
        break;
      case 'java':
        const className = 'Main'; // Assuming class name is Main
        command = `javac ${tempFilePath} && java -classpath ${path.dirname(tempFilePath)} ${className}`;
        cleanupCommand = `rm ${tempFilePath.replace('.java', '.class')} && rm ${tempFilePath}`;
        break;
      case 'cpp':
        const executablePath = tempFilePath.replace('.cpp', ''); // e.g., /path/to/temp/temp_123
        command = `g++ ${tempFilePath} -o ${executablePath} && ${executablePath}`;
        cleanupCommand = `rm ${executablePath} && rm ${tempFilePath}`;
        break;
      default:
        throw new Error('Unsupported language');
    }

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      exec(command, { timeout: executionTimeout }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    return { output: stdout, error: stderr };

  } catch (error) {
    console.error('Execution Error:', error);
    return { output: '', error: error.message || 'Execution failed.' }; // Provide a consistent error object
  } finally {
    if (tempFilePath) {
      try {
          if (cleanupCommand) {
            exec(cleanupCommand, (cleanupError, cleanupStdout, cleanupStderr) => {
                if (cleanupError) {
                    console.error("Cleanup error:", cleanupError);
                }
            });
          }
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }
    }
  }
}

module.exports = { executeCode };