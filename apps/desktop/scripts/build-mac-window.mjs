// Build the macOS window addon before `pnpm dev`, but only on darwin.
// No-op on Windows/Linux so the cross-platform dev flow is unaffected.
import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  ['--filter', '@hdt/hs-window-mac', 'build:debug'],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
