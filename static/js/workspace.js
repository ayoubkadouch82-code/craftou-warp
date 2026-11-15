/**
 * CRAFT WARP — scripting workspace.
 * Drag blocks from the palette, snap them together, pan/zoom, edit inline
 * fields. Everything is rendered as SVG strings, which keeps the editor fast
 * with thousands of blocks and trivially syncable over collaboration.
 */
import { getDef, CATEGORY_COLORS, KEY_OPTIONS } from './blocks.js';
import { paintStackSvg, paintStandaloneBlock, INDENT, H, esc, shade } from './blockview.js';
import {
  topLevelBlocks, stackIds, deleteBlockCascade, duplicateStack, addBlockAt,
  setInput, addBlock, allVariables, allLists, allBroadcasts, createVariable, createList,
  createBroadcast, createCustomBlockCall, allProcedures, invalidateProcedures,
} from './project.js';
import { t } from './i18n.js';

const SNAP_DISTANCE = 52;

const MENU_LABELS = {
  '_random_': 'random position',
  '_mouse_': 'mouse-pointer',
  '_edge_': 'edge',
  '_stage_': 'Stage',
  '_myself_': 'myself',
  next_backdrop: 'next backdrop',
  previous_backdrop: 'previous backdrop',
};

export class Workspace {
  constructor(options) {
    this.project = options.project;
    this.getTarget = options.getTarget;
    this.onChange = options.onChange || (() => {});
    this.onSelect = options.onSelect || (() => {});
    this.onToast = options.toast || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.collab = options.collab || null;

    this.svg = options.svg;
    this.layerBlocks = this.svg.querySelector('#layer-blocks');
    this.layerFloating = this.svg.querySelector('#layer-floating');
    this.layerHint = this.svg.querySelector('#layer-grid');
    this.root = this.svg.querySelector('#workspace-root');
    this.overlay = options.overlay;
    this.emptyEl = options.emptyEl;
    this.trashEl = options.trashEl;
    this.cursorLayer = options.cursorLayer;

    this.view = { x: 30, y: 20, scale: 1 };
    this.clipboard = null;
    this.selectedId = null;
    this.drag = null;
    this.hidden = new Set();
    this.lastTapTime = 0;
    this.bindEvents();
    this.applyTransform();
  }

  setProject(project) {
    this.project = project;
    this.view = { x: 30, y: 20, scale: 1 };
    this.applyTransform();
    this.render();
  }

  get target() { return this.getTarget(); }

  /* -------------------------------------------------------------- rendering */
  render() {
    const target = this.target;
    if (!target) {
      this.layerBlocks.innerHTML = '';
      return;
    }
    let markup = '';
    let count = 0;
    for (const [id, block] of topLevelBlocks(target)) {
      if (this.hidden.has(id)) continue;
      count++;
      try {
        const painted = paintStackSvg(this.project, target, id, block.x || 0, block.y || 0);
        markup += painted.svg;
      } catch (err) {
        console.warn('[cw] paint failed', id, err);
      }
    }
    this.layerBlocks.innerHTML = markup;
    if (this.emptyEl) this.emptyEl.classList.toggle('hidden', count > 0);
    this.applyTransform();
    if (this.drag) this.updateGhost();
  }

  applyTransform() {
    const { x, y, scale } = this.view;
    this.root.setAttribute('transform', `translate(${x},${y}) scale(${scale})`);
  }

