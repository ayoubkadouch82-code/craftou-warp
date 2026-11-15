/**
 * CRAFT WARP — core unit tests (Node, no dependencies).
 * Run:  node tests/core.test.mjs
 *
 * Covers the parts that must be exactly right: asset hashing, zip round trips,
 * project model, the VM and .sb3 import/export.
 */
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

/* ---- minimal browser stubs (the modules are browser-first) ---- */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          font: '',
          measureText: (text) => ({ width: String(text).length * 6.6 }),
          beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, closePath() {},
          fill() {}, stroke() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
          drawImage() {}, clearRect() {}, fillRect() {}, fillText() {}, measureText2: null,
        };
      },
      toDataURL: () => 'data:image/png;base64,AAAA',
      appendChild() {},
      setAttribute() {},
    };
  },
  body: { appendChild() {}, removeChild() {} },
};
globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };

const { md5, writeZip, readZip, dataUrlToBytes, bytesToDataUrl } = await import('../static/js/zip.js');
const projectModel = await import('../static/js/project.js');
const { VM } = await import('../static/js/vm.js');
const { createEmptyProject, addBlock, setInput, ensureProjectShape } = projectModel;
const { exportSb3, importSb3 } = await import('../static/js/sb3.js');
const { paintStandaloneBlock } = await import('../static/js/blockview.js');
const { BLOCKS } = await import('../static/js/blocks.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch((err) => { failed++; console.error(`  ✗ ${name}\n    ${err.message}`); });
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
  return Promise.resolve();
}

console.log('\nCRAFT WARP — core tests\n');

/* ------------------------------------------------------------------ md5 */
await test('md5 matches node:crypto for random payloads', () => {
  for (let i = 1; i < 300; i += 7) {
    const bytes = crypto.randomBytes(i);
    const expected = crypto.createHash('md5').update(bytes).digest('hex');
    assert.equal(md5(new Uint8Array(bytes)), expected, `length ${i}`);
  }
});

await test('md5 of empty buffer', () => {
  assert.equal(md5(new Uint8Array(0)), 'd41d8cd98f00b204e9800998ecf8427e');
});

/* ------------------------------------------------------------------ zip */
await test('zip write/read round trip (stored)', async () => {
  const entries = [
    { name: 'project.json', data: new TextEncoder().encode('{"hello":"world"}') },
    { name: 'asset.svg', data: new TextEncoder().encode('<svg></svg>') },
  ];
  const zip = await writeZip(entries);
  const files = await readZip(zip.buffer);
  assert.equal(new TextDecoder().decode(files.get('project.json')), '{"hello":"world"}');
  assert.equal(new TextDecoder().decode(files.get('asset.svg')), '<svg></svg>');
});

await test('zip write/read round trip (deflate)', async () => {
  const payload = new TextEncoder().encode('abc'.repeat(4000));
  const zip = await writeZip([{ name: 'big.txt', data: payload }], { compress: true });
  const files = await readZip(zip.buffer);
  assert.equal(new TextDecoder().decode(files.get('big.txt')), 'abc'.repeat(4000));
});

await test('data url <-> bytes', () => {
  const bytes = new Uint8Array([1, 2, 3, 250]);
  const url = bytesToDataUrl(bytes, 'image/png');
  assert.deepEqual([...dataUrlToBytes(url)], [1, 2, 3, 250]);
});

/* -------------------------------------------------------------- project */
let project;
await test('createEmptyProject builds a stage + cat', () => {
  project = createEmptyProject();
  assert.equal(project.targets.length, 2);
  assert.equal(project.targets[0].isStage, true);
  assert.ok(project.targets[0].costumes.length >= 1);
  assert.ok(project.targets[1].costumes.length >= 1);
  assert.ok(Object.keys(project.assets).length >= 3);
  assert.ok(Object.keys(project.targets[1].blocks).length >= 4);
});

await test('variables are stored on the stage', () => {
  const stage = project.targets[0];
  const vars = Object.values(stage.variables);
  assert.equal(vars.length, 1);
  assert.equal(vars[0][0], 'اسمي');
});

