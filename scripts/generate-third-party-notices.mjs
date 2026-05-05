#!/usr/bin/env node
/**
 * Generate THIRD_PARTY_NOTICES.txt by walking the dependency graph via
 * `pnpm licenses list --json --prod`. Output is a flat plaintext file
 * grouped by SPDX license, listing each package's name + version + repo
 * URL. Bundled into the desktop installer via electron-builder's
 * `extraResources` so the file ships with every release.
 *
 * Usage:
 *   node scripts/generate-third-party-notices.mjs > THIRD_PARTY_NOTICES.txt
 *
 * Re-run after every dependency change. CI should fail if the file is
 * out of date (compare git diff after running).
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'THIRD_PARTY_NOTICES.txt');

function run(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function gatherLicenses() {
  // --prod excludes devDependencies (test runners, type stubs, build tooling)
  // since those aren't shipped with the installer.
  const raw = run('pnpm licenses list --json --recursive --prod');
  return JSON.parse(raw);
}

function flatten(licenses) {
  // pnpm output shape: { "<SPDX>": [ { name, versions[], license, author, homepage, description, ... } ] }
  // A package with multiple installed versions yields one row per version.
  const rows = [];
  for (const [spdx, packages] of Object.entries(licenses)) {
    for (const pkg of packages) {
      const versions = Array.isArray(pkg.versions) && pkg.versions.length > 0
        ? pkg.versions
        : [''];
      for (const version of versions) {
        rows.push({
          spdx,
          name: pkg.name ?? '(unnamed)',
          version,
          author: typeof pkg.author === 'string'
            ? pkg.author
            : pkg.author?.name ?? '',
          homepage: pkg.homepage ?? '',
        });
      }
    }
  }
  rows.sort((a, b) =>
    a.spdx.localeCompare(b.spdx) ||
    a.name.localeCompare(b.name) ||
    a.version.localeCompare(b.version),
  );
  return rows;
}

function format(rows) {
  const lines = [];
  lines.push('# THIRD-PARTY NOTICES');
  lines.push('');
  lines.push('OpenDeckTracker incorporates the following open-source software');
  lines.push('components. Each component is licensed under its own terms,');
  lines.push('available at the linked repository. The end user\'s use of these');
  lines.push('components is governed by their respective licenses.');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Total entries: ${rows.length}`);
  lines.push('');

  let currentSpdx = null;
  for (const row of rows) {
    if (row.spdx !== currentSpdx) {
      lines.push('');
      lines.push('=========================================================================');
      lines.push(`License: ${row.spdx}`);
      lines.push('=========================================================================');
      lines.push('');
      currentSpdx = row.spdx;
    }
    const versionPart = row.version ? `@${row.version}` : '';
    lines.push(`  ${row.name}${versionPart}`);
    if (row.author) lines.push(`    Author:   ${row.author}`);
    if (row.homepage) lines.push(`    Homepage: ${row.homepage}`);
    lines.push('');
  }
  return lines.join('\n');
}

const licenses = gatherLicenses();
const rows = flatten(licenses);
const text = format(rows);
writeFileSync(OUTPUT_PATH, text, 'utf8');
console.log(`wrote ${rows.length} packages to ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
