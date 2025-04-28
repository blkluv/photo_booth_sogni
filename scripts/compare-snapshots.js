import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import chalk from 'chalk';

const SNAPSHOTS_DIR = './tests/visual/baseline.spec.ts-snapshots';
const BASELINE_DIR = './tests/__snapshots__/baseline';

function compareImages(img1Path, img2Path) {
  const img1 = PNG.sync.read(readFileSync(img1Path));
  const img2 = PNG.sync.read(readFileSync(img2Path));
  
  if (img1.width !== img2.width || img1.height !== img2.height) {
    return {
      match: false,
      reason: `Size mismatch: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`
    };
  }

  const diff = new PNG({ width: img1.width, height: img1.height });
  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    img1.width,
    img1.height,
    { threshold: 0.1 }
  );

  const percentDiff = (numDiffPixels / (img1.width * img1.height)) * 100;
  return {
    match: percentDiff < 0.1, // Allow 0.1% difference
    percentDiff,
    diffImage: diff
  };
}

function generateHash(filePath) {
  const content = readFileSync(filePath);
  return createHash('md5').update(content).digest('hex');
}

console.log(chalk.blue('Comparing snapshots...'));
console.log('');

const baselineFiles = readdirSync(BASELINE_DIR).filter(f => f.endsWith('.png'));
const currentFiles = readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png'));

let passedCount = 0;
let failedCount = 0;

for (const file of baselineFiles) {
  const baselinePath = join(BASELINE_DIR, file);
  const currentPath = join(SNAPSHOTS_DIR, file);
  
  if (!currentFiles.includes(file)) {
    console.log(chalk.yellow(`⚠️  Missing current snapshot for ${file}`));
    failedCount++;
    continue;
  }

  const baselineHash = generateHash(baselinePath);
  const currentHash = generateHash(currentPath);

  if (baselineHash === currentHash) {
    console.log(chalk.green(`✓ ${file} - Exact match`));
    passedCount++;
    continue;
  }

  const comparison = compareImages(baselinePath, currentPath);
  if (comparison.match) {
    console.log(chalk.green(`✓ ${file} - Visual match (${comparison.percentDiff.toFixed(3)}% diff)`));
    passedCount++;
  } else {
    console.log(chalk.red(`✗ ${file} - Visual mismatch`));
    if (comparison.reason) {
      console.log(chalk.red(`  ${comparison.reason}`));
    } else {
      console.log(chalk.red(`  ${comparison.percentDiff.toFixed(3)}% pixels different`));
    }
    failedCount++;
  }
}

console.log('');
console.log(chalk.blue('Summary:'));
console.log(chalk.green(`✓ ${passedCount} passed`));
if (failedCount > 0) {
  console.log(chalk.red(`✗ ${failedCount} failed`));
} 