// Comparable physical line counts, not an estimate of buyer-specific "Source LOC".
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.ejs']);
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const groups = {};
for (const file of files) {
  if (!extensions.has(path.extname(file))) continue;
  const lines = fs.readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');
  const group = file.startsWith('frontend/tests/') || file.startsWith('tests/') ? 'tests' : file.startsWith('frontend/') ? 'frontend' : file.startsWith('views/') ? 'EJS templates' : 'backend/tooling/other';
  groups[group] ||= { physical: 0, nonblank: 0 }; groups[group].physical += lines.length; groups[group].nonblank += lines.filter(s => s.trim()).length;
}
console.log(JSON.stringify({ definition: 'Tracked JS/TS/TSX/CSS/EJS physical and nonblank lines; comments included; dependencies/build/lockfile excluded', groups, totalPhysical: Object.values(groups).reduce((s, g) => s + g.physical, 0) }, null, 2));
