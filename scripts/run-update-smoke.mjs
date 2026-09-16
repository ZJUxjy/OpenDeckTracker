import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/desktop/package.json'));
const environment = { ...process.env };
const portable = process.argv.includes('--portable');
if (portable) environment.HDT_SMOKE_PORTABLE = '1';
const prefix = portable ? 'portable-update-smoke' : 'update-smoke';
delete environment.ELECTRON_RUN_AS_NODE;
const scratch = resolve(root, 'tmp');
await mkdir(scratch, { recursive: true });
await rm(resolve(scratch, `${prefix}-result.json`), { force: true });
try {
  const { stdout, stderr } = await promisify(execFile)(
    require('electron'),
    [resolve(root, 'scripts/smoke-update.cjs')],
    {
      cwd: root,
      env: environment,
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  await writeFile(resolve(scratch, `${prefix}.out.log`), stdout);
  await writeFile(resolve(scratch, `${prefix}.err.log`), stderr);
  const result = JSON.parse(await readFile(resolve(scratch, `${prefix}-result.json`), 'utf8'));
  if (!result.passed || result.installerExecuted)
    throw new Error('Packaged update smoke test failed');
  console.log(
    `Packaged v${result.detected.version} (${portable ? 'portable ZIP' : 'NSIS'}): update detected; corrupt download rejected; retry downloaded and verified; explicit install call confirmed. Installation was intercepted.`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
