import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const tracked = execFileSync(
  'git',
  ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'ls-files'],
  { encoding: 'utf8' },
)
  .split(/\r?\n/)
  .filter(Boolean);
if (tracked.includes('.env.local')) throw new Error('Local environment file is tracked.');
const example = readFileSync('.env.example', 'utf8');
if (/AIza[\w-]{20,}/.test(example)) throw new Error('Example environment contains a key.');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const key = process.env.GEMINI_API_KEY;
let scanned = 0;
function scan(dir) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, item.name);
    if (item.isDirectory()) scan(file);
    else {
      scanned++;
      if (key && readFileSync(file).includes(Buffer.from(key)))
        throw new Error('API key found in client build.');
    }
  }
}
scan('.next/static');
console.log(
  JSON.stringify({
    environmentUntracked: true,
    exampleHasNoKey: true,
    clientFilesChecked: scanned,
    clientKeyLeak: false,
  }),
);
