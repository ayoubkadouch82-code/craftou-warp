/**
 * CRAFT WARP — headless UI smoke test (jsdom).
 *
 * Boots the real editor with the real index.html, then drives the UI: palette,
 * drag & drop to the workspace, tabs, library, paint dialog, undo/redo, export,
 * collaboration events and chat.
 *
 * jsdom is a dev-only dependency; if it is missing the test skips cleanly.
 * Run: npm run test:ui   (or npm i -D jsdom)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('\njsdom is not installed — skipping UI smoke test (npm i -D jsdom)\n');
  process.exit(0);
}

const html = fs.readFileSync(path.join(ROOT, 'static/index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true });
const { window } = dom;

/* ---------------------------------------------------------------- stubs */
const fakeCtx = {
  font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, filter: '',
  textAlign: 'left', textBaseline: 'top', globalCompositeOperation: 'source-over',
  lineCap: 'butt', lineJoin: 'miter',
  measureText: (t) => ({ width: String(t).length * 6.6 }),
  setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {}, save() {}, restore() {},
  translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
  arc() {}, arcTo() {}, fill() {}, stroke() {}, drawImage() {}, fillText() {}, putImageData() {},
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
};
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgo=';

Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
  value() {
    const l = Number(this.dataset.__x ?? 20);
    const t = Number(this.dataset.__y ?? 20);
    const w = Number(this.dataset.__w ?? 120);
    const h = Number(this.dataset.__h ?? 40);
    return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t };
  },
});

window.URL.createObjectURL = () => 'blob:mock';
window.URL.revokeObjectURL = () => {};

globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.Image = window.Image;
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.FileReader = window.FileReader;
globalThis.Blob = window.Blob;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.fetch = async (url) => {
  if (String(url).includes('/api/config')) {
    return { ok: true, json: async () => ({ runtime: 'rust', version: '0.1.0', releaseUrl: 'https://example.test/releases' }) };
  }
  return { ok: true, json: async () => ({ projects: [] }) };
};

