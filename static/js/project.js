/**
 * CRAFT WARP — project model.
 *
 * Shape (superset of Scratch 3, assets stored by reference so collaboration
 * deltas stay small):
 * {
 *   name, meta, targets: [stage, ...sprites], monitors: [], assets: {key: {dataUrl, ext}},
 *   extensions: []
 * }
 */
import { md5, dataUrlToBytes, EXT_BY_MIME, uid } from './zip.js';
import { SPRITE_LIBRARY, BACKDROP_LIBRARY, DEFAULT_STAGE_BACKDROP, defaultCatCostume, defaultCatCostume2 } from './library.js';
import { synthesizeSound } from './audio.js';
import { defaultBlockData, getDef } from './blocks.js';

export const LAYER_STEP = 1;
export { uid };


export function newStage() {
  return {
    id: 'stage',
    name: 'Stage',
    isStage: true,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [],
    sounds: [],
    volume: 100,
    layerOrder: 0,
    tempo: 60,
    videoTransparency: 50,
    videoState: 'off',
    textToSpeechLanguage: null,
  };
}

export function addAsset(project, dataUrl, ext) {
  project.assets = project.assets || {};
  const bytes = dataUrlToBytes(dataUrl);
  const hash = md5(bytes);
  const key = `${hash}.${ext}`;
  if (!project.assets[key]) project.assets[key] = { dataUrl, ext, size: bytes.length };
  return { key, hash, ext, dataUrl };
}

export function costumeFromLibrary(project, costume) {
  const asset = addAsset(project, costume.dataUrl, costume.ext || 'svg');
  return {
    name: costume.name,
    assetId: asset.hash,
    md5ext: asset.key,
    dataFormat: costume.ext || 'svg',
    rotationCenterX: costume.rotationCenterX ?? costume.width / 2,
    rotationCenterY: costume.rotationCenterY ?? costume.height / 2,
    bitmapResolution: costume.bitmapResolution || 1,
    width: costume.width,
    height: costume.height,
  };
}

export function soundFromLibrary(project, entry) {
  const synth = synthesizeSound(entry.synth || 'pop');
  const asset = addAsset(project, synth.dataUrl, 'wav');
  return {
    name: entry.name,
    assetId: asset.hash,
    md5ext: asset.key,
    dataFormat: 'wav',
    rate: synth.rate,
    sampleCount: synth.sampleCount,
  };
}

export function makeSprite(name = 'Sprite1') {
  return {
    id: uid('sprite'),
    name,
    isStage: false,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [],
    sounds: [],
    volume: 100,
    layerOrder: 1,
    visible: true,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
    effects: {},
    dragMode: 'draggable',
    say: null,
  };
}

