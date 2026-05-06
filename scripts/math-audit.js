const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIRS = ['screens', 'components'];
const FILE_RE = /\.(js|jsx|ts|tsx)$/;
const FORBIDDEN = [
  /\bcomputeCartTotals\b/,
  /\bcomputeItemTotals\b/,
  /\brecomputeTotals\b/,
  /\bsavingsPct\b/,
  /\btotalSavings\b/,
  /\btotalSavedCents\b/,
  /\bregularTotal\b/,
  /\byouPay\b/,
  /\batRegisterSavings\b/,
  /\bplatformRebates\b/,
  /\bestimateRebates\b/,
];

const ALLOWED_FILES = new Set([
  path.normalize('components/SpecStackCard.js'),
  path.normalize('components/WealthProgressCard.js'),
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (FILE_RE.test(entry.name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const dir of TARGET_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.normalize(path.relative(ROOT, file));
    if (ALLOWED_FILES.has(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      FORBIDDEN.forEach((re) => {
        if (re.test(line)) {
          violations.push(`${rel}:${idx + 1}: ${re.source}`);
        }
      });
    });
  }
}

if (violations.length) {
  console.error('Frontend math audit failed. Move pricing math to Cloud Run/Supabase.');
  console.error(violations.slice(0, 80).join('\n'));
  if (violations.length > 80) console.error(`...and ${violations.length - 80} more`);
  process.exit(1);
}

console.log('Frontend math audit passed.');
