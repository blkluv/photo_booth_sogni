/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(projectRoot, 'src');

const files = fs.readdirSync(srcDir).filter(f => /^index\d+\.css$/.test(f));

// regex to match .control-panel { ... } along with preceding comment lines up to 2 lines
const cpRegex = /(?:\/\*[^]*?control panel[^]*?\*\/\s*)?\.control-panel\s*\{[^}]*\}\s*/gi;
const rowRegex = /\.control-panel-row\s*\{[^}]*\}\s*/gi;

files.forEach(file => {
  const abs = path.join(srcDir, file);
  let content = fs.readFileSync(abs, 'utf8');
  const original = content;
  content = content.replace(cpRegex, '').replace(rowRegex, '');
  if (content !== original) {
    fs.writeFileSync(abs, content.trimStart(), 'utf8');
    console.log(`✔ Stripped control-panel duplicates from ${file}`);
  }
}); 