'use strict';

// Help → Update Automatically, with electron-updater replaced by a stand-in:
// on, a found update downloads by itself; off, NEO asks first, and
// update:download fetches it when the writer says yes. main.js is loaded the
// way scripts/filesystem.test.js loads it, with its own settings folder.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const localRequire = createRequire(path.join(root, 'main.js'));
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

// an updater that always finds 9.0.0, downloading it when told to
function fakeUpdater() {
  const u = new EventEmitter();
  u.downloads = 0;
  u.download = () => {
    u.downloads++;
    u.emit('download-progress', { percent: 50, transferred: 1, total: 2 });
    u.emit('update-downloaded', { version: '9.0.0' });
  };
  u.checkForUpdates = async () => {
    u.emit('update-available', { version: '9.0.0' });
    if (u.autoDownload) u.download();
    return { updateInfo: { version: '9.0.0' } };
  };
  u.downloadUpdate = async () => { u.download(); return []; };
  u.quitAndInstall = () => {};
  return u;
}

function loadMain(settings) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-upd-'));
  if (settings) fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(settings));
  const handlers = new Map();
  const updater = fakeUpdater();
  const electron = {
    app: {
      isPackaged: true,
      getVersion: () => '1.3.9',
      commandLine: { appendSwitch() {} },
      getPath: () => userData,
      getLocale: () => 'en',
      requestSingleInstanceLock: () => true,
      whenReady: () => ({ then() {} }),
      on() {}
    },
    ipcMain: { on() {}, handle: (name, fn) => handlers.set(name, fn) },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
    Menu: { buildFromTemplate: (items) => items, setApplicationMenu() {} },
    dialog: {},
    utilityProcess: { fork: () => ({ on() {}, postMessage() {} }) },
    screen: {}
  };
  const context = vm.createContext({
    require: (name) => name === 'electron' ? electron : name === 'electron-updater' ? { autoUpdater: updater } : localRequire(name),
    __dirname: root,
    process: { platform: process.platform, on() {} },
    console
  });
  vm.runInContext(source, context, { filename: path.join(root, 'main.js') });
  return {
    updater,
    userData,
    call: (name, ...args) => handlers.get(name)(null, ...args),
    done: () => fs.rmSync(userData, { recursive: true, force: true })
  };
}

test('updates on (the default): a newer version found is fetched without asking', async () => {
  const m = loadMain(null);
  try {
    const res = await m.call('update:check');
    assert.equal(res.hasUpdate, true);
    assert.equal(res.canInstall, true);
    assert.equal(m.updater.downloads, 1);
    assert.equal(res.ready, true);
    assert.equal(m.updater.autoInstallOnAppQuit, true);
  } finally { m.done(); }
});

test('updates off: NEO says what it found and waits for a yes', async () => {
  const m = loadMain({ autoUpdate: false });
  try {
    const res = await m.call('update:check');
    assert.equal(res.hasUpdate, true);
    assert.equal(res.state, 'available');
    assert.equal(res.ready, false);
    assert.equal(m.updater.downloads, 0, 'nothing fetched before the writer says so');
    assert.equal(m.updater.autoInstallOnAppQuit, false, 'nothing goes in at quit on its own');
    // the writer says yes
    assert.equal(await m.call('update:download'), true);
    await new Promise((r) => setImmediate(r));
    assert.equal(m.updater.downloads, 1);
    const after = await m.call('update:check');
    assert.equal(after.ready, true);
    // and once it's here, asking again does nothing more
    assert.equal(await m.call('update:download'), false);
  } finally { m.done(); }
});

test('updates off: a download no one asked for can\'t be started', async () => {
  const m = loadMain({ autoUpdate: false });
  try {
    assert.equal(await m.call('update:download'), false, 'nothing found yet');
    assert.equal(m.updater.downloads, 0);
  } finally { m.done(); }
});
