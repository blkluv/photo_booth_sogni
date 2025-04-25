/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(projectRoot, 'src');

const files = fs.readdirSync(srcDir).filter(f => /^index\d+\.css$/.test(f));

files.forEach(file => {
  const abs = path.join(srcDir, file);
  let lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  // Remove any lines that exactly match `100% { opacity: 0; }` (possibly with whitespace)
  // and any trailing brace-only line if present directly after.
  let changed = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*100%\s*\{\s*opacity:\s*0;\s*\}\s*$/.test(lines[i])) {
      lines.splice(i, 1); // remove that line
      changed = true;
      // if next line is just a lone closing brace, remove it as well
      if (i < lines.length && /^\s*\}\s*$/.test(lines[i])) {
        lines.splice(i, 1);
      }
    }
  }
  if (changed) {
    fs.writeFileSync(abs, lines.join('\n'), 'utf8');
    console.log(`✔ Removed stray 100% opacity line from ${file}`);
  }
}); 