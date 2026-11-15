/**
 * CRAFT WARP — Scratch 3 (.sb3) import / export.
 *
 * The editor keeps menus as editable fields for a nicer UX; .sb3 stores them as
 * shadow menu blocks. These two functions translate between both worlds, asset
 * binaries included, so round-tripping with Scratch / TurboWarp keeps scripts,
 * costumes, sounds and custom blocks intact.
 */
import { readZip, writeZip, md5, dataUrlToBytes, bytesToDataUrl, MIME_BY_EXT, EXT_BY_MIME, uid } from './zip.js';
import { getDef } from './blocks.js';
import { ensureProjectShape, newStage, invalidateProcedures } from './project.js';

/* opcode.input → [menu block opcode, menu block field]  */
const SHADOW_MENUS = {
  'motion_goto.TO': ['motion_goto_menu', 'TO'],
  'motion_glideto.TO': ['motion_glideto_menu', 'TO'],
  'motion_pointtowards.TOWARDS': ['motion_pointtowards_menu', 'TOWARDS'],
  'looks_switchcostumeto.COSTUME': ['looks_costume', 'COSTUME'],
  'looks_switchbackdropto.BACKDROP': ['looks_backdrops', 'BACKDROP'],
  'looks_switchbackdroptoandwait.BACKDROP': ['looks_backdrops', 'BACKDROP'],
  'sound_play.SOUND_MENU': ['sound_sounds_menu', 'SOUND_MENU'],
  'sound_playuntildone.SOUND_MENU': ['sound_sounds_menu', 'SOUND_MENU'],
  'control_create_clone_of.CLONE_OPTION': ['control_create_clone_of_menu', 'CLONE_OPTION'],
  'sensing_touchingobject.TOUCHINGOBJECTMENU': ['sensing_touchingobjectmenu', 'TOUCHINGOBJECTMENU'],
  'sensing_distanceto.DISTANCETOMENU': ['sensing_distancetomenu', 'DISTANCETOMENU'],
  'sensing_of.OBJECT': ['sensing_of_object_menu', 'OBJECT'],
};

const BROADCAST_OPCODES = new Set(['event_broadcast', 'event_broadcastandwait']);

/* --------------------------------------------------------------- export */
export async function exportSb3(project, { compress = true } = {}) {
  const outTargets = [];
  const assetFiles = new Map();

  const collectAsset = (costumeOrSound) => {
    const key = costumeOrSound.md5ext || `${costumeOrSound.assetId}.${costumeOrSound.dataFormat || 'svg'}`;
    const asset = project.assets?.[key];
    if (!asset?.dataUrl) return null;
    if (!assetFiles.has(key)) {
      try {
        assetFiles.set(key, dataUrlToBytes(asset.dataUrl));
      } catch (err) {
        console.warn('[cw] bad asset', key, err);
        return null;
      }
    }
    return key;
  };

  for (const target of project.targets) {
    const blocks = convertBlocksForExport(target);
    const costumes = [];
    for (const costume of target.costumes || []) {
      const key = collectAsset(costume);
      if (!key) continue;
      const hash = key.split('.')[0];
      costumes.push({
        name: costume.name,
        assetId: hash,
        md5ext: key,
        dataFormat: costume.dataFormat || key.split('.').pop(),
        rotationCenterX: costume.rotationCenterX ?? 0,
        rotationCenterY: costume.rotationCenterY ?? 0,
        bitmapResolution: costume.bitmapResolution || 1,
      });
    }
    const sounds = [];
    for (const sound of target.sounds || []) {
      const key = collectAsset(sound);
      if (!key) continue;
      sounds.push({
        name: sound.name,
        assetId: key.split('.')[0],
        md5ext: key,
        dataFormat: sound.dataFormat || 'wav',
        rate: sound.rate || 48000,
        sampleCount: sound.sampleCount || 0,
      });
    }

    const sb3Target = {
      isStage: !!target.isStage,
      name: target.isStage ? 'Stage' : target.name,
      variables: target.variables || {},
      lists: target.lists || {},
      broadcasts: target.broadcasts || {},
      blocks,
      comments: target.comments || {},
      currentCostume: target.currentCostume || 0,
      costumes,
      sounds,
      volume: target.volume ?? 100,
      layerOrder: target.layerOrder || 0,
    };
    if (target.isStage) {
      sb3Target.tempo = target.tempo ?? 60;
      sb3Target.videoTransparency = target.videoTransparency ?? 50;
      sb3Target.videoState = target.videoState || 'off';
      sb3Target.textToSpeechLanguage = target.textToSpeechLanguage ?? null;
    } else {
      sb3Target.visible = target.visible !== false;
      sb3Target.x = target.x || 0;
      sb3Target.y = target.y || 0;
      sb3Target.size = target.size ?? 100;
      sb3Target.direction = target.direction ?? 90;
      sb3Target.draggable = !!target.draggable;
      sb3Target.rotationStyle = target.rotationStyle || 'all around';
    }
    outTargets.push(sb3Target);
  }

  const projectJson = {
    targets: outTargets,
    monitors: (project.monitors || []).map((m) => ({ ...m, spriteName: m.spriteName ?? null })),
    extensions: project.extensions || [],
    meta: {
      semver: '3.0.0',
      vm: '0.2.0',
      agent: 'CRAFT WARP 0.1.0',
    },
  };

  const entries = [{
    name: 'project.json',
    data: new TextEncoder().encode(JSON.stringify(projectJson)),
  }];
  for (const [name, bytes] of assetFiles) entries.push({ name, data: bytes });
  return writeZip(entries, { compress });
}

