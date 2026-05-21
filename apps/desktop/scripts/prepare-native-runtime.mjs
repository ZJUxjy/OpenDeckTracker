import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const sourceDir = resolve(repoRoot, 'packages/hearthmirror/native');
const targetDir = resolve(__dirname, '../out/native-runtime/@hdt/hearthmirror-native');

const runtimeFiles = [
  'package.json',
  'index.js',
  'index.d.ts',
  'hearthmirror-native.win32-x64-msvc.node',
];

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });

for (const fileName of runtimeFiles) {
  await copyFile(resolve(sourceDir, fileName), resolve(targetDir, fileName));
}

console.log(`prepared @hdt/hearthmirror-native runtime files in ${targetDir}`);
