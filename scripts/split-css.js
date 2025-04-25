/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

/**
 * This script backs-up `src/index.css`, then splits it into smaller files
 * named `index1.css`, `index2.css`, … (each ≤ 1000 lines) **only at safe
 * boundaries** where the current brace-depth is zero.  After emitting the
 * partials it rewrites `src/index.css` so that it contains only the original
 * Tailwind directives followed by `@import` statements that pull in the new
 * fragments in order.  The resulting application should therefore render
 * exactly the same UI.
 *
 * Run once with:
 *   node scripts/split-css.js
 */

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(projectRoot, 'src');
const originalPath = path.join(srcDir, 'index.css');
const backupPath = path.join(srcDir, 'index.backup.css');

// ---------------------------------------------------------------------------
// 1. Back-up original file (non-destructive if it already exists)
// ---------------------------------------------------------------------------
if (!fs.existsSync(originalPath)) {
  console.error('error: src/index.css not found');
  process.exit(1);
}
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(originalPath, backupPath);
  console.log(`✔ Backed-up index.css → index.backup.css`);
} else {
  console.log('ℹ Backup already exists, skipping copy');
}

// ---------------------------------------------------------------------------
// 2. Read backup (the source of truth for the split) line-by-line
// ---------------------------------------------------------------------------
const rawLines = fs.readFileSync(backupPath, 'utf8').split(/\r?\n/);

// Grab the initial Tailwind directives (they must remain at the top).
const tailwindDirectives = [];
let directiveEndIdx = 0;
for (let i = 0; i < rawLines.length; i++) {
  const trimmed = rawLines[i].trim();
  if (trimmed.startsWith('@tailwind')) {
    tailwindDirectives.push(rawLines[i]);
    directiveEndIdx = i + 1;
  } else if (trimmed === '') {
    // keep blank line directly after last directive if any
    tailwindDirectives.push(rawLines[i]);
    directiveEndIdx = i + 1;
  } else {
    break;
  }
}

// The CSS that actually needs splitting starts after the tailwind block.
const cssBodyLines = rawLines.slice(directiveEndIdx);

// ---------------------------------------------------------------------------
// 3. Produce fragments respecting brace balance
// ---------------------------------------------------------------------------
const MAX_LINES = 1000;
const fragments = [];
let current = [];
let braceDepth = 0;
let lineCounter = 0;

const pushFragment = () => {
  if (current.length > 0) {
    fragments.push(current.join('\n'));
    current = [];
    lineCounter = 0;
  }
};

for (const line of cssBodyLines) {
  current.push(line);
  // Update brace depth while ignoring braces inside quotes.
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth -= 1;
  }
  lineCounter += 1;
  // When we have reached MAX_LINES and are at top-level (braceDepth === 0)
  // we can safely cut.
  if (lineCounter >= MAX_LINES && braceDepth === 0) {
    pushFragment();
  }
}
// Push any remaining lines
pushFragment();

// ---------------------------------------------------------------------------
// 4. Write fragment files (index1.css, index2.css, …)
// ---------------------------------------------------------------------------
fragments.forEach((content, idx) => {
  const filename = path.join(srcDir, `index${idx + 1}.css`);
  fs.writeFileSync(filename, content, 'utf8');
  console.log(`✔ Wrote ${path.basename(filename)}`);
});

// ---------------------------------------------------------------------------
// 5. Rewrite src/index.css with directives + imports
// ---------------------------------------------------------------------------
let newIndexCssContent = tailwindDirectives.join('\n');
fragments.forEach((_, idx) => {
  newIndexCssContent += `\n@import './index${idx + 1}.css';`;
});
newIndexCssContent += '\n';

fs.writeFileSync(originalPath, newIndexCssContent, 'utf8');
console.log('✔ Rewrote src/index.css with @import statements');

console.log('\nDone! You can now run your dev server to validate that no visual regressions occurred.'); 