const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));
process.on('uncaughtException', (e) => errors.push(e));
process.on('unhandledRejection', (e) => errors.push(e));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
setTimeout(() => {
  console.error('\nUI smoke test timed out (possible hang)');
  process.exit(1);
}, 30000).unref();
function check(name, condition, extra = '') {
  if (condition) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name} ${extra}`); }
}
const q = (sel) => window.document.querySelector(sel);
const qa = (sel) => [...window.document.querySelectorAll(sel)];
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const pointer = (target, type, x, y) => {
  const ev = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  target.dispatchEvent(ev);
};

/* ---------------------------------------------------------------- boot */
await import('../static/js/main.js');
await sleep(250);

console.log('\nCRAFT WARP — UI smoke test (jsdom)\n');
const editor = window.craftwarp;
check('editor boots', !!editor, String(errors[0] || ''));
if (!editor) {
  console.error(errors.slice(0, 3));
  process.exit(1);
}

check('stage + cat project', editor.project.targets.length === 2);
check('palette rendered', qa('#palette-scroll .palette-block').length >= 15);
check('block svgs contain paths', qa('#palette-scroll svg path').length > 20);
check('category rail', qa('#category-rail .cat-btn').length === 9);
check('sprite tiles', qa('#sprite-grid .sprite-tile').length === 2);
check('workspace renders scripts', qa('#layer-blocks .block-group').length >= 4);

/* ------------------------------------------------------------ categories */
click(qa('#category-rail .cat-btn')[4]);
check('switch to control category', qa('#palette-scroll .palette-block').length > 8);
click(qa('#category-rail .cat-btn')[7]);
check('variables palette has creators', qa('#palette-scroll .palette-btn').length >= 2);
click(qa('#category-rail .cat-btn')[0]);

/* ------------------------------------------------------------------ tabs */
click(qa('.tab')[1]);
check('costumes tab', qa('[data-pane="costumes"] .asset-card').length >= 2);
click(qa('.tab')[2]);
check('sounds tab', !!q('[data-pane="sounds"]'));
click(qa('.tab')[3]);
check('team tab', !!q('#team-list'));
click(qa('.tab')[0]);

/* -------------------------------------------------------- drag & drop */
const before = Object.keys(editor.target.blocks).length;
const paletteBlock = q('#palette-scroll .palette-block');
pointer(paletteBlock, 'pointerdown', 100, 100);
pointer(window, 'pointermove', 420, 260);
pointer(window, 'pointerup', 420, 260);
await sleep(60);
check('palette drag adds a block', Object.keys(editor.target.blocks).length === before + 1);

/* ------------------------------------------------------------ green flag */
editor.greenFlag();
await sleep(250);
check('green flag runs without errors', errors.length === 0, String(errors[0] || ''));
editor.vm.stopAll();

/* --------------------------------------------------------------- sprites */
const { SPRITE_LIBRARY } = await import('../static/js/library.js');
const spritesBefore = editor.project.targets.length;
editor.addSpriteFromLibrary(SPRITE_LIBRARY.find((entry) => entry.id === 'ball'));
await sleep(30);
check('add sprite from library', editor.project.targets.length === spritesBefore + 1);
check('sprite tiles update', qa('#sprite-grid .sprite-tile').length === spritesBefore + 1);

editor.undo();
await sleep(30);
check('undo removes the sprite', editor.project.targets.length === spritesBefore);
editor.redo();
await sleep(30);
check('redo restores the sprite', editor.project.targets.length === spritesBefore + 1);

/* ---------------------------------------------------------------- modal */
const { openLibrary, openPaint } = await import('../static/js/library-ui.js');
const lib = openLibrary(editor, 'sprite');
check('library modal lists sprites', qa('.lib-item').length >= 12);
click(qa('.lib-item')[0]);
await sleep(30);
check('library click adds a sprite', editor.project.targets.length === spritesBefore + 2);
lib.close();

const paintModal = openPaint(editor, { asBackdrop: false });
check('paint modal opens with canvas', !!q('#paint-canvas'));
paintModal.close();

/* --------------------------------------------------------------- export */
const { exportSb3 } = await import('../static/js/sb3.js');
const bytes = await exportSb3(editor.project, { compress: false });
check('export produces a zip', bytes.length > 1000 && bytes[0] === 0x50);

/* ------------------------------------------------------ collaboration UI */
editor.collab.connected = true;
editor.collab.id = 'me';
editor.collab.role = 'host';
editor.collab.code = 'ABC123';
editor.collab.name = 'Host';
editor.peers.set('me', { id: 'me', name: 'Host', color: '#4c66ff', role: 'host' });
editor.peers.set('p2', { id: 'p2', name: 'Sara', color: '#ff661a', role: 'guest', cursor: { sx: 120, sy: 80 } });
editor.onPresence([...editor.peers.values()], {});
check('presence avatars', qa('#presence .avatar').length === 2);

editor.onCollabEvent('target', { target: { ...editor.project.targets[1], id: 'remote1', name: 'Remote', blocks: {} } });
await sleep(30);
check('remote target adds a sprite', !!editor.project.targets.find((t) => t.id === 'remote1'));

editor.onCollabEvent('cursor', { from: 'p2', cursor: { sx: 44, sy: 66, sprite: 'remote1' } });
await sleep(30);
check('remote cursor renders', qa('#cursor-layer .remote-cursor').length === 1);
check('peer sprite badge shows', qa('#sprite-grid .peer-tag').length >= 1);

editor.receiveChat({ from: 'p2', name: 'Sara', color: '#ff661a', text: 'مرحبا', at: Date.now() });
editor.toggleChat(true);
await sleep(20);
check('chat message rendered', qa('#chat-list .chat-msg').length === 1);
check('chat unread badge cleared on open', q('#chat-badge').hidden === true);
editor.toggleChat(false);

const sent = [];
const realSend = editor.collab.send.bind(editor.collab);
editor.collab.send = (msg) => { sent.push(msg); return true; };
editor.markDirty('test');
editor.flushCollabSync();
editor.collab.send = realSend;
check('local edits produce collab ops', sent.some((m) => m.t === 'target') && sent.some((m) => m.t === 'meta'));

/* ------------------------------------------------------------- language */
click(q('#btn-lang'));
check('language toggles to English', window.document.documentElement.lang === 'en');
check('palette rebuilt in English UI', qa('#palette-scroll .palette-block').length > 5);
click(q('#btn-lang'));
check('language toggles back to Arabic', window.document.documentElement.lang === 'ar');

/* ---------------------------------------------------------------- final */
check('no runtime errors during the run', errors.length === 0, String(errors[0] || ''));

console.log(failures ? `\n${failures} failure(s)\n` : '\nall UI smoke checks passed\n');
if (errors.length) console.error(errors.slice(0, 5));
process.exit(failures ? 1 : 0);
