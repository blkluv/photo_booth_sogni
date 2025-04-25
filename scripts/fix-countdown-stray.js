/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(projectRoot, 'src');

const files = fs.readdirSync(srcDir).filter(f => /^index\d+\.css$/.test(f));

files.forEach(file => {
  const abs = path.join(srcDir, file);
  let lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\.countdown-overlay,?/.test(lines[i])) {
      lines.splice(i, 1); // remove malformed line
      changed = true;
      // if next line is just a closing brace, remove it too
      if (i < lines.length && /^\s*\}\s*$/.test(lines[i])) {
        lines.splice(i, 1);
      }
      i--; // re-check current index
    }
  }
  if (changed) {
    fs.writeFileSync(abs, lines.join('\n'), 'utf8');
    console.log(`✔ Removed stray countdown overlay line from ${file}`);
  }
}); 