  screenToWorld(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.view.x) / this.view.scale,
      y: (clientY - rect.top - this.view.y) / this.view.scale,
    };
  }

  clientToWorldRect(el) {
    const rect = el.getBoundingClientRect();
    const a = this.screenToWorld(rect.left, rect.top);
    const b = this.screenToWorld(rect.right, rect.bottom);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, screen: rect };
  }

  zoomAt(factor, clientX, clientY) {
    const before = this.screenToWorld(clientX, clientY);
    const nextScale = Math.max(0.35, Math.min(2.2, this.view.scale * factor));
    const rect = this.svg.getBoundingClientRect();
    this.view.scale = nextScale;
    this.view.x = clientX - rect.left - before.x * nextScale;
    this.view.y = clientY - rect.top - before.y * nextScale;
    this.applyTransform();
  }

  resetZoom() {
    this.view = { x: 30, y: 20, scale: 1 };
    this.applyTransform();
  }

  cleanupLayout() {
    const target = this.target;
    if (!target) return;
    let y = 20;
    const sorted = topLevelBlocks(target).sort((a, b) => (a[1].x || 0) - (b[1].x || 0));
    let x = 20;
    for (const [, block] of sorted) {
      block.x = x;
      block.y = y;
      y += 60;
      if (y > 500) { y = 20; x += 240; }
    }
    this.render();
    this.onChange('layout');
  }

  /* ---------------------------------------------------------------- events */
  bindEvents() {
    this.svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.svg.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.zoomAt(factor, e.clientX, e.clientY);
    }, { passive: false });
    this.svg.addEventListener('contextmenu', (e) => {
      const group = e.target.closest('.block-group');
      if (!group) return;
      e.preventDefault();
      this.openContextMenu(group.dataset.b, e.clientX, e.clientY);
    });
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedId) {
        const target = this.target;
        const block = target?.blocks?.[this.selectedId];
        if (!block) return;
        e.preventDefault();
        if (block.topLevel) deleteBlockCascade(target, this.selectedId);
        else deleteBlockCascade(target, this.selectedId);
        this.selectedId = null;
        this.render();
        this.onChange('delete');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && this.selectedId) {
        this.clipboard = this.selectedId;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && this.clipboard) {
        const id = duplicateStack(this.target, this.clipboard);
        if (id) { this.render(); this.onChange('paste'); }
      }
    });
  }

  onPointerDown(e) {
    if (e.button === 1) {
      this.beginPan(e);
      return;
    }
    const fieldEl = e.target.closest('.cw-field');
    if (fieldEl) {
      e.preventDefault();
      const group = fieldEl.closest('.block-group');
      this.editField(fieldEl.dataset.f, group?.dataset.b, fieldEl);
      return;
    }
    const slotEl = e.target.closest('.cw-slot');
    if (slotEl && !slotEl.querySelector('.block-group')) {
      e.preventDefault();
      const group = slotEl.closest('.block-group');
      this.editInput(slotEl.dataset.i, group?.dataset.b, slotEl);
      return;
    }
    const group = e.target.closest('.block-group');
    if (group) {
      e.preventDefault();
      this.beginBlockDrag(group.dataset.b, e);
      return;
    }
    this.selectedId = null;
    this.beginPan(e);
  }

  beginPan(e) {
    const start = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
    const move = (ev) => {
      this.view.x = start.vx + (ev.clientX - start.x);
      this.view.y = start.vy + (ev.clientY - start.y);
      this.applyTransform();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* --------------------------------------------------------------- editing */
  editField(fieldName, blockId, el) {
    const target = this.target;
    const block = target?.blocks?.[blockId];
    if (!block || !fieldName) return;
    const def = getDef(block.opcode);
    const part = (def.parts || []).find((p) => p && (p.f === fieldName || (p.i === fieldName && p.k === 'menu')));
    const options = this.optionsFor(part, block, fieldName);
    const rect = el.getBoundingClientRect();
    this.closeOverlay();
    const menu = document.createElement('div');
    menu.className = 'overlay-menu';
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    if (options.length) {
      for (const option of options) {
        const btn = document.createElement('button');
        btn.textContent = option.label;
        if (option.swatch) {
          const dot = document.createElement('span');
          dot.className = 'mini-swatch';
          dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:6px;background:${option.swatch}`;
          btn.prepend(dot);
        }
        btn.onclick = () => {
          if (option.action) option.action();
          else {
            block.fields[fieldName] = option.secondary ? [option.value, option.secondary] : [option.value];
            invalidateProcedures(target);
            this.render();
            this.onChange('field');
          }
          this.closeOverlay();
        };
        menu.appendChild(btn);
      }
    } else {
      const tip = document.createElement('div');
      tip.style.cssText = 'padding:6px 10px;font-size:11px;color:#8797ab';
      tip.textContent = t('nothingHere');
      menu.appendChild(tip);
    }
    document.body.appendChild(menu);
    this.overlayMenu = menu;
    const off = (ev) => {
      if (!menu.contains(ev.target)) { this.closeOverlay(); document.removeEventListener('pointerdown', off); }
    };
    setTimeout(() => document.addEventListener('pointerdown', off), 0);
  }

  optionsFor(part, block, fieldName) {
    const target = this.target;
    const project = this.project;
    const kind = part?.k;
    if (part?.opts?.length) {
      const labels = part.opts.map((v) => {
        if (v === "don't rotate") return { value: v, label: "don't rotate" };
        return { value: v, label: String(v) };
      });
      if (kind === 'color') return [];
      return labels;
    }
    if (kind === 'var') {
      const vars = allVariables(project, target);
      const out = vars.map((v) => ({ value: v.id, secondary: v.name, label: `${v.name}${v.global ? ' (global)' : ''}` }));
      out.push({ label: '＋ ' + t('makeVar'), action: () => this.promptNewVariable() });
      return out;
    }
    if (kind === 'list') {
      const lists = allLists(project, target);
      const out = lists.map((v) => ({ value: v.id, secondary: v.name, label: `${v.name}${v.global ? ' (global)' : ''}` }));
      out.push({ label: '＋ ' + t('makeList'), action: () => this.promptNewList() });
      return out;
    }
    if (kind === 'color') return [];
    const menu = part?.menu;
    const map = (values) => values.map((v) => ({ value: v, label: MENU_LABELS[v] || v }));
    switch (menu) {
      case 'sprites':
        return map(['_random_', '_mouse_', ...project.targets.filter((x) => !x.isStage).map((x) => x.name)]);
      case 'touchables':
        return map(['_mouse_', '_edge_', ...project.targets.filter((x) => !x.isStage).map((x) => x.name)]);
      case 'objects':
        return map(['_stage_', ...project.targets.filter((x) => !x.isStage).map((x) => x.name)]);
      case 'clones':
        return map(['_myself_', ...project.targets.filter((x) => !x.isStage).map((x) => x.name)]);
      case 'costumes':
        return (target?.costumes || []).map((c, i) => ({ value: c.name, label: `${c.name}` }));
      case 'backdrops':
        return [...(project.targets[0]?.costumes || []).map((c) => ({ value: c.name, label: c.name })),
          { value: 'next backdrop', label: 'next backdrop' }, { value: 'previous backdrop', label: 'previous backdrop' }];
      case 'sounds':
        return (target?.sounds || []).map((s) => ({ value: s.name, label: s.name }));
      case 'broadcasts': {
        const list = allBroadcasts(project).map((b) => ({ value: b.name, label: b.name }));
        list.push({ label: '＋ new message', action: () => this.promptNewBroadcast(fieldName) });
        return list;
      }
      default:
        return [];
    }
  }

  editInput(inputName, blockId, el) {
    const target = this.target;
    const block = target?.blocks?.[blockId];
    if (!block || !inputName) return;
    const raw = block.inputs?.[inputName];
    const current = Array.isArray(raw?.[1]) ? raw[1][1] : '';
    const rect = el.getBoundingClientRect();
    this.closeOverlay();
    const wrap = document.createElement('div');
    wrap.className = 'input-overlay';
    wrap.style.left = `${rect.left + rect.width / 2 - 45}px`;
    wrap.style.top = `${rect.top - 3}px`;
    const input = document.createElement('input');
    input.className = 'overlay-input';
    input.value = String(current ?? '');
    input.style.width = `${Math.max(64, rect.width + 30)}px`;
    wrap.appendChild(input);
    document.body.appendChild(wrap);
    this.overlayMenu = wrap;
    input.focus();
    input.select();
    const commit = () => {
      const type = raw && Array.isArray(raw[1]) ? raw[1][0] : 10;
      if (raw && typeof raw[1] === 'string' && target.blocks[raw[1]]) {
        deleteBlockCascade(target, raw[1]);
      }
      block.inputs[inputName] = [1, [type, input.value]];
      this.closeOverlay();
      this.render();
      this.onChange('input');
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') { ev.preventDefault(); this.closeOverlay(); }
      ev.stopPropagation();
    });
    input.addEventListener('blur', commit);
  }

  closeOverlay() {
    if (this.overlayMenu) {
      this.overlayMenu.remove();
      this.overlayMenu = null;
    }
  }

  promptNewVariable() {
    const name = window.prompt('اسم المتغير الجديد:', `متغير${Object.keys(this.target.variables || {}).length + 1}`);
    if (!name) return;
    const id = createVariable(this.project, this.target, name, 0);
    this.onToast(`تم إنشاء المتغير ${name}`, 'ok');
    this.onChange('variable');
    void id;
  }

  promptNewList() {
    const name = window.prompt('اسم القائمة الجديدة:', `قائمة${Object.keys(this.target.lists || {}).length + 1}`);
    if (!name) return;
    createList(this.project, this.target, name);
    this.onToast(`تم إنشاء القائمة ${name}`, 'ok');
    this.onChange('list');
  }

  promptNewBroadcast(fieldName) {
    const name = window.prompt('اسم الرسالة:', 'message1');
    if (!name) return;
    createBroadcast(this.project, name);
    this.onToast(`تم إنشاء الرسالة ${name}`, 'ok');
    void fieldName;
    this.onChange('broadcast');
  }

  /* ----------------------------------------------------------- block drag */
  beginBlockDrag(blockId, e) {
    const target = this.target;
    const block = target?.blocks?.[blockId];
    if (!block || !blockId) return;
    const isReporter = ['reporter', 'boolean'].includes(getDef(block.opcode).shape);
    this.selectedId = blockId;

    // detach from its connection
    if (block.parent && target.blocks[block.parent]) {
      const parent = target.blocks[block.parent];
      if (parent.next === blockId) parent.next = null;
      for (const [name, inp] of Object.entries(parent.inputs || {})) {
        if (inp[1] === blockId) delete parent.inputs[name];
      }
    }
    block.parent = null;

    const ids = stackIds(target, blockId);
    const startWorld = this.screenToWorld(e.clientX, e.clientY);
    const origin = { x: block.topLevel ? block.x || 0 : 0, y: block.topLevel ? block.y || 0 : 0 };
    if (!block.topLevel) { block.topLevel = true; block.x = startWorld.x; block.y = startWorld.y; }
    this.hidden = new Set([blockId]);
    this.drag = {
      kind: isReporter ? 'reporter' : 'stack',
      blockId,
      ids: new Set(ids),
      origin,
      pointerStart: startWorld,
      startClient: { x: e.clientX, y: e.clientY },
      moved: false,
      snap: null,
      fromPalette: false,
    };
    this.render();
    this.updateGhostAt(e.clientX, e.clientY);
    this.onStatus('dragging');
  }

  beginPaletteDrag(opcode, e) {
    const target = this.target;
    if (!target) return;
    const def = getDef(opcode);
    const isReporter = ['reporter', 'boolean'].includes(def.shape);
    const startWorld = this.screenToWorld(e.clientX, e.clientY);
    this.drag = {
      kind: isReporter ? 'reporter' : 'stack',
      fromPalette: true,
      opcode,
      pointerStart: startWorld,
      startClient: { x: e.clientX, y: e.clientY },
      moved: false,
      snap: null,
    };
    this.renderGhostForOpcode(opcode);
    this.updateGhostAt(e.clientX, e.clientY);
  }

  renderGhostForOpcode(opcode) {
    const target = this.target;
    const temp = {
      opcode,
      next: null,
      parent: null,
      inputs: {},
      fields: {},
      topLevel: true,
      x: 0,
      y: 0,
    };
    const painted = paintStandaloneBlock(this.project, target, temp, 0, 0);
    this.layerFloating.innerHTML = painted.svg;
    this.ghostSize = { w: painted.width, h: painted.height };
  }

  updateGhost() {
    if (!this.drag) return;
    if (this.drag.fromPalette) return;
    const target = this.target;
    const block = target.blocks[this.drag.blockId];
    if (!block) return;
    const painted = paintStackSvg(this.project, target, this.drag.blockId, 0, 0);
    this.layerFloating.innerHTML = painted.svg;
  }

  updateGhostAt(clientX, clientY) {
    if (!this.drag) return;
    const world = this.screenToWorld(clientX, clientY);
    const dx = world.x - this.drag.pointerStart.x;
    const dy = world.y - this.drag.pointerStart.y;
    const target = this.target;
    let gx;
    let gy;
    if (this.drag.fromPalette) {
      gx = world.x - 18;
      gy = world.y - H / 2;
    } else {
      const block = target.blocks[this.drag.blockId];
      if (!block) return;
      gx = this.drag.origin.x + dx;
      gy = this.drag.origin.y + dy;
    }
    this.ghostPos = { x: gx, y: gy };
    this.layerFloating.setAttribute('transform', `translate(${gx},${gy})`);
    if (!this.drag.fromPalette) {
      const live = target.blocks[this.drag.blockId];
      if (live) { live.x = gx; live.y = gy; }
    }
  }

  onPointerMove(e) {
    if (!this.drag) return;
    if (!this.drag.moved) {
      if (Math.hypot(e.clientX - this.drag.startClient.x, e.clientY - this.drag.startClient.y) < 3) return;
      this.drag.moved = true;
      if (this.drag.fromPalette) this.hidden = new Set();
    }
    this.updateGhostAt(e.clientX, e.clientY);
    this.drag.snap = this.findSnap(e.clientX, e.clientY);
    this.drawSnapHint(this.drag.snap);
    this.updateTrashState(e.clientX, e.clientY);
  }

  updateTrashState(clientX, clientY) {
    if (!this.trashEl) return;
    const palette = document.getElementById('palette');
    if (!palette) return;
    const rect = palette.getBoundingClientRect();
    const over = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    palette.classList.toggle('trash-active', over && !this.drag?.fromPalette);
    this.trashHover = over;
  }

  findSnap(clientX, clientY) {
    if (!this.drag) return null;
    const wantSlot = this.drag.kind === 'reporter';
    let best = null;
    const consider = (candidate) => {
      const dist = Math.hypot(candidate.screen.x - clientX, candidate.screen.y - clientY);
      if (dist > SNAP_DISTANCE) return;
      if (!best || dist < best.dist) best = { ...candidate, dist };
    };

    const blocksLayer = this.layerBlocks;
    if (wantSlot) {
      for (const el of blocksLayer.querySelectorAll('.cw-slot[data-accept]')) {
        const rect = el.getBoundingClientRect();
        const accept = el.dataset.accept;
        const def = this.drag;
        if (accept === 'boolean' && !this.dragIsBoolean()) continue;
        consider({
          type: 'slot',
          input: el.dataset.i,
          parentId: el.closest('.block-group')?.dataset.b,
          accept,
          screen: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          rect,
          world: null,
        });
        void def;
      }
    } else {
      for (const el of blocksLayer.querySelectorAll('.block-group')) {
        const id = el.dataset.b;
        const block = this.target.blocks[id];
        if (!id || !block || this.drag.ids?.has(id)) continue;
        const rect = el.getBoundingClientRect();
        if (!block.next) {
          consider({ type: 'next', parentId: id, screen: { x: rect.left, y: rect.bottom }, rect });
        }
      }
      for (const el of blocksLayer.querySelectorAll('.cw-substack')) {
        const parentEl = el.closest('.block-group');
        const parentId = parentEl?.dataset.b;
        const parent = this.target.blocks[parentId];
        if (!parent) continue;
        const inputName = el.dataset.i;
        if (typeof parent.inputs?.[inputName]?.[1] === 'string') continue;
        const rect = el.getBoundingClientRect();
        if (rect.height < 2) continue;
        consider({ type: 'substack', input: inputName, parentId, screen: { x: rect.left, y: rect.top + 6 }, rect });
      }
    }
    return best;
  }

  dragIsBoolean() {
    if (!this.drag) return false;
    if (this.drag.fromPalette) return getDef(this.drag.opcode).shape === 'boolean';
    const block = this.target.blocks[this.drag.blockId];
    return block ? getDef(block.opcode).shape === 'boolean' : false;
  }

  drawSnapHint(snap) {
    if (!snap) {
      this.layerHint.innerHTML = '';
      return;
    }
    const r = this.clientToWorldRect({ getBoundingClientRect: () => snap.rect });
    const x = r.x;
    const y = snap.type === 'next' ? r.y + r.h - 2 : r.y;
    const w = Math.max(72, r.w);
    const h = snap.type === 'slot' ? Math.max(18, r.h) : 22;
    this.layerHint.innerHTML = `<rect class="snap-hint" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
  }

  onPointerUp(e) {
    if (!this.drag) return;
    const drag = this.drag;
    const target = this.target;
    const snap = this.findSnap(e.clientX, e.clientY);
    const dropWorld = this.screenToWorld(e.clientX, e.clientY);
    const paletteEl = document.getElementById('palette');
    const paletteRect = paletteEl?.getBoundingClientRect();
    const overPalette = paletteRect && e.clientX >= paletteRect.left && e.clientX <= paletteRect.right &&
      e.clientY >= paletteRect.top && e.clientY <= paletteRect.bottom;

    this.layerHint.innerHTML = '';
    this.layerFloating.innerHTML = '';
    paletteEl?.classList.remove('trash-active');

    if (drag.fromPalette) {
      if (overPalette && !drag.moved) {
        this.drag = null;
        this.layerHint.innerHTML = '';
        this.layerFloating.innerHTML = '';
        return;
      }
      const blockId = addBlockAt(this.project, target, drag.opcode, dropWorld.x - 16, dropWorld.y - H / 2);
      this.drag = null;
      this.hidden = new Set();
      if (snap && snap.type !== 'slot') {
        this.attachStackTo(blockId, snap);
      } else if (snap && snap.type === 'slot') {
        this.attachReporterTo(blockId, snap);
      }
      this.render();
      this.onChange('add-block');
      return;
    }

    const block = target.blocks[drag.blockId];
    if (!block) { this.drag = null; return; }

    if (overPalette) {
      deleteBlockCascade(target, drag.blockId);
      this.drag = null;
      this.hidden = new Set();
      this.render();
      this.onChange('delete-block');
      return;
    }

    if (snap && snap.type === 'slot' && drag.kind === 'reporter') {
      this.attachReporterTo(drag.blockId, snap);
    } else if (snap) {
      this.attachStackTo(drag.blockId, snap);
    } else {
      block.topLevel = true;
      block.x = Math.round(this.ghostPos?.x ?? dropWorld.x);
      block.y = Math.round(this.ghostPos?.y ?? dropWorld.y);
      if (drag.kind === 'reporter') block.topLevel = true;
    }
    this.drag = null;
    this.hidden = new Set();
    this.render();
    this.onChange('move-block');
    this.onStatus('ready');
  }

  attachStackTo(blockId, snap) {
    const target = this.target;
    const block = target.blocks[blockId];
    const parent = target.blocks[snap.parentId];
    if (!block || !parent) return;
    if (snap.type === 'next') {
      if (this.wouldCycle(target, blockId, snap.parentId)) return;
      parent.next = blockId;
      block.parent = snap.parentId;
      block.topLevel = false;
      delete block.x;
      delete block.y;
    } else if (snap.type === 'substack') {
      if (this.wouldCycle(target, blockId, snap.parentId)) return;
      parent.inputs[snap.input] = [2, blockId];
      block.parent = snap.parentId;
      block.topLevel = false;
      delete block.x;
      delete block.y;
    }
    invalidateProcedures(target);
  }

  attachReporterTo(blockId, snap) {
    const target = this.target;
    const block = target.blocks[blockId];
    const parent = target.blocks[snap.parentId];
    if (!block || !parent) return;
    if (this.wouldCycle(target, blockId, snap.parentId)) return;
    const existing = parent.inputs?.[snap.input];
    if (existing && typeof existing[1] === 'string' && target.blocks[existing[1]]) {
      // push the old reporter back to the workspace
      const old = target.blocks[existing[1]];
      old.parent = null;
      old.topLevel = true;
      old.x = (parent.topLevel ? parent.x || 0 : 60) + 40;
      old.y = (parent.topLevel ? parent.y || 0 : 60) + 120;
    }
    parent.inputs[snap.input] = [3, blockId];
    block.parent = snap.parentId;
    block.topLevel = false;
    delete block.x;
    delete block.y;
    invalidateProcedures(target);
  }

  wouldCycle(target, childId, parentId) {
    let cur = target.blocks[parentId];
    let guard = 0;
    while (cur && guard++ < 500) {
      if (cur === target.blocks[childId]) return true;
      if (!cur.parent) return false;
      cur = target.blocks[cur.parent];
    }
    return false;
  }

  /* --------------------------------------------------------------- context */
  openContextMenu(blockId, clientX, clientY) {
    if (!blockId) return;
    this.closeOverlay();
    const menu = document.createElement('div');
    menu.className = 'overlay-menu';
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    const target = this.target;
    const block = target.blocks[blockId];
    if (!block) return;
    const items = [
      { label: 'تكرار', run: () => { duplicateStack(target, blockId); this.render(); this.onChange('duplicate'); } },
      { label: block.topLevel ? 'حذف السكربت' : 'حذف اللبنة', run: () => { deleteBlockCascade(target, blockId); this.render(); this.onChange('delete'); } },
      { label: 'مساعدة', run: () => this.onToast(getDef(block.opcode).opcode, 'info') },
    ];
    for (const item of items) {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.onclick = () => { item.run(); this.closeOverlay(); };
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    this.overlayMenu = menu;
    const off = (ev) => {
      if (!menu.contains(ev.target)) { this.closeOverlay(); document.removeEventListener('pointerdown', off); }
    };
    setTimeout(() => document.addEventListener('pointerdown', off), 0);
  }

  /* ------------------------------------------- palette drag coordination */
  startFromPalette(opcode, ev) {
    this.beginPaletteDrag(opcode, ev);
    this.drag.fromPalette = true;
  }

  /* ------------------------------------------------------------ cursors */
  renderRemoteCursors(peers) {
    if (!this.cursorLayer) return;
    this.cursorLayer.innerHTML = '';
    for (const peer of peers || []) {
      if (!peer.cursor) continue;
      const el = document.createElement('div');
      el.className = 'remote-cursor';
      el.style.transform = `translate(${peer.cursor.sx}px, ${peer.cursor.sy}px)`;
      el.innerHTML = `<svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1l14 7-6 1.6L6.4 18z" fill="${peer.color}" stroke="#ffffff" stroke-width="1.2"/></svg>` +
        `<span class="rc-label" style="background:${peer.color}">${esc(peer.name)}</span>`;
      this.cursorLayer.appendChild(el);
    }
  }
}

export { MENU_LABELS, CATEGORY_COLORS, KEY_OPTIONS, setInput, addBlock, allProcedures, createCustomBlockCall, shade };
