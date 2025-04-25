/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(projectRoot, 'src');

const files = fs.readdirSync(srcDir).filter(f => /^index\d+\.css$/.test(f));

const flashRegex = /\.flash-overlay\s*\{[^}]*\}\s*/gi;
const keyframesFlashRegex = /@keyframes\s+flash\s*\{[^}]*\}\s*/gi;
const brightenComment = /\/\*[^*]*Brighten up the flash[^*]*\*\/\s*/gi;

files.forEach(file => {
  const abs = path.join(srcDir, file);
  let content = fs.readFileSync(abs, 'utf8');
  const original = content;
  content = content.replace(brightenComment, '').replace(flashRegex, '').replace(keyframesFlashRegex, '');
  if (content !== original) {
    fs.writeFileSync(abs, content.trimStart(), 'utf8');
    console.log(`✔ Stripped flash overlay duplicates from ${file}`);
  }
}); 