export function uniqueName(project, base) {
  const names = new Set(project.targets.map((t) => t.name));
  if (!names.has(base)) return base;
  let i = 1;
  while (names.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

export function spriteFromLibrary(project, entry, opts = {}) {
  const sprite = makeSprite(uniqueName(project, entry.name));
  sprite.costumes = entry.costumes.map((c) => costumeFromLibrary(project, c));
  const maxLayer = Math.max(0, ...project.targets.map((t) => t.layerOrder || 0));
  sprite.layerOrder = maxLayer + LAYER_STEP;
  sprite.x = opts.x ?? 0;
  sprite.y = opts.y ?? 0;
  project.targets.push(sprite);
  return sprite;
}

export function backdropFromLibrary(project, entry) {
  const stage = project.targets[0];
  const costume = costumeFromLibrary(project, entry);
  stage.costumes.push(costume);
  return costume;
}

export function newBackdropFromDataUrl(project, dataUrl, name = 'backdrop') {
  const ext = dataUrl.startsWith('data:image/svg') ? 'svg' : 'png';
  const asset = addAsset(project, dataUrl, ext);
  const stage = project.targets[0];
  const costume = {
    name: uniqueCostumeName(stage, name.replace(/\.[^.]+$/, '')),
    assetId: asset.hash,
    md5ext: asset.key,
    dataFormat: ext,
    rotationCenterX: 240,
    rotationCenterY: 180,
    bitmapResolution: 1,
    width: 480,
    height: 360,
  };
  stage.costumes.push(costume);
  return costume;
}

export function uniqueCostumeName(target, base) {
  const names = new Set((target.costumes || []).map((c) => c.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

export function uniqueSoundName(target, base) {
  const names = new Set((target.sounds || []).map((s) => s.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

export function createEmptyProject() {
  const project = {
    name: 'مشروع بلا عنوان',
    meta: { semver: '3.0.0', vm: '0.2.0', agent: 'CRAFT WARP 0.1.0' },
    targets: [newStage()],
    monitors: [],
    extensions: [],
    assets: {},
  };
  backdropFromLibrary(project, DEFAULT_STAGE_BACKDROP);
  const cat = SPRITE_LIBRARY.find((s) => s.id === 'cat');
  const sprite = spriteFromLibrary(project, cat, { x: 0, y: 0 });
  buildWelcomeScript(project, sprite);
  return project;
}

function buildWelcomeScript(project, sprite) {
  const stage = project.targets[0];
  // variable
  const varId = uid('var');
  stage.variables[varId] = ['اسمي', 'CRAFT WARP'];
  const globalVar = ['VARIABLE', varId, 'اسمي'];

  const hat = addBlock(project, sprite, 'event_whenflagclicked', { x: 40, y: 40 });
  const say = addBlock(project, sprite, 'looks_sayforsecs', { parent: hat.id, nextOf: hat.id });
  setInput(say, 'MESSAGE', 10, 'أنا CRAFT WARP! اسحب اللبنات وابنِ أي شيء 🚀');
  setInput(say, 'SECS', 4, '3');

  const hat2 = addBlock(project, sprite, 'event_whenthisspriteclicked', { x: 40, y: 260 });
  const jump = addBlock(project, sprite, 'motion_changeyby', { parent: hat2.id, nextOf: hat2.id });
  setInput(jump, 'DY', 4, '40');
  const back = addBlock(project, sprite, 'motion_changeyby', { parent: jump.id, nextOf: jump.id });
  setInput(back, 'DY', 4, '-40');

  const hat3 = addBlock(project, sprite, 'event_whenkeypressed', { x: 420, y: 40 });
  hat3.fields.KEY_OPTION = ['space'];
  const turn = addBlock(project, sprite, 'motion_turnright', { parent: hat3.id, nextOf: hat3.id });
  setInput(turn, 'DEGREES', 4, '15');
  void globalVar;
}

/* --------------------------------------------------------------- blocks */
export function addBlock(project, target, opcode, opts = {}) {
  const id = uid('b');
  const data = defaultBlockData(opcode, project, target);
  const block = {
    opcode,
    next: null,
    parent: opts.parent || null,
    inputs: data.inputs,
    fields: data.fields,
    shadow: false,
    topLevel: !opts.parent,
    ...(opts.topLevel || !opts.parent ? { x: Math.round(opts.x ?? 60), y: Math.round(opts.y ?? 60) } : {}),
  };
  target.blocks[id] = block;
  if (opts.parent && opts.nextOf) {
    const parent = target.blocks[opts.parent];
    if (parent) {
      parent.next = id;
      block.parent = opts.parent;
    }
  }
  invalidateProcedures(target);
  return { id, ...block, id_: id };
}

export function addBlockAt(project, target, opcode, x, y) {
  const id = uid('b');
  const data = defaultBlockData(opcode, project, target);
  target.blocks[id] = {
    opcode,
    next: null,
    parent: null,
    inputs: data.inputs,
    fields: data.fields,
    shadow: false,
    topLevel: true,
    x: Math.round(x),
    y: Math.round(y),
  };
  invalidateProcedures(target);
  return id;
}

export function setInput(block, name, type, value) {
  block.inputs = block.inputs || {};
  block.inputs[name] = [1, [type, String(value)]];
}

export function inputValueOf(block, name) {
  const inp = block?.inputs?.[name];
  if (!inp) return '';
  const v = inp[1];
  if (Array.isArray(v)) return v[1];
  return '';
}

export function setField(block, name, value, secondary = null) {
  block.fields = block.fields || {};
  block.fields[name] = secondary === null ? [value] : [value, secondary];
}

export function invalidateProcedures(target) {
  target.__procs = null;
  target.__procsFor = null;
}

/** delete a block and everything connected to it (substacks, next, parents link) */
export function deleteBlockCascade(target, blockId) {
  const blocks = target.blocks;
  const block = blocks[blockId];
  if (!block) return;
  // unlink from parent
  if (block.parent && blocks[block.parent]) {
    const parent = blocks[block.parent];
    if (parent.next === blockId) parent.next = null;
    for (const [name, inp] of Object.entries(parent.inputs || {})) {
      if (inp[1] === blockId) delete parent.inputs[name];
    }
  }
  const stack = [blockId];
  while (stack.length) {
    const id = stack.pop();
    const b = blocks[id];
    if (!b) continue;
    if (b.next) stack.push(b.next);
    for (const inp of Object.values(b.inputs || {})) {
      if (typeof inp[1] === 'string') stack.push(inp[1]);
    }
    delete blocks[id];
  }
  invalidateProcedures(target);
}

/** depth-first ids of a stack starting at a top-level block (for dragging) */
export function stackIds(target, startId) {
  const out = [];
  let id = startId;
  while (id && target.blocks[id]) {
    out.push(id);
    const b = target.blocks[id];
    for (const name of ['SUBSTACK', 'SUBSTACK2']) {
      const inp = b.inputs?.[name];
      if (inp && typeof inp[1] === 'string') out.push(...stackIds(target, inp[1]));
    }
    id = b.next;
  }
  return out;
}

export function topLevelBlocks(target) {
  return Object.entries(target.blocks || {})
    .filter(([, b]) => b.topLevel)
    .sort((a, b) => (a[1].y || 0) - (b[1].y || 0));
}

export function duplicateStack(target, startId, dx = 22, dy = 22) {
  const map = new Map();
  const cloneBlock = (id) => {
    const b = target.blocks[id];
    if (!b) return null;
    const newId = uid('b');
    map.set(id, newId);
    const copy = JSON.parse(JSON.stringify(b));
    copy.parent = null;
    for (const [name, inp] of Object.entries(copy.inputs || {})) {
      if (typeof inp[1] === 'string') {
        copy.inputs[name] = [inp[0], cloneBlock(inp[1])];
      }
    }
    copy.next = b.next ? cloneBlock(b.next) : null;
    target.blocks[newId] = copy;
    return newId;
  };
  const newTop = cloneBlock(startId);
  if (!newTop) return null;
  const original = target.blocks[startId];
  target.blocks[newTop].topLevel = true;
  target.blocks[newTop].x = (original.x || 0) + dx;
  target.blocks[newTop].y = (original.y || 0) + dy;
  // fix parents
  const fixParents = (id, parentId) => {
    const b = target.blocks[id];
    if (!b) return;
    b.parent = parentId;
    for (const name of ['SUBSTACK', 'SUBSTACK2']) {
      const inp = b.inputs?.[name];
      if (inp && typeof inp[1] === 'string') fixParents(inp[1], id);
    }
    if (b.next) fixParents(b.next, id);
  };
  target.blocks[newTop].parent = null;
  for (const name of ['SUBSTACK', 'SUBSTACK2']) {
    const inp = target.blocks[newTop].inputs?.[name];
    if (inp && typeof inp[1] === 'string') fixParents(inp[1], newTop);
  }
  if (target.blocks[newTop].next) fixParents(target.blocks[newTop].next, newTop);
  invalidateProcedures(target);
  return newTop;
}

export function duplicateTarget(project, target) {
  if (target.isStage) return null;
  const copy = JSON.parse(JSON.stringify(target));
  copy.id = uid('sprite');
  copy.name = uniqueName(project, target.name);
  copy.x = (target.x || 0) + 12;
  copy.y = (target.y || 0) - 12;
  copy.layerOrder = Math.max(0, ...project.targets.map((t) => t.layerOrder || 0)) + 1;
  const idMap = new Map();
  for (const id of Object.keys(copy.blocks || {})) idMap.set(id, uid('b'));
  const newBlocks = {};
  for (const [oldId, block] of Object.entries(copy.blocks || {})) {
    const newId = idMap.get(oldId);
    const b = { ...block };
    if (b.next) b.next = idMap.get(b.next) || null;
    if (b.parent) b.parent = idMap.get(b.parent) || null;
    const inputs = {};
    for (const [name, inp] of Object.entries(b.inputs || {})) {
      if (typeof inp[1] === 'string') inputs[name] = [inp[0], idMap.get(inp[1]) || null];
      else inputs[name] = inp;
    }
    b.inputs = inputs;
    newBlocks[newId] = b;
  }
  copy.blocks = newBlocks;
  project.targets.push(copy);
  return copy;
}

export function deleteTarget(project, target) {
  if (target.isStage) return;
  project.targets = project.targets.filter((t) => t !== target);
}

export function moveTargetLayer(project, target, dir) {
  const sprites = project.targets.filter((t) => !t.isStage).sort((a, b) => (a.layerOrder || 0) - (b.layerOrder || 0));
  const idx = sprites.indexOf(target);
  if (idx < 0) return;
  const swap = sprites[idx + dir];
  if (!swap) return;
  const tmp = target.layerOrder || 0;
  target.layerOrder = swap.layerOrder || 0;
  swap.layerOrder = tmp;
}

/* --------------------------------------------------------- variables */
export function createVariable(project, target, name, value = 0) {
  const id = uid('var');
  const owner = target?.isStage ? target : project.targets[0];
  owner.variables = owner.variables || {};
  owner.variables[id] = [name, value];
  return id;
}

export function createList(project, target, name) {
  const id = uid('list');
  const owner = target?.isStage ? target : project.targets[0];
  owner.lists = owner.lists || {};
  owner.lists[id] = [name, []];
  return id;
}

export function createBroadcast(project, name) {
  const stage = project.targets[0];
  stage.broadcasts = stage.broadcasts || {};
  const id = uid('msg');
  stage.broadcasts[id] = name;
  return id;
}

export function allVariables(project, target) {
  const out = [];
  for (const owner of [target, project.targets[0]]) {
    if (!owner?.variables) continue;
    for (const [id, [name, value]] of Object.entries(owner.variables)) {
      if (out.some((v) => v.id === id)) continue;
      out.push({ id, name, value, global: owner.isStage });
    }
  }
  return out;
}

export function allLists(project, target) {
  const out = [];
  for (const owner of [target, project.targets[0]]) {
    if (!owner?.lists) continue;
    for (const [id, [name, value]] of Object.entries(owner.lists)) {
      if (out.some((v) => v.id === id)) continue;
      out.push({ id, name, value, global: owner.isStage });
    }
  }
  return out;
}

export function allBroadcasts(project) {
  return Object.entries(project.targets[0]?.broadcasts || {}).map(([id, name]) => ({ id, name }));
}

/* ----------------------------------------------- custom block creation */
export function createCustomBlock(project, target, signature) {
  const tokens = signature.trim().split(/\s+/).filter(Boolean);
  const args = [];
  let proccode = '';
  for (const token of tokens) {
    if (token === '%n' || token === '%s' || token === '%b') {
      const idx = args.length;
      args.push({
        id: uid('arg'),
        name: `arg${idx + 1}`,
        type: token === '%n' ? 'number' : token === '%s' ? 'string' : 'boolean',
      });
      proccode += ` ${token}`;
    } else {
      proccode += (proccode ? ' ' : '') + token;
    }
  }
  proccode = proccode.trim();
  if (!proccode) return null;

  const argumentIds = JSON.stringify(args.map((a) => a.id));
  const argumentNames = JSON.stringify(args.map((a) => a.name));
  const argumentDefaults = JSON.stringify(args.map((a) => (a.type === 'number' ? '0' : '')));
  const mutation = {
    tagName: 'mutation',
    children: [],
    proccode,
    argumentids: argumentIds,
    argumentnames: argumentNames,
    argumentdefaults: argumentDefaults,
    warp: 'false',
  };

  // prototype + definition
  const protoId = uid('b');
  const defId = uid('b');
  target.blocks[protoId] = {
    opcode: 'procedures_prototype',
    next: null,
    parent: defId,
    inputs: {},
    fields: {},
    shadow: true,
    topLevel: false,
    mutation,
  };
  for (const arg of args) {
    const reporterId = uid('b');
    target.blocks[reporterId] = {
      opcode: arg.type === 'boolean' ? 'argument_reporter_boolean' : 'argument_reporter_string_number',
      next: null,
      parent: protoId,
      inputs: {},
      fields: { VALUE: [arg.name] },
      shadow: false,
      topLevel: false,
    };
    target.blocks[protoId].inputs[arg.id] = [1, reporterId];
    target.blocks[protoId].inputs[arg.id].shadowReporter = true;
  }
  target.blocks[defId] = {
    opcode: 'procedures_definition',
    next: null,
    parent: null,
    inputs: { custom_block: [1, protoId] },
    fields: {},
    shadow: false,
    topLevel: true,
    x: 60,
    y: 60 + Object.keys(target.blocks).length * 2,
  };

  invalidateProcedures(target);
  return { defId, protoId, proccode, args, mutation };
}

export function createCustomBlockCall(project, target, proccode, x, y) {
  const procs = findProcedure(target, proccode);
  const id = uid('b');
  const inputs = {};
  for (const arg of procs?.args || []) {
    inputs[arg.id] = [1, [arg.type === 'boolean' ? 10 : arg.type === 'string' ? 10 : 4, arg.type === 'number' ? '0' : '']];
  }
  target.blocks[id] = {
    opcode: 'procedures_call',
    next: null,
    parent: null,
    inputs,
    fields: {},
    shadow: false,
    topLevel: true,
    x: Math.round(x || 60),
    y: Math.round(y || 60),
    mutation: {
      tagName: 'mutation',
      children: [],
      proccode,
      argumentids: JSON.stringify((procs?.args || []).map((a) => a.id)),
      warp: 'false',
    },
  };
  invalidateProcedures(target);
  return id;
}

export function findProcedure(target, proccode) {
  for (const [id, block] of Object.entries(target.blocks || {})) {
    if (block.opcode !== 'procedures_definition') continue;
    const protoId = block.inputs?.custom_block?.[1];
    const proto = target.blocks[protoId];
    if (!proto) continue;
    if (proto.mutation?.proccode === proccode) {
      let argumentNames = [];
      try { argumentNames = JSON.parse(proto.mutation.argumentnames || '[]'); } catch { argumentNames = []; }
      let argumentIds = [];
      try { argumentIds = JSON.parse(proto.mutation.argumentids || '[]'); } catch { argumentIds = []; }
      return {
        defId: id,
        protoId,
        proccode,
        mutation: proto.mutation,
        args: argumentIds.map((argId, i) => ({
          id: argId,
          name: argumentNames[i] ?? argId,
          type: /Boolean$/.test(target.blocks[proto.inputs?.[argId]?.[1]]?.opcode || '') ? 'boolean' : 'number',
        })),
      };
    }
  }
  return null;
}

export function allProcedures(target) {
  const out = [];
  for (const block of Object.values(target.blocks || {})) {
    if (block.opcode !== 'procedures_definition') continue;
    const protoId = block.inputs?.custom_block?.[1];
    const proto = target.blocks[protoId];
    if (proto?.mutation?.proccode) {
      let names = [];
      try { names = JSON.parse(proto.mutation.argumentnames || '[]'); } catch { names = []; }
      out.push({ proccode: proto.mutation.proccode, argNames: names, defId: block.inputs.custom_block[1] });
    }
  }
  return out;
}

/* ------------------------------------------------------------ persistence */
export const STORAGE_KEY = 'craftwarp.project.v1';

export function projectToJSON(project) {
  return JSON.parse(JSON.stringify(project));
}

export function saveLocalProject(project) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch (err) {
    console.warn('[cw] local save failed', err);
    return false;
  }
}

export function loadLocalProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return ensureProjectShape(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearLocalProject() {
  localStorage.removeItem(STORAGE_KEY);
}

/** repair / upgrade a project object (imports, old saves, server data) */
export function ensureProjectShape(input) {
  const project = input || createEmptyProject();
  project.assets = project.assets || {};
  project.monitors = project.monitors || [];
  project.meta = project.meta || { semver: '3.0.0', agent: 'CRAFT WARP' };
  project.name = project.name || 'مشروع بلا عنوان';
  if (!Array.isArray(project.targets) || !project.targets.length) project.targets = [newStage()];
  if (!project.targets[0].isStage) {
    const idx = project.targets.findIndex((t) => t.isStage);
    if (idx > 0) project.targets.unshift(project.targets.splice(idx, 1)[0]);
    else project.targets.unshift(newStage());
  }
  project.targets.forEach((target, index) => {
    target.id = target.id || (target.isStage ? 'stage' : uid('sprite'));
    target.blocks = target.blocks || {};
    target.variables = target.variables || {};
    target.lists = target.lists || {};
    target.broadcasts = target.broadcasts || {};
    target.comments = target.comments || {};
    target.costumes = target.costumes || [];
    target.sounds = target.sounds || [];
    target.effects = target.effects || {};
    target.currentCostume = Math.max(0, Math.min(target.costumes.length - 1, target.currentCostume || 0));
    if (typeof target.layerOrder !== 'number') target.layerOrder = index;
    if (!target.isStage) {
      target.visible = target.visible !== false;
      target.size = typeof target.size === 'number' ? target.size : 100;
      target.direction = typeof target.direction === 'number' ? target.direction : 90;
      target.x = typeof target.x === 'number' ? target.x : 0;
      target.y = typeof target.y === 'number' ? target.y : 0;
      target.rotationStyle = target.rotationStyle || 'all around';
      target.dragMode = target.dragMode || 'draggable';
    }
    // normalize blocks
    for (const [id, block] of Object.entries(target.blocks)) {
      if (!block.opcode) { delete target.blocks[id]; continue; }
      block.inputs = block.inputs || {};
      block.fields = block.fields || {};
      if (block.topLevel && typeof block.x !== 'number') block.x = 60;
      if (block.topLevel && typeof block.y !== 'number') block.y = 60;
      if (block.topLevel) block.parent = null;
    }
    invalidateProcedures(target);
  });
  // make sure at least one backdrop exists
  if (!project.targets[0].costumes.length) {
    backdropFromLibrary(project, DEFAULT_STAGE_BACKDROP);
  }
  return project;
}

export function defaultProjectWithCat() {
  const project = createEmptyProject();
  const stage = project.targets[0];
  const cat = project.targets[1];
  void cat;
  void stage;
  void defaultCatCostume;
  void defaultCatCostume2;
  return project;
}

export function projectStats(project) {
  let blocks = 0;
  let costumes = 0;
  let sounds = 0;
  for (const t of project.targets) {
    blocks += Object.keys(t.blocks || {}).length;
    costumes += (t.costumes || []).length;
    sounds += (t.sounds || []).length;
  }
  return { blocks, costumes, sounds, sprites: Math.max(0, project.targets.length - 1), assets: Object.keys(project.assets || {}).length };
}

export function opcodeLabel(opcode) {
  return getDef(opcode).cat;
}
