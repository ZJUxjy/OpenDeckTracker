const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Transform } = require('node:stream');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(
  fs.readFileSync(path.join(root, 'apps/desktop/package.json'), 'utf8'),
).version;
const scratch = path.join(root, 'tmp');
const portable = process.env.HDT_SMOKE_PORTABLE === '1';
const prefix = portable ? 'portable-update-smoke' : 'update-smoke';
const output = path.resolve(process.env.HDT_RELEASE_DIR ?? path.join(root, 'apps/desktop/release'));
const resources = path.join(output, 'win-unpacked/resources');
const archive = path.join(resources, 'app.asar');
const sandbox = path.join(scratch, `update-smoke-profile-${Date.now()}`);
fs.mkdirSync(sandbox, { recursive: true });
process.env.LOCALAPPDATA = path.join(sandbox, 'cache');
protocol.registerSchemesAsPrivileged([
  { scheme: 'hdt-card-image', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
protocol.registerSchemesAsPrivileged = () => {};
if (!portable) fs.writeFileSync(path.join(sandbox, 'Uninstall OpenDeckTracker.exe'), 'test marker only');
else fs.writeFileSync(path.join(sandbox, 'OpenDeckTracker.exe'), 'test placeholder');
app.setPath('userData', sandbox);
app.setPath('sessionData', path.join(sandbox, 'session'));
app.setName('OpenDeckTracker Update Smoke');
app.setAppPath(archive);
Object.defineProperty(app, 'isPackaged', { value: true });
Object.defineProperty(process, 'resourcesPath', { value: resources });
app.getVersion = () => '0.0.0';
const originalGetPath = app.getPath.bind(app);
app.getPath = (name) =>
  name === 'exe' ? path.join(sandbox, 'OpenDeckTracker.exe') : originalGetPath(name);
BrowserWindow.prototype.show = function () {};
BrowserWindow.prototype.showInactive = function () {};
const results = { source: 'packaged app.asar', isolatedProfile: sandbox, installerExecuted: false };
let corruptFirstInstaller = true;
const server = http.createServer((request, response) => {
  const name = path.basename(new URL(request.url, 'http://localhost').pathname);
  const file = path.join(output, name);
  if (
    ![
      'latest.yml',
      `OpenDeckTracker-Setup-${version}.exe`,
      `OpenDeckTracker-Setup-${version}.exe.blockmap`,
      `OpenDeckTracker-${version}-win.zip`,
    ].includes(name)
  ) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader('Content-Length', fs.statSync(file).size);
  if (name.endsWith(portable ? '.zip' : '.exe') && corruptFirstInstaller) {
    corruptFirstInstaller = false;
    let first = true;
    fs.createReadStream(file)
      .pipe(
        new Transform({
          transform(chunk, _encoding, done) {
            if (first) {
              chunk[0] ^= 1;
              first = false;
            }
            done(null, chunk);
          },
        }),
      )
      .pipe(response);
  } else fs.createReadStream(file).pipe(response);
});
const timer = setTimeout(() => finish(new Error('Smoke test timed out')), 90000);
function finish(error) {
  clearTimeout(timer);
  if (error) {
    results.error = error.stack || String(error);
    console.error(error);
  }
  fs.writeFileSync(
    path.join(scratch, `${prefix}-result.json`),
    JSON.stringify(results, null, 2),
  );
  server.close();
  app.exit(error ? 1 : 0);
}
async function until(work, predicate) {
  for (let i = 0; i < 100; i++) {
    const value = await work();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Expected smoke state was not reached');
}
server.listen(0, '127.0.0.1', async () => {
  try {
    const library = require(path.join(archive, 'node_modules/electron-updater'));
    let updater;
    const interceptInstall = (silent, restart) => {
      results.installRequest = { silent, restart };
    };
    const configure = (instance) => {
      updater = instance;
      updater.setFeedURL({ provider: 'generic', url: `http://127.0.0.1:${server.address().port}` });
      updater.disableDifferentialDownload = true;
      updater.quitAndInstall = interceptInstall;
    };
    if (portable) {
      const check = library.AppUpdater.prototype.checkForUpdates;
      library.AppUpdater.prototype.checkForUpdates = function (...args) {
        configure(this);
        return check.apply(this, args);
      };
    } else configure(library.autoUpdater);
    await import(pathToFileURL(path.join(archive, 'out/main/index.js')).href);
    const window = await until(
      async () =>
        BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes('renderer/index.html'),
        ),
      Boolean,
    );
    await until(
      () => window.webContents.executeJavaScript('Boolean(window.hdt?.updates)'),
      Boolean,
    );
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    results.detected = await until(
      () => evaluate('window.hdt.updates.getStatus()'),
      (s) => s.state === 'update-available' || s.state === 'error',
    );
    assert.equal(results.detected.state, 'update-available');
    assert.equal(results.detected.version, version);
    assert.equal(updater.autoDownload, false);
    assert.equal(updater.autoInstallOnAppQuit, false);
    await evaluate("localStorage.setItem('update-smoke-sentinel', 'preserved')");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await window.webContents
      .capturePage()
      .then((png) =>
        fs.writeFileSync(path.join(scratch, `${prefix}-available.png`), png.toPNG()),
      );
    results.rejectedCorruptDownload = await evaluate('window.hdt.updates.download()');
    assert.equal(results.rejectedCorruptDownload.state, 'error');
    assert.equal(results.rejectedCorruptDownload.retry, 'download');
    await evaluate('window.hdt.updates.install()');
    assert.equal(results.installRequest, undefined);
    results.downloaded = await evaluate('window.hdt.updates.download()');
    assert.equal(results.downloaded.state, 'downloaded');
    assert.equal(results.installRequest, undefined);
    assert.equal(await evaluate("localStorage.getItem('update-smoke-sentinel')"), 'preserved');
    await until(
      () =>
        evaluate(
          "document.body.innerText.includes('重启并安装') || document.body.innerText.includes('Restart and install')",
        ),
      Boolean,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await window.webContents
      .capturePage()
      .then((png) =>
        fs.writeFileSync(path.join(scratch, `${prefix}-downloaded.png`), png.toPNG()),
      );
    results.installing = await evaluate('window.hdt.updates.install()');
    assert.deepEqual(results.installRequest, { silent: true, restart: true });
    results.passed = true;
    finish();
  } catch (error) {
    finish(error);
  }
});
