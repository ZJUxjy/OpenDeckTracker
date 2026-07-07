import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(__dirname, '..');

const runtimeFiles = [
  'package.json',
  'index.js',
  'index.d.ts',
  'hearthmirror-native.win32-x64-msvc.node',
] as const;

async function sha256(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

describe('prepare-native-runtime', () => {
  it('copies HearthMirror native runtime to package and dev resolution dirs', async () => {
    await execFileAsync(process.execPath, ['apps/desktop/scripts/prepare-native-runtime.mjs'], {
      cwd: repoRoot,
    });

    for (const fileName of runtimeFiles) {
      const source = resolve(repoRoot, 'packages/hearthmirror/native', fileName);
      const packageTarget = resolve(
        repoRoot,
        'apps/desktop/out/native-runtime/@hdt/hearthmirror-native',
        fileName,
      );
      const devTarget = resolve(
        repoRoot,
        'apps/desktop/out/node_modules/@hdt/hearthmirror-native',
        fileName,
      );

      await expect(sha256(packageTarget)).resolves.toBe(await sha256(source));
      await expect(sha256(devTarget)).resolves.toBe(await sha256(source));
    }
  });

  it('runs before electron-vite dev starts', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(repoRoot, 'apps/desktop/package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.predev).toContain('prepare:native-runtime');
  });
});
