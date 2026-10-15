// This server renders EJS at runtime. Validate every source and template without credentials.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ejs = require('ejs');
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.cache', 'coverage', 'temp', 'frontend', 'dist'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    else if (file.endsWith('.ejs')) ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
  }
}
walk(path.join(__dirname, '..'));
console.log('All JavaScript and EJS templates compiled successfully');
