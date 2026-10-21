import fs from 'fs';
import path from 'path';

// Regex matching unicode emojis across code planes
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1FA00}-\u{1FAFF}]/u;

const SEARCH_DIRS = ['server', 'web/src', 'scripts', 'migrations'];
const TARGET_FILES = ['docs/10-ENCRYPTION.md'];
const IGNORED_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.xlsx', '.enc', '.pdf'];

let violations = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        scanDir(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORED_EXTS.includes(ext)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (EMOJI_REGEX.test(lines[i])) {
          console.error(`[EMOJI VIOLATION] ${fullPath}:${i + 1} contains prohibited emoji.`);
          violations++;
        }
      }
    }
  }
}

console.log('>>> Auditing workspace for prohibited emojis (UI zero-emoji rule) <<<');
for (const dir of SEARCH_DIRS) {
  scanDir(dir);
}

if (violations > 0) {
  console.error(`[FAIL] Detected ${violations} emoji rule violations.`);
  process.exit(1);
} else {
  console.log('[PASS] Zero emojis detected across repository.');
  process.exit(0);
}