function convertBlocksForExport(target) {
  const source = target.blocks || {};
  const out = {};
  const menuShadows = {};

  for (const [id, block] of Object.entries(source)) {
    const copy = {
      opcode: block.opcode,
      next: block.next || null,
      parent: block.parent || null,
      inputs: {},
      fields: {},
      shadow: !!block.shadow,
      topLevel: !!block.topLevel,
    };
    if (block.topLevel) { copy.x = block.x || 0; copy.y = block.y || 0; }
    if (block.mutation) copy.mutation = block.mutation;

    for (const [name, value] of Object.entries(block.fields || {})) {
      copy.fields[name] = Array.isArray(value) ? value.slice() : [value];
    }
    for (const [name, inp] of Object.entries(block.inputs || {})) {
      copy.inputs[name] = Array.isArray(inp) ? JSON.parse(JSON.stringify(inp)) : inp;
    }

    const def = getDef(block.opcode);
    for (const part of def.parts || []) {
      if (!part || typeof part === 'string' || part.k !== 'menu') continue;
      const value = block.fields?.[part.i]?.[0] ?? part.v ?? '';
      delete copy.fields[part.i];

      if (BROADCAST_OPCODES.has(block.opcode)) {
        const broadcastId = Object.entries(target.broadcasts || {}).find(([, n]) => n === value)?.[0] || value;
        copy.inputs[part.i] = [1, [11, value, broadcastId]];
        continue;
      }
      const shadow = SHADOW_MENUS[`${block.opcode}.${part.i}`];
      if (shadow) {
        const shadowId = `${id}_${part.i.toLowerCase()}_menu`;
        menuShadows[shadowId] = {
          opcode: shadow[0],
          next: null,
          parent: id,
          inputs: {},
          fields: { [shadow[1]]: [value, null] },
          shadow: true,
          topLevel: false,
        };
        copy.inputs[part.i] = [1, shadowId];
      } else {
        copy.fields[part.i] = [value, null];
      }
    }
    out[id] = copy;
  }

  // arguments for custom blocks: keep prototype argument reporters as shadows
  return { ...out, ...menuShadows };
}

/* --------------------------------------------------------------- import */
export async function importSb3(arrayBuffer, { name } = {}) {
  const files = await readZip(arrayBuffer);
  const jsonBytes = files.get('project.json');
  if (!jsonBytes) throw new Error('project.json missing — is this a Scratch 3 project?');
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));

  const assets = {};
  for (const [fileName, bytes] of files) {
    if (fileName === 'project.json') continue;
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    try {
      assets[fileName] = { dataUrl: bytesToDataUrl(bytes, mime), ext, size: bytes.length };
    } catch (err) {
      console.warn('[cw] asset import failed', fileName, err);
    }
  }

  const project = {
    name: name || 'مشروع مستورد',
    meta: { ...(json.meta || {}), agent: 'CRAFT WARP 0.1.0' },
    targets: [],
    monitors: json.monitors || [],
    extensions: json.extensions || [],
    assets,
  };

  const targets = json.targets || [];
  targets.forEach((rawTarget, index) => {
    const isStage = !!rawTarget.isStage;
    const target = isStage ? newStage() : {
      id: uid('sprite'),
      name: rawTarget.name || `Sprite${index}`,
      isStage: false,
      variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
      currentCostume: rawTarget.currentCostume || 0,
      costumes: [], sounds: [], volume: rawTarget.volume ?? 100,
      layerOrder: rawTarget.layerOrder ?? index,
      visible: rawTarget.visible !== false,
      x: rawTarget.x || 0, y: rawTarget.y || 0, size: rawTarget.size ?? 100,
      direction: rawTarget.direction ?? 90,
      draggable: !!rawTarget.draggable,
      rotationStyle: rawTarget.rotationStyle || 'all around',
      effects: {}, dragMode: 'draggable', say: null,
    };

    target.variables = rawTarget.variables || {};
    target.lists = rawTarget.lists || {};
    target.broadcasts = rawTarget.broadcasts || {};
    target.comments = rawTarget.comments || {};
    target.volume = rawTarget.volume ?? 100;
    target.currentCostume = rawTarget.currentCostume || 0;
    if (isStage) {
      target.tempo = rawTarget.tempo ?? 60;
      target.videoTransparency = rawTarget.videoTransparency ?? 50;
      target.videoState = rawTarget.videoState || 'off';
      target.textToSpeechLanguage = rawTarget.textToSpeechLanguage ?? null;
    } else {
      target.layerOrder = rawTarget.layerOrder ?? index;
    }

    target.costumes = (rawTarget.costumes || []).map((c) => ({
      name: c.name || 'costume',
      assetId: c.assetId,
      md5ext: c.md5ext || `${c.assetId}.${c.dataFormat || 'svg'}`,
      dataFormat: c.dataFormat || (c.md5ext || '').split('.').pop() || 'svg',
      rotationCenterX: c.rotationCenterX ?? 0,
      rotationCenterY: c.rotationCenterY ?? 0,
      bitmapResolution: c.bitmapResolution || 1,
      width: c.width,
      height: c.height,
    })).filter((c) => {
      const has = !!assets[c.md5ext];
      if (!has) console.warn('[cw] missing costume asset', c.md5ext);
      return has;
    });

    target.sounds = (rawTarget.sounds || []).map((s) => ({
      name: s.name || 'sound',
      assetId: s.assetId,
      md5ext: s.md5ext || `${s.assetId}.${s.dataFormat || 'wav'}`,
      dataFormat: s.dataFormat || 'wav',
      rate: s.rate || 48000,
      sampleCount: s.sampleCount || 0,
    })).filter((s) => !!assets[s.md5ext]);

    target.blocks = convertBlocksForImport(rawTarget.blocks || {});
    invalidateProcedures(target);
    project.targets.push(target);
  });

  const ensured = ensureProjectShape(project);
  ensured.name = name || json.name || 'مشروع مستورد';
  return ensured;
}

