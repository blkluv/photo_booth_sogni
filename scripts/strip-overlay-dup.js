/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

// This script removes duplicate overlay CSS blocks (.flash-overlay, .countdown-overlay, and their keyframes)
// from split CSS files that are now centralised in styles/overlay.css.
// The first file (index1.css) was cleaned manually; we now process the rest.

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(projectRoot, 'src');

const files = fs.readdirSync(srcDir).filter(f => /^index\d+\.css$/.test(f) && f !== 'index1.css');

// Regex helpers (non-greedy to first closing brace + following keyframes)
const flashBlock = /\/\*[^]*?flash overlay[^]*?{[^]*?}\s*[^]*?@keyframes\s+flash[^]*?{[^]*?}\s*/gi;
const brightenFlashBlock = /\/\*[^]*?Brighten up the flash[^]*?{[^]*?}\s*[^]*?@keyframes\s+flash[^]*?{[^]*?}\s*/gi;
const countdownBlock = /\/\*[^]*?countdown[^]*?{[^]*?}\s*[^]*?@keyframes\s+pulse[^]*?{[^]*?}\s*/gi;

files.forEach(file => {
  const abs = path.join(srcDir, file);
  let content = fs.readFileSync(abs, 'utf8');
  const original = content;
  content = content
    .replace(flashBlock, '')
    .replace(brightenFlashBlock, '')
    .replace(countdownBlock, '');
  if (content !== original) {
    fs.writeFileSync(abs, content, 'utf8');
    console.log(`✔ Stripped overlay duplicates from ${file}`);
  } else {
    console.log(`ℹ ${file}: no overlay duplicates found`);
  }
}); 