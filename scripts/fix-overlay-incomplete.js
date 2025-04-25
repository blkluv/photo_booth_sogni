/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(projectRoot, 'src');

const files = fs.readdirSync(srcDir).filter(f => /^index\d+\.css$/.test(f));

files.forEach(file => {
  const abs = path.join(srcDir, file);
  let content = fs.readFileSync(abs, 'utf8');
  const original = content;

  // Remove any '@keyframes flash' line (and following lines until next '}' if present)
  content = content.replace(/@keyframes\s+flash\s*\{[^}]*\}?/gs, '');
  // Remove any '.flash-overlay { ... }' that might remain.
  content = content.replace(/\.flash-overlay\s*\{[^}]*\}/gs, '');
  // Remove now-empty '/* Brighten up the flash */' comment lines
  content = content.replace(/\/\*[^*]*Brighten up the flash[^*]*\*\//g, '');

  if (content !== original) {
    fs.writeFileSync(abs, content.trimStart(), 'utf8');
    console.log(`✔ Cleaned flash overlay remnants from ${file}`);
  }
}); 