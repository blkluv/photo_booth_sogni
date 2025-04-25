/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

// Walk through src/indexN.css (N>=2) and remove obsolete duplicate thumbnail block.
// We remove everything from the marker comment `/* Thumbnail gallery pinned` up to
// (but NOT including) the marker `/* Complete rewrite of the photo popup styling */`.
// This preserves the rest of each file.

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(projectRoot, 'src');

const startMarker = '/* Thumbnail gallery pinned';
const endMarker = '/* Complete rewrite of the photo popup styling */';

fs.readdirSync(srcDir).forEach(file => {
  if (!/^index\d+\.css$/.test(file)) return;
  if (file === 'index1.css') return; // already handled
  const abs = path.join(srcDir, file);
  let content = fs.readFileSync(abs, 'utf8');
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    console.log(`ℹ ${file}: no duplicate block found`);
    return;
  }
  const endIdx = content.indexOf(endMarker, startIdx);
  if (endIdx === -1) {
    console.warn(`⚠ ${file}: start marker found but end marker missing – skipping`);
    return;
  }
  const newContent = content.slice(0, startIdx) + content.slice(endIdx);
  fs.writeFileSync(abs, newContent, 'utf8');
  console.log(`✔ Stripped duplicate thumbnail block from ${file}`);
}); 