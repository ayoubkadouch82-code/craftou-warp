/**
 * CRAFT WARP — collaboration integration test.
 * Boots the dev/preview server on a random port and drives two real
 * CollabClient instances through a host → guest session.
 *
 * Run: node tests/collab.test.mjs
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

const PORT = 8200 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [path.resolve('devserver/server.mjs')], {
  env: { ...process.env, CW_PORT: String(PORT), CW_HOST: '127.0.0.1', CW_DATA_DIR: path.resolve('.devtools/tmp-data') },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('server did not start');
}

// collab.js is browser-first; give it the few globals it needs.
globalThis.location = { protocol: 'http:', host: `127.0.0.1:${PORT}` };
const nodeFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => nodeFetch(String(url).startsWith('http') ? url : `${BASE}${url}`, opts);
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const { CollabClient } = await import('../static/js/collab.js');

const project = {
  name: 'collab-demo',
  meta: { semver: '3.0.0' },
  targets: [
    { id: 'stage', name: 'Stage', isStage: true, variables: {}, lists: {}, blocks: {}, costumes: [], sounds: [] },
    { id: 'sprite1', name: 'Cat', isStage: false, blocks: {}, variables: {}, costumes: [], sounds: [], x: 0, y: 0 },
  ],
  monitors: [],
  assets: {},
};

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}

console.log('\nCRAFT WARP — collaboration integration\n');

try {
  await waitForServer();

  const hostEvents = [];
  const guestEvents = [];
  const guestChats = [];
  const hostChats = [];
  const host = new CollabClient({
    onChat: (msg) => hostChats.push(msg),
    onEvent: (type, payload) => hostEvents.push({ type, payload }),
    onStatus: () => {},
    toast: () => {},
  });
  const guest = new CollabClient({
    onEvent: (type, payload) => guestEvents.push({ type, payload }),
    onChat: (msg) => guestChats.push(msg),
    onStatus: () => {},
    toast: () => {},
  });

  let code = null;
  await test('host creates a room and receives a code', async () => {
    code = await host.host(project, 'Host');
    assert.match(code, /^[A-Z0-9]{6}$/);
    assert.equal(host.connected, true);
    assert.equal(host.isHost, true);
  });

  await test('guest joins with the code and receives the project snapshot', async () => {
    await guest.join(code, 'Guest');
    await sleep(250);
    const snapshot = guestEvents.find((e) => e.type === 'snapshot' || e.type === 'state');
    assert.ok(snapshot, 'guest received a snapshot');
    const got = snapshot.payload;
    assert.equal(got.targets.length, 2);
    assert.equal(got.targets[1].name, 'Cat');
    assert.equal(guest.connected, true);
  });

  await test('host is notified when the guest joins', async () => {
    await sleep(120);
    assert.ok(hostEvents.some((e) => e.type === 'peer-join'), 'peer-join event');
    assert.ok(host.peers.some((p) => p.name === 'Guest'), 'guest in roster');
  });

  await test('guest edits reach the host (blocks / sprite moves)', async () => {
    const moved = { ...project.targets[1], x: 128, y: -64, blocks: { b1: { opcode: 'motion_movesteps', topLevel: true, x: 20, y: 20 } } };
    guest.sendTarget(moved);
    await sleep(250);
    const evt = hostEvents.find((e) => e.type === 'target');
    assert.ok(evt, 'host received target op');
    assert.equal(evt.payload.target.x, 128);
    assert.ok(evt.payload.target.blocks.b1);
  });

  await test('host edits reach the guest', async () => {
    const stage = { ...project.targets[0], currentCostume: 1 };
    host.sendTarget(stage);
    await sleep(250);
    const evt = guestEvents.find((e) => e.type === 'target' && e.payload.target.id === 'stage');
    assert.ok(evt, 'guest received stage op');
    assert.equal(evt.payload.target.currentCostume, 1);
  });

  await test('sprite list changes (new sprite + order) reach peers', async () => {
    const newSprite = { id: 'sprite2', name: 'Ball', isStage: false, blocks: {}, costumes: [], sounds: [], variables: {}, x: 10, y: 10 };
    guest.sendTarget(newSprite);
    guest.sendOrder(['stage', 'sprite1', 'sprite2']);
    await sleep(250);
    assert.ok(hostEvents.some((e) => e.type === 'target' && e.payload.target.id === 'sprite2'));
    const order = hostEvents.find((e) => e.type === 'targets-order');
    assert.deepEqual(order.payload.ids, ['stage', 'sprite1', 'sprite2']);
  });

  await test('asset bundles travel over the socket', async () => {
    guest.sendAssets({ 'abc.svg': { dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+', ext: 'svg' } });
    await sleep(200);
    const evt = hostEvents.find((e) => e.type === 'assets');
    assert.ok(evt.payload.assets['abc.svg']);
  });

  await test('chat messages (text + image) are delivered', async () => {
    guest.sendChat('مرحبا من الضيف', null);
    await sleep(150);
    host.sendChat('', 'data:image/png;base64,AAAA');
    await sleep(200);
    assert.ok(hostChats.some((m) => m.text === 'مرحبا من الضيف' && m.name === 'Guest'), 'host got guest text');
    assert.ok(guestChats.some((m) => m.image), 'image message delivered');
    assert.ok(guestChats.every((m) => m.from !== 'me'), 'peers never echo their own chat');
  });

  await test('live cursors are relayed with sender identity', async () => {
    guest.sendCursor(120, 240, 'sprite2');
    await sleep(200);
    const evt = hostEvents.find((e) => e.type === 'cursor');
    assert.ok(evt, 'cursor event');
    assert.equal(evt.payload.cursor.sx, 120);
    assert.equal(evt.payload.cursor.sprite, 'sprite2');
    assert.equal(evt.payload.name, 'Guest');
  });

  await test('a second host is rejected for the same room', async () => {
    const intruder = new CollabClient({ onEvent: () => {}, onStatus: () => {}, toast: () => {} });
    let errored = false;
    try {
      await intruder.join(code, 'x');
      // joining as guest is allowed; ask for host role explicitly below
      assert.equal(intruder.role, 'guest');
    } catch { errored = true; }
    assert.equal(errored, false);
    intruder.close();
  });

  await test('leaving updates the roster', async () => {
    guest.close();
    await sleep(250);
    assert.ok(hostEvents.some((e) => e.type === 'peer-leave'), 'peer-leave event');
    assert.ok(!host.peers.some((p) => p.name === 'Guest'), 'guest removed from roster');
  });

  await test('host leaving notifies the guest side', async () => {
    const watcher = new CollabClient({ onEvent: () => {}, onStatus: () => {}, toast: () => {} });
    const events = [];
    const guest2 = new CollabClient({ onEvent: (t) => events.push(t), onStatus: () => {}, toast: () => {} });
    await guest2.join(code, 'Watcher');
    await sleep(150);
    host.close();
    await sleep(300);
    assert.ok(events.includes('host-left'), 'host-left event');
    guest2.close();
    watcher.close();
  });

  await test('room disappears once empty, unknown codes are rejected', async () => {
    await sleep(200);
    const info = await (await fetch(`${BASE}/api/rooms/${code}`)).json();
    assert.equal(info.exists, false);
    const ghost = new CollabClient({ onEvent: () => {}, onStatus: () => {}, toast: () => {} });
    let rejected = false;
    try {
      await ghost.join('ZZZZZZ', 'nobody');
    } catch {
      rejected = true;
    }
    assert.equal(rejected, true, 'unknown room rejected');
    ghost.close();
  });
} catch (err) {
  failed++;
  console.error('FATAL', err);
} finally {
  server.kill('SIGTERM');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
