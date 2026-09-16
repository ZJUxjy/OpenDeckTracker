import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktopRequire = createRequire(resolve(root, 'apps/desktop/package.json'));
// Use the same YAML parser as the installed updater to validate its feed.
const updaterRequire = createRequire(desktopRequire.resolve('electron-updater'));
const { load } = updaterRequire('js-yaml');
const desktop = JSON.parse(await readFile(resolve(root, 'apps/desktop/package.json'), 'utf8'));
const workspace = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const version = desktop.version;
assert.equal(workspace.version, version, 'Workspace and desktop versions differ');
if (process.env.GITHUB_REF_TYPE === 'tag')
  assert.equal(process.env.GITHUB_REF_NAME, `v${version}`, 'Tag does not match app version');
const output = resolve(root, 'apps/desktop/release');
const manifest = load(await readFile(resolve(output, 'latest.yml'), 'utf8'));
assert.equal(manifest.version, version, 'Update manifest has a stale version');
const installer = `OpenDeckTracker-Setup-${version}.exe`;
assert.equal(manifest.path, installer, 'Unexpected installer path');
assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'Missing manifest files');
assert.ok(
  manifest.files.some((file) => file.url === installer),
  'Installer missing from manifest',
);
for (const file of manifest.files) {
  assert.equal(basename(file.url), file.url, 'Release asset must be a plain file name');
  const bytes = await readFile(resolve(output, file.url));
  assert.equal(bytes.length, file.size, `Size mismatch: ${file.url}`);
  assert.equal(
    createHash('sha512').update(bytes).digest('base64'),
    file.sha512,
    `Checksum mismatch: ${file.url}`,
  );
}
assert.equal(manifest.sha512, manifest.files.find((file) => file.url === installer).sha512);
for (const name of [`${installer}.blockmap`, `OpenDeckTracker-${version}-win.zip`]) {
  assert.ok((await stat(resolve(output, name))).size > 0, `Missing or empty ${name}`);
}
const feed = load(await readFile(resolve(output, 'win-unpacked/resources/app-update.yml'), 'utf8'));
assert.equal(feed.provider, 'github');
assert.equal(feed.owner, 'ZJUxjy');
assert.equal(feed.repo, 'OpenDeckTracker');
assert.equal(
  feed.publisherName,
  undefined,
  'Unsigned release must not claim a certificate publisher',
);
console.log(
  `Verified v${version}: installer, ZIP, blockmap, manifest, SHA-512 and packaged GitHub feed.`,
);