function convertBlocksForImport(rawBlocks) {
  const blocks = {};
  const menuIds = new Set();

  // collect shadow menu blocks so they can be folded into fields
  for (const [id, block] of Object.entries(rawBlocks)) {
    if (block.shadow && /_menu$|^looks_costume$|^looks_backdrops$|^sound_sounds_menu$/.test(block.opcode || '')) {
      menuIds.add(id);
    }
    if (block.shadow && block.opcode === 'event_broadcast_menu') menuIds.add(id);
  }

  for (const [id, block] of Object.entries(rawBlocks)) {
    if (menuIds.has(id)) continue;
    const copy = {
      opcode: block.opcode,
      next: block.next || null,
      parent: block.parent || null,
      inputs: {},
      fields: {},
      shadow: !!block.shadow,
      topLevel: !!block.topLevel,
    };
    if (block.topLevel) { copy.x = block.x || 0; copy.y = block.y || 0; }
    if (block.mutation) copy.mutation = block.mutation;
    for (const [name, value] of Object.entries(block.fields || {})) {
      copy.fields[name] = Array.isArray(value) ? value.slice() : [value];
    }

    for (const [name, inp] of Object.entries(block.inputs || {})) {
      if (!Array.isArray(inp)) continue;
      const value = inp[1];
      if (typeof value === 'string') {
        if (menuIds.has(value) && rawBlocks[value]) {
          const menuBlock = rawBlocks[value];
          const fieldName = Object.keys(menuBlock.fields || {})[0];
          const raw = fieldName ? menuBlock.fields[fieldName] : null;
          copy.fields[name] = Array.isArray(raw) ? raw.slice() : [raw ?? ''];
          continue;
        }
        copy.inputs[name] = [inp[0], value];
        continue;
      }
      if (Array.isArray(value)) {
        const [type, primary] = value;
        if (type === 11) {
          copy.fields[name] = [primary, value[2] ?? null];
          continue;
        }
        copy.inputs[name] = [inp[0], [type, primary]];
        continue;
      }
      copy.inputs[name] = inp;
    }
    blocks[id] = copy;
  }

  // our renderer shows menus as fields: for opcodes we know, fold menu inputs
  for (const block of Object.values(blocks)) {
    const def = getDef(block.opcode);
    for (const part of def.parts || []) {
      if (!part || typeof part === 'string' || part.k !== 'menu') continue;
      if (block.fields[part.i]) continue;
      const inp = block.inputs[part.i];
      if (!inp) continue;
      const value = Array.isArray(inp[1]) ? inp[1][1] : '';
      if (typeof value === 'string' && !blocks[value]) {
        delete block.inputs[part.i];
        block.fields[part.i] = [value, null];
      }
    }
  }

  // drop dangling references
  for (const block of Object.values(blocks)) {
    if (block.next && !blocks[block.next]) block.next = null;
    for (const [name, inp] of Object.entries(block.inputs)) {
      if (typeof inp[1] === 'string' && !blocks[inp[1]]) delete block.inputs[name];
    }
    if (block.parent && !blocks[block.parent]) block.parent = null;
  }
  return blocks;
}

/* --------------------------------------------------------- file helpers */
export async function importProjectFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) {
    return importSb3(buffer, { name: file.name.replace(/\.(sb3|sprite3|zip)$/i, '') });
  }
  const text = new TextDecoder().decode(bytes);
  const json = JSON.parse(text);
  if (json.targets) {
    const project = ensureProjectShape(json);
    project.name = file.name.replace(/\.json$/i, '') || project.name;
    return project;
  }
  throw new Error('Unrecognised project file');
}

export function assetHashFor(dataUrl, ext) {
  const bytes = dataUrlToBytes(dataUrl);
  return `${md5(bytes)}.${ext}`;
}

export { SHADOW_MENUS, EXT_BY_MIME };