/* -------------------------------------------------------------------- VM */
await test('green flag runs a script and evaluates blocks', async () => {
  const vm = new VM(project, {});
  const cat = project.targets[1];
  vm.greenFlag();
  for (let i = 0; i < 30; i++) vm.step(1 / 30);
  assert.ok(cat.say && cat.say.text.includes('CRAFT WARP'), 'say bubble was set');
});

await test('repeat + variable + operators evaluate correctly', async () => {
  const p = createEmptyProject();
  const stage = p.targets[0];
  const sprite = p.targets[1];
  sprite.blocks = {};
  const varId = 'score';
  stage.variables[varId] = ['score', 0];

  const hat = addBlock(p, sprite, 'event_whenflagclicked', { x: 0, y: 0 });
  const repeat = addBlock(p, sprite, 'control_repeat', { parent: hat.id, nextOf: hat.id });
  setInput(repeat, 'TIMES', 4, '5');
  const change = addBlock(p, sprite, 'data_changevariableby', { parent: repeat.id, nextOf: '' });
  change.fields.VARIABLE = [varId, 'score'];
  setInput(change, 'VALUE', 4, '2');
  repeat.inputs.SUBSTACK = [2, change.id];
  change.parent = repeat.id;
  repeat.next = null;

  const vm = new VM(p, {});
  vm.greenFlag();
  for (let i = 0; i < 400; i++) vm.step(1 / 60);
  assert.equal(stage.variables[varId][1], 10);
});

await test('say for secs waits, then clears', async () => {
  const p = createEmptyProject();
  const sprite = p.targets[1];
  sprite.blocks = {};
  const hat = addBlock(p, sprite, 'event_whenflagclicked', { x: 0, y: 0 });
  const say = addBlock(p, sprite, 'looks_sayforsecs', { parent: hat.id, nextOf: hat.id });
  setInput(say, 'MESSAGE', 10, 'hi');
  setInput(say, 'SECS', 4, '1');
  const vm = new VM(p, {});
  vm.greenFlag();
  vm.step(0.1);
  assert.equal(sprite.say.text, 'hi');
  for (let i = 0; i < 100; i++) vm.step(1 / 60);
  assert.equal(sprite.say, null);
});

await test('broadcast starts receiver scripts (event based)', () => {
  const p = createEmptyProject();
  const stage = p.targets[0];
  const sprite = p.targets[1];
  sprite.blocks = {};
  stage.broadcasts.msg1 = 'go';
  const recv = addBlock(p, sprite, 'event_whenbroadcastreceived', { x: 0, y: 0 });
  recv.fields.BROADCAST_OPTION = ['go', 'msg1'];
  const move = addBlock(p, sprite, 'motion_changexby', { parent: recv.id, nextOf: recv.id });
  setInput(move, 'DX', 4, '25');
  const vm = new VM(p, {});
  vm.running = true;
  const started = vm.broadcast('go');
  assert.equal(started.length, 1);
  for (let i = 0; i < 10; i++) vm.step(1 / 60);
  assert.equal(sprite.x, 25);
});

await test('clones spawn and delete', () => {
  const p = createEmptyProject();
  const sprite = p.targets[1];
  sprite.blocks = {};
  const vm = new VM(p, {});
  const clone = vm.createClone(sprite);
  assert.ok(clone && clone.isClone);
  assert.equal(vm.clones.length, 1);
  vm.deleteClone(clone);
  assert.equal(vm.clones.length, 0);
});

