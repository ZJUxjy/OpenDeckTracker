import { app } from 'electron';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

function resultPath(): string {
  const key = createHash('sha256')
    .update(dirname(app.getPath('exe')).toLowerCase())
    .digest('hex');
  return join(app.getPath('userData'), `portable-update-${key}.json`);
}

/** Consume the result for this extraction directory, not another portable copy. */
export function takePortableUpdateError(): string | undefined {
  try {
    const path = resultPath();
    const result: unknown = JSON.parse(readFileSync(path, 'utf8'));
    unlinkSync(path);
    if (
      result &&
      typeof result === 'object' &&
      'success' in result &&
      result.success === false &&
      'message' in result &&
      typeof result.message === 'string'
    )
      return result.message.slice(0, 4000);
  } catch {
    /* No previous update result. */
  }
  return undefined;
}

function runHelper(plan: string, mode: 'Prepare' | 'Apply'): Promise<void> {
  return new Promise((resolve, reject) => {
    const powershell = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    const child = spawn(
      powershell,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(dirname(plan), 'runner.ps1'),
        '-Mode',
        mode,
        '-PlanPath',
        plan,
      ],
      { windowsHide: true, detached: mode === 'Apply', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    let ready = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Portable update helper timed out. Please retry.'));
    }, 120_000);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (mode === 'Apply' && stdout.split(/\r?\n/).includes('READY')) {
        ready = true;
        clearTimeout(timer);
        child.unref();
        child.stdout.destroy();
        child.stderr.destroy();
        resolve();
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (ready) return;
      if (mode === 'Prepare' && code === 0 && stdout.includes('PREPARED')) resolve();
      else reject(new Error(stderr.trim() || `Portable update helper failed (${code}).`));
    });
  });
}

export async function preparePortableUpdate(archive: string, sha512: string): Promise<string> {
  const target = dirname(app.getPath('exe'));
  // Create inside the target: same-volume moves and an early write-permission check.
  const stage = join(target, `.opendecktracker-update-${randomUUID().replaceAll('-', '')}`);
  await mkdir(stage);
  try {
    await copyFile(join(process.resourcesPath, 'portable-update.ps1'), join(stage, 'runner.ps1'));
    const plan = join(stage, 'plan.json');
    await writeFile(
      plan,
      JSON.stringify({
        target,
        stage,
        archive,
        sha512,
        parentPid: process.pid,
        resultPath: resultPath(),
      }),
      'utf8',
    );
    await runHelper(plan, 'Prepare');
    return plan;
  } catch (error) {
    // This is the fresh, exact staging path we created above, never the application root.
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function startPortableUpdate(plan: string): Promise<void> {
  await runHelper(plan, 'Apply');
}