/* -------------------------------------------------------------- painter */
await test('every block opcode paints without NaN', () => {
  const p = createEmptyProject();
  const sprite = p.targets[1];
  let painted = 0;
  for (const def of Object.values(BLOCKS)) {
    const block = {
      opcode: def.opcode,
      inputs: {},
      fields: {},
      next: null,
      parent: null,
      topLevel: true,
      x: 0,
      y: 0,
    };
    for (const part of def.parts || []) {
      if (!part || typeof part === 'string') continue;
      if (part.f) block.fields[part.f] = [part.v ?? part.opts?.[0] ?? 'x'];
      if (part.i && part.k === 'menu') block.fields[part.i] = [part.v ?? ''];
      if (part.i && part.k === 'number') block.inputs[part.i] = [1, [4, '10']];
      if (part.i && part.k === 'text') block.inputs[part.i] = [1, [10, 'hi']];
    }
    const res = paintStandaloneBlock(p, sprite, block, 0, 0);
    assert.ok(res.svg.includes('<path'), `${def.opcode} produced no path`);
    assert.ok(!res.svg.includes('NaN'), `${def.opcode} produced NaN geometry`);
    assert.ok(res.height > 0 && res.width > 0, `${def.opcode} has no size`);
    painted++;
  }
  assert.ok(painted > 60, `painted only ${painted} blocks`);
});

await test('C-blocks grow with substacks', () => {
  const p = createEmptyProject();
  const sprite = p.targets[1];
  sprite.blocks = {};
  const repeat = addBlock(p, sprite, 'control_repeat', { x: 0, y: 0 });
  const body = addBlock(p, sprite, 'motion_movesteps', { parent: repeat.id });
  repeat.inputs.SUBSTACK = [2, body.id];
  body.parent = repeat.id;
  const empty = paintStandaloneBlock(p, sprite, { ...repeat, inputs: {} }, 0, 0);
  const filled = paintStandaloneBlock(p, sprite, repeat, 0, 0);
  assert.ok(filled.height > empty.height, 'substack adds height');
});

/* ----------------------------------------------------------------- sb3 */
await test('sb3 export -> import keeps targets, blocks, costumes and assets', async () => {
  const original = createEmptyProject();
  const bytes = await exportSb3(original);
  assert.ok(bytes.length > 1000);
  const round = await importSb3(bytes.buffer, { name: 'roundtrip' });
  assert.equal(round.targets.length, original.targets.length);
  assert.equal(round.targets[1].name, original.targets[1].name);
  assert.ok(round.targets[1].costumes.length >= 1);
  assert.ok(Object.keys(round.assets).length >= 3);
  const opcodesBefore = Object.values(original.targets[1].blocks).map((b) => b.opcode).sort();
  const opcodesAfter = Object.values(round.targets[1].blocks).map((b) => b.opcode).sort();
  assert.deepEqual(opcodesAfter, opcodesBefore);
});

await test('sb3 menus survive a round trip (go to / switch costume)', async () => {
  const p = createEmptyProject();
  const sprite = p.targets[1];
  sprite.blocks = {};
  const goTo = addBlock(p, sprite, 'motion_goto', { x: 0, y: 0 });
  goTo.fields.TO = ['_mouse_'];
  const costume = addBlock(p, sprite, 'looks_switchcostumeto', { x: 0, y: 100 });
  costume.fields.COSTUME = [sprite.costumes[0].name];

  const bytes = await exportSb3(p);
  const round = await importSb3(bytes.buffer);
  const blocks = Object.values(round.targets[1].blocks);
  const goto = blocks.find((b) => b.opcode === 'motion_goto');
  const sw = blocks.find((b) => b.opcode === 'looks_switchcostumeto');
  assert.ok(goto, 'go to block survives');
  assert.equal(goto.fields.TO[0], '_mouse_');
  assert.ok(sw, 'switch costume survives');
  assert.equal(sw.fields.COSTUME[0], sprite.costumes[0].name);
});

await test('ensureProjectShape repairs a broken project', () => {
  const broken = { targets: [{ name: 'Sprite1', isStage: false }], assets: {} };
  const fixed = ensureProjectShape(broken);
  assert.ok(fixed.targets[0].isStage, 'stage inserted first');
  assert.ok(fixed.targets[0].costumes.length >= 1, 'default backdrop added');
  assert.ok(fixed.targets[1].blocks, 'blocks map created');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
