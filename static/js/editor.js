/**
 * CRAFT WARP — editor controller.
 * Wires the UI shell, project model, VM, renderer, workspace and collaboration
 * together. Everything is event driven so remote edits and local edits share
 * exactly one code path.
 */
import { VM, normalizeKey } from './vm.js';
import { Renderer, drawCostumeToCanvas, assetKey } from './renderer.js';
import { AudioEngine, SOUND_LIBRARY } from './audio.js';
import { Workspace } from './workspace.js';
import { CollabClient } from './collab.js';
import { openLibrary, openPaint } from './library-ui.js';
import { exportSb3, importProjectFile } from './sb3.js';
import {
  createEmptyProject, ensureProjectShape, loadLocalProject, saveLocalProject, clearLocalProject,
  spriteFromLibrary, backdropFromLibrary, costumeFromLibrary, soundFromLibrary, addAsset,
  duplicateTarget, deleteTarget, moveTargetLayer, newStage, projectStats, uid,
  uniqueCostumeName, uniqueSoundName, allProcedures, createCustomBlock, createCustomBlockCall,
  findProcedure,
} from './project.js';
import { addBlockAt } from './project.js';
import { paintStandaloneBlock } from './blockview.js';
import { CATEGORIES, BLOCKS, getDef } from './blocks.js';
import { t, applyI18n, toggleLang, onLangChange, getLang } from './i18n.js';
import { $, $$, toast, openModal, closeModal, confirmDialog, promptDialog, escapeHtml, debounce, fmtTime, initials, downloadText } from './ui.js';
import { dataUrlToBytes, downloadBlob, readFileAsDataUrl } from './zip.js';
import { SPRITE_LIBRARY, BACKDROP_LIBRARY } from './library.js';

const RELEASES_URL = 'https://github.com/ayoubkadouch82-code/craftou-warp/releases/latest';
const REPO_URL = 'https://github.com/ayoubkadouch82-code/craftou-warp';

const CATEGORY_LABELS_AR = {
  motion: 'الحركة', looks: 'المظهر', sound: 'الصوت', events: 'الأحداث', control: 'التحكم',
  sensing: 'الاستشعار', operators: 'العمليات', variables: 'المتغيرات', myblocks: 'لبناتي',
};

export class Editor {
  constructor() {
    this.project = ensureProjectShape(loadLocalProject() || createEmptyProject());
    this.currentTargetId = (this.project.targets[1] || this.project.targets[0]).id;
    this.category = 'motion';
    this.pendingAssets = {};
    this.sentAssets = new Set();
    this.peers = new Map();
    this.chatMessages = [];
    this.activity = [];
    this.unreadChat = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.remoteQueue = [];
    this.applyingRemote = false;
    this.savedState = 'saved';
    this.zoom = 1;
    this.showSmallStage = false;

    this.audio = new AudioEngine(this.project);
    this.renderer = new Renderer($('#stage'), null, this.project);
    this.vm = new VM(this.project, {
      audio: this.audio,
      renderer: this.renderer,
      onAsk: (q) => this.ask(q),
      onTargetsChanged: () => this.refreshSpritePane(),
      username: localStorage.getItem('cw-name') || 'craftwarper',
    });
    this.renderer.vm = this.vm;

    this.workspace = new Workspace({
      project: this.project,
      svg: $('#block-canvas'),
      overlay: $('#input-overlay'),
      emptyEl: $('#ws-empty'),
      trashEl: $('#palette-trash'),
      cursorLayer: $('#cursor-layer'),
      getTarget: () => this.target,
      onChange: (kind) => this.onWorkspaceChange(kind),
      toast: (m, k) => toast(m, k),
      onStatus: () => {},
    });

    this.collab = new CollabClient({
      onStatus: (s) => this.onCollabStatus(s),
      onEvent: (type, payload) => this.onCollabEvent(type, payload),
      onPresence: (peers, msg) => this.onPresence(peers, msg),
      onChat: (msg) => this.receiveChat(msg),
      toast: (m, k) => toast(m, k),
    });

    this.initUI();
    this.switchTarget(this.currentTargetId);
    this.refreshPresence();
    this.markSaved();
    this.undoStack = [this.snapshot()];
    this.renderer.preload();
    this.renderer.start();
    this.startAutosave();
    this.loadConfig();
    this.setupBoot();
  }

  /* ==================================================================== misc */
  get target() {
    return this.project.targets.find((x) => x.id === this.currentTargetId) || this.project.targets[0];
  }

  get stage() { return this.project.targets[0]; }

  loadConfig() {
    fetch('/api/config').then((r) => (r.ok ? r.json() : null)).then((cfg) => {
      if (!cfg) return;
      this.config = cfg;
      const exe = $('#btn-exe');
      this.releaseUrl = cfg.releaseUrl || RELEASES_URL;
      if (exe) exe.title = `${t('downloadExe')} — ${this.releaseUrl}`;
      const engine = $('#bb-engine');
      if (engine) engine.textContent = `المحرك: ${cfg.runtime === 'rust' ? 'Rust' : cfg.runtime || 'Rust'} v${cfg.version || '0.1.0'}`;
    }).catch(() => {
      this.releaseUrl = RELEASES_URL;
    });
  }

  setupBoot() {
    const boot = $('#boot');
    if (boot) {
      setTimeout(() => {
        boot.classList.add('gone');
        setTimeout(() => boot.remove(), 500);
      }, 420);
    }
  }

  startAutosave() {
    this.autosave = debounce(() => {
      const ok = saveLocalProject(this.project);
      this.markSaved(ok ? 'saved' : 'error');
    }, 900);
    setInterval(() => {
      if (this.savedState === 'dirty') this.autosave();
    }, 6000);
  }

  markSaved(state = 'saved') {
    this.savedState = state;
    const el = $('#save-state');
    if (!el) return;
    el.textContent = state === 'dirty' ? t('unsaved') : state === 'error' ? 'تعذر الحفظ' : t('saved');
    el.style.opacity = state === 'dirty' ? '1' : '.8';
  }

  setStatus(text) {
    const el = $('#bb-status');
    if (el) el.textContent = text;
  }

  /* ==================================================================== init */
  initUI() {
    applyI18n();
    this.buildCategoryRail();
    this.buildPalette();
    this.renderSpritePane();
    this.renderTabs();
    this.bindTopbar();
    this.bindMenus();
    this.bindSpriteControls();
    this.bindStage();
    this.bindTabs();
    this.bindChat();
    this.bindShortcuts();
    onLangChange(() => {
      this.buildCategoryRail();
      this.buildPalette();
      this.renderSpritePane();
      this.renderTabs();
      this.renderChat();
    });
    const svg = $('#block-canvas');
    svg.addEventListener('pointermove', (ev) => {
      if (!this.collab.connected) return;
      const rect = svg.getBoundingClientRect();
      this.collab.sendCursor(ev.clientX - rect.left, ev.clientY - rect.top, this.currentTargetId);
    });
    window.addEventListener('pointerup', () => { if (!this.workspace.drag) this.flushRemoteQueue(); });
    const nameInput = $('#project-name');
    nameInput.value = this.project.name;
    nameInput.addEventListener('input', () => {
      this.project.name = nameInput.value;
      this.markDirty('name');
      this.queueCollabSync();
    });
  }

  /* ================================================================ palette */
  buildCategoryRail() {
    const rail = $('#category-rail');
    rail.innerHTML = '';
    for (const cat of CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = `cat-btn ${cat.id === this.category ? 'active' : ''}`;
      btn.dataset.cat = cat.id;
      btn.style.setProperty('--c', cat.color);
      btn.innerHTML = `<span class="dot"></span><span>${escapeHtml(CATEGORY_LABELS_AR[cat.id] || cat.label)}</span>`;
      btn.onclick = () => {
        this.category = cat.id;
        $$('.cat-btn').forEach((b) => b.classList.toggle('active', b.dataset.cat === cat.id));
        this.buildPalette();
      };
      rail.appendChild(btn);
    }
  }

  buildPalette() {
    const host = $('#palette-scroll');
    host.innerHTML = '';
    const target = this.target;
    const defs = Object.values(BLOCKS).filter((d) => d.cat === this.category && d.opcode !== 'argument_reporter_string_number' && d.opcode !== 'argument_reporter_boolean');
    const section = document.createElement('div');
    section.className = 'palette-section';

    if (this.category === 'variables') {
      const mk = document.createElement('button');
      mk.className = 'palette-btn';
      mk.textContent = `＋ ${t('makeVar')}`;
      mk.onclick = () => this.workspace.promptNewVariable();
      section.appendChild(mk);
      const ml = document.createElement('button');
      ml.className = 'palette-btn';
      ml.textContent = `＋ ${t('makeList')}`;
      ml.onclick = () => this.workspace.promptNewList();
      section.appendChild(ml);
    }

    if (this.category === 'myblocks') {
      const mk = document.createElement('button');
      mk.className = 'palette-btn';
      mk.textContent = '＋ إنشاء لبنة';
      mk.onclick = () => this.createCustomBlockFlow();
      section.appendChild(mk);
      for (const proc of allProcedures(target)) {
        const item = document.createElement('button');
        item.className = 'palette-btn';
        item.style.background = '#ffe9ee';
        item.style.borderColor = '#ffb3c2';
        item.style.color = '#b13a55';
        item.textContent = proc.proccode.replace(/%[nsb]/g, (m) => (m === '%n' ? 'رقم' : m === '%s' ? 'نص' : 'شرط'));
        item.onclick = () => {
          const id = createCustomBlockCall(this.project, target, proc.proccode, 80, 80);
          this.workspace.render();
          this.onWorkspaceChange('add-call');
          void id;
        };
        section.appendChild(item);
      }
    }

    for (const def of defs) {
      const wrapper = document.createElement('div');
      wrapper.className = 'palette-block';
      wrapper.dataset.opcode = def.opcode;
      const fake = this.makePaletteBlock(def.opcode);
      wrapper.innerHTML = this.paintPaletteSvg(fake);
      wrapper.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        this.workspace.beginPaletteDrag(def.opcode, ev);
      });
      section.appendChild(wrapper);
    }

    if (!defs.length && this.category !== 'myblocks' && this.category !== 'variables') {
      section.innerHTML += `<p class="hint">${t('nothingHere')}</p>`;
    }
    host.appendChild(section);
    this.renderWorkspace();
  }

  makePaletteBlock(opcode) {
    const def = getDef(opcode);
    const { defaultBlockData } = BLOCKS[opcode] ? { defaultBlockData: null } : { defaultBlockData: null };
    void defaultBlockData;
    const fields = {};
    const inputs = {};
    for (const part of def.parts || []) {
      if (!part || typeof part === 'string') continue;
      if (part.f) {
        if (part.k === 'var') fields[part.f] = ['v', Object.values(this.target.variables || {})[0]?.[0] || 'my variable'];
        else if (part.k === 'list') fields[part.f] = ['l', Object.values(this.target.lists || {})[0]?.[0] || 'my list'];
        else if (part.k === 'color') fields[part.f] = [part.v || '#4c97ff'];
        else fields[part.f] = [part.v ?? part.opts?.[0] ?? ''];
      } else if (part.i && part.k === 'menu') {
        fields[part.i] = [this.paletteMenuValue(part)];
      } else if (part.i && part.k === 'number') {
        inputs[part.i] = [1, [4, String(part.v ?? '10')]];
      } else if (part.i && part.k === 'text') {
        inputs[part.i] = [1, [10, String(part.v ?? 'hello')]];
      }
    }
    return { opcode, inputs, fields, next: null, parent: null, topLevel: true, x: 0, y: 0 };
  }

  paletteMenuValue(part) {
    const target = this.target;
    switch (part.menu) {
      case 'costumes': return target.costumes?.[0]?.name || 'costume1';
      case 'backdrops': return this.stage.costumes?.[0]?.name || 'backdrop1';
      case 'sounds': return target.sounds?.[0]?.name || 'pop';
      case 'broadcasts': return Object.values(this.stage.broadcasts || {})[0] || 'message1';
      default: return part.v || '';
    }
  }

  paintPaletteSvg(block) {
    const painted = paintStandaloneBlock(this.project, this.target, block, 0, 0);
    const w = Math.ceil(painted.width) + 6;
    const h = Math.ceil(painted.height) + 6;
    return `<svg width="${w}" height="${h}" viewBox="-2 -2 ${w} ${h}">${painted.svg}</svg>`;
  }

  /* ================================================================ sprites */
  renderSpritePane() {
    const grid = $('#sprite-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const stage = this.project.targets[0];
    const stageTile = this.makeSpriteTile(stage, true);
    grid.appendChild(stageTile);
    for (const sprite of this.project.targets.slice(1)) {
      grid.appendChild(this.makeSpriteTile(sprite, false));
    }
  }

  refreshSpritePane() {
    this.renderSpritePane();
  }

  makeSpriteTile(target, isStage) {
    const tile = document.createElement('div');
    tile.className = `sprite-tile${isStage ? ' stage-tile' : ''}${target.id === this.currentTargetId ? ' selected' : ''}`;
    tile.dataset.id = target.id;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    tile.appendChild(canvas);
    const costume = (target.costumes || [])[target.currentCostume || 0] || (target.costumes || [])[0];
    if (costume) drawCostumeToCanvas(canvas, this.project, costume, { background: isStage ? '#eef6ff' : '#ffffff' });
    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = isStage ? t('stage') : target.name;
    tile.appendChild(name);

    for (const peer of this.peers.values()) {
      if (peer.cursor?.sprite === target.id && peer.id !== this.collab.id) {
        const tag = document.createElement('span');
        tag.className = 'peer-tag';
        tag.style.background = peer.color;
        tag.textContent = peer.name;
        tile.appendChild(tag);
        break;
      }
    }

    tile.onclick = () => this.switchTarget(target.id);
    tile.oncontextmenu = (e) => {
      e.preventDefault();
      if (isStage) return;
      this.openSpriteMenu(target, e.clientX, e.clientY);
    };
    return tile;
  }

  switchTarget(id) {
    this.currentTargetId = id;
    const target = this.target;
    $$('.sprite-tile').forEach((tile) => tile.classList.toggle('selected', tile.dataset.id === id));
    this.workspace.setTargetId?.(id);
    this.renderWorkspace();
    this.buildPalette();
    this.updateSpriteInfo();
    this.refreshTabs();
  }

  openSpriteMenu(target, x, y) {
    const menu = document.createElement('div');
    menu.className = 'overlay-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const actions = [
      { label: 'تكرار', run: () => { const copy = duplicateTarget(this.project, target); this.renderSpritePane(); this.switchTarget(copy.id); this.afterStructuralChange(); } },
      { label: 'حذف', run: () => this.deleteSprite(target) },
      { label: 'تقديم', run: () => { moveTargetLayer(this.project, target, 1); this.renderSpritePane(); this.markDirty('layer'); } },
      { label: 'تأخير', run: () => { moveTargetLayer(this.project, target, -1); this.renderSpritePane(); this.markDirty('layer'); } },
    ];
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.onclick = () => { menu.remove(); a.run(); };
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    setTimeout(() => {
      const off = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('pointerdown', off); } };
      document.addEventListener('pointerdown', off);
    }, 0);
  }

  updateSpriteInfo() {
    const target = this.target;
    const isStage = !!target.isStage;
    $('#si-name').value = isStage ? t('stage') : target.name;
    $('#si-name').disabled = isStage;
    $('#si-x').value = Math.round(target.x || 0);
    $('#si-y').value = Math.round(target.y || 0);
    $('#si-size').value = Math.round(target.size ?? 100);
    $('#si-dir').value = Math.round(target.direction ?? 90);
    ['#si-x', '#si-y', '#si-size', '#si-dir'].forEach((sel) => { $(sel).disabled = isStage; });
    $('#si-visible').classList.toggle('on', target.visible !== false);
    $('#si-rot').classList.toggle('on', target.rotationStyle !== "don't rotate");
  }

  bindSpriteControls() {
    const apply = () => {
      const target = this.target;
      if (target.isStage) return;
      target.name = $('#si-name').value.trim() || target.name;
      target.x = Number($('#si-x').value) || 0;
      target.y = Number($('#si-y').value) || 0;
      target.size = Math.max(1, Number($('#si-size').value) || 100);
      target.direction = Number($('#si-dir').value) || 0;
      this.renderSpritePane();
      this.buildPalette();
      this.markDirty('sprite-info');
    };
    ['#si-name', '#si-x', '#si-y', '#si-size', '#si-dir'].forEach((sel) => {
      $(sel).addEventListener('change', apply);
    });
    $('#si-visible').onclick = () => {
      this.target.visible = this.target.visible === false;
      this.updateSpriteInfo();
      this.markDirty('visible');
    };
    $('#si-rot').onclick = () => {
      const styles = ['all around', 'left-right', "don't rotate"];
      const cur = styles.indexOf(this.target.rotationStyle || 'all around');
      this.target.rotationStyle = styles[(cur + 1) % styles.length];
      this.updateSpriteInfo();
      this.markDirty('rotation-style');
    };

    $('#btn-choose-sprite').onclick = () => openLibrary(this, 'sprite');
    const editor = this;
    $('#btn-paint-sprite').onclick = () => {
      openModal({
        title: 'كائن جديد',
        width: 460,
        body: `<p class="muted">اختر طريقة الإنشاء:</p>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" data-act="lib">من المكتبة</button>
            <button class="btn" data-act="paint">ارسم مظهرًا</button>
            <button class="btn" data-act="upload">ارفع صورة</button>
            <button class="btn" data-act="blank">كائن فارغ</button>
          </div>`,
        onMount(body) {
          body.querySelector('[data-act="lib"]').onclick = () => { closeModal(); openLibrary(editor, 'sprite'); };
          body.querySelector('[data-act="paint"]').onclick = () => { closeModal(); editor.paintNewSprite(); };
          body.querySelector('[data-act="upload"]').onclick = () => { closeModal(); $('#btn-upload-sprite').click(); };
          body.querySelector('[data-act="blank"]').onclick = () => { closeModal(); editor.createBlankSprite(); };
        },
      });
    };
    $('#btn-upload-sprite').onclick = () => this.uploadSprite();
    $('#btn-dup-sprite').onclick = () => {
      if (this.target.isStage) return;
      const copy = duplicateTarget(this.project, this.target);
      this.renderSpritePane();
      this.switchTarget(copy.id);
      this.afterStructuralChange();
    };
    $('#btn-del-sprite').onclick = () => {
      if (this.target.isStage) return toast('لا يمكن حذف الخلفية', 'err');
      this.deleteSprite(this.target);
    };
  }

  paintNewSprite() {
    const sprite = spriteFromLibrary(this.project, { name: 'كائن مرسوم', costumes: [] });
    this.pendingAssets = this.pendingAssets || {};
    this.renderSpritePane();
    this.switchTarget(sprite.id);
    openPaint(this, { asBackdrop: false });
    this.afterStructuralChange();
  }

  createBlankSprite() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="12" fill="#4c97ff"/></svg>`;
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const sprite = spriteFromLibrary(this.project, {
      name: 'كائن جديد',
      costumes: [{ name: 'costume1', dataUrl, ext: 'svg', width: 80, height: 80, rotationCenterX: 40, rotationCenterY: 40 }],
    });
    this.renderSpritePane();
    this.switchTarget(sprite.id);
    this.afterStructuralChange();
  }

  async uploadSprite() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      const dims = await imageSize(dataUrl);
      const ext = file.name.split('.').pop().toLowerCase() || 'png';
      const sprite = spriteFromLibrary(this.project, {
        name: file.name.replace(/\.[^.]+$/, '') || 'Sprite',
        costumes: [{ name: 'costume1', dataUrl, ext, width: dims.w, height: dims.h, rotationCenterX: dims.w / 2, rotationCenterY: dims.h / 2 }],
      });
      this.renderSpritePane();
      this.switchTarget(sprite.id);
      this.afterStructuralChange();
      toast(t('sb3Imported'), 'ok');
    };
    input.click();
  }

  async deleteSprite(target) {
    const ok = await confirmDialog(`حذف الكائن «${target.name}»؟`);
    if (!ok) return;
    deleteTarget(this.project, target);
    if (this.currentTargetId === target.id) this.currentTargetId = this.project.targets[1]?.id || 'stage';
    this.renderSpritePane();
    this.switchTarget(this.currentTargetId);
    this.afterStructuralChange(target.id);
  }

  /* ================================================================== stage */
  bindStage() {
    const canvas = $('#stage');
    const updateMouse = (ev) => {
      const p = this.renderer.toStage(ev.clientX, ev.clientY);
      this.vm.mouse.x = p.x;
      this.vm.mouse.y = p.y;
    };
    canvas.addEventListener('pointermove', (ev) => {
      updateMouse(ev);
      if (this.stageDrag) {
        const p = this.renderer.toStage(ev.clientX, ev.clientY);
        const target = this.stageDrag.target;
        target.x = this.stageDrag.ox + (p.x - this.stageDrag.start.x);
        target.y = this.stageDrag.oy + (p.y - this.stageDrag.start.y);
        this.renderer.invalidate();
        this.updateSpriteInfo();
        this.markDirty('stage-drag', { snapshot: false });
      }
    });
    canvas.addEventListener('pointerdown', (ev) => {
      const p = this.renderer.toStage(ev.clientX, ev.clientY);
      this.vm.mouse.x = p.x;
      this.vm.mouse.y = p.y;
      this.vm.mouse.down = true;
      const sprite = this.renderer.pickAt(p.x, p.y);
      if (sprite) {
        this.switchTarget(sprite.id);
        this.vm.fireHats('event_whenthisspriteclicked', (block, t) => t === sprite);
        if (sprite.dragMode !== 'not draggable') {
          this.stageDrag = { target: sprite, start: p, ox: sprite.x || 0, oy: sprite.y || 0 };
        }
      }
      canvas.setPointerCapture?.(ev.pointerId);
    });
    const endDrag = () => {
      this.vm.mouse.down = false;
      if (this.stageDrag) {
        this.stageDrag = null;
        this.markDirty('stage-move');
      }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointerleave', () => { this.vm.mouse.down = false; });

    $('#btn-green-flag').onclick = () => this.greenFlag();
    $('#btn-stop').onclick = () => { this.vm.stopAll(); this.renderer.invalidate(); this.setStatus(t('ready')); };
    $('#btn-small-stage').onclick = () => {
      this.showSmallStage = !this.showSmallStage;
      document.body.classList.toggle('compact-stage', this.showSmallStage);
      setTimeout(() => this.renderer.resize(), 40);
    };
    $('#ask-send').onclick = () => this.submitAsk();
    $('#ask-input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.submitAsk(); });
  }

  greenFlag() {
    this.renderer.preload();
    this.vm.greenFlag();
    this.renderer.invalidate();
    this.setStatus('قيد التشغيل');
  }

  ask(question) {
    return new Promise((resolve) => {
      const bar = $('#stage-ask');
      const input = $('#ask-input');
      bar.hidden = false;
      input.value = '';
      input.placeholder = question || 'اكتب إجابتك…';
      input.focus();
      this.askResolve = resolve;
    });
  }

  submitAsk() {
    const bar = $('#stage-ask');
    if (bar.hidden) return;
    const value = $('#ask-input').value;
    bar.hidden = true;
    if (this.askResolve) {
      this.askResolve(value);
      this.askResolve = null;
    }
  }

  /* ================================================================== tabs */
  bindTabs() {
    $$('.tab').forEach((tab) => {
      tab.onclick = () => {
        $$('.tab').forEach((x) => x.classList.toggle('active', x === tab));
        $$('.tab-pane').forEach((pane) => { pane.hidden = pane.dataset.pane !== tab.dataset.tab; });
        this.refreshTabs();
      };
    });
    $('#btn-chat').onclick = () => this.toggleChat();
    $('#chat-close').onclick = () => this.toggleChat(false);
    $('#btn-collab-side').onclick = () => this.openTeamModal();
  }

  renderTabs() {
    $$('.tab').forEach((tab) => {
      tab.textContent = t(tab.dataset.tab === 'collab' ? 'team' : tab.dataset.tab);
    });
  }

  refreshTabs() {
    const active = $('.tab.active')?.dataset.tab || 'code';
    if (active === 'costumes') this.renderCostumes();
    if (active === 'sounds') this.renderSounds();
    if (active === 'collab') this.renderTeamPane();
  }

  renderCostumes() {
    const pane = $('[data-pane="costumes"]');
    const target = this.target;
    pane.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'asset-grid';
    (target.costumes || []).forEach((costume, index) => {
      const card = document.createElement('div');
      card.className = `asset-card${index === (target.currentCostume || 0) ? ' selected' : ''}`;
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      drawCostumeToCanvas(canvas, this.project, costume);
      card.appendChild(canvas);
      const name = document.createElement('div');
      name.className = 'ac-name';
      name.textContent = costume.name;
      card.appendChild(name);
      const tools = document.createElement('div');
      tools.className = 'ac-tools';
      const rename = document.createElement('button');
      rename.textContent = '✎';
      rename.title = 'إعادة تسمية';
      rename.onclick = async (e) => {
        e.stopPropagation();
        const next = await promptDialog('اسم المظهر', costume.name);
        if (!next) return;
        costume.name = next;
        this.markDirty('costume-name');
        this.renderCostumes();
      };
      const del = document.createElement('button');
      del.textContent = '🗑';
      del.title = 'حذف';
      del.onclick = (e) => {
        e.stopPropagation();
        if ((target.costumes || []).length <= 1) return toast('يجب أن يبقى مظهر واحد على الأقل', 'err');
        target.costumes = target.costumes.filter((c) => c !== costume);
        target.currentCostume = Math.max(0, Math.min(target.costumes.length - 1, target.currentCostume || 0));
        this.renderCostumes();
        this.renderSpritePane();
        this.markDirty('costume-delete');
      };
      tools.appendChild(rename);
      tools.appendChild(del);
      card.appendChild(tools);
      card.onclick = () => {
        target.currentCostume = index;
        this.renderCostumes();
        this.renderSpritePane();
        this.renderer.invalidate();
        this.markDirty('costume-select');
      };
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginTop = '10px';
    row.innerHTML = `<button class="btn" data-act="lib">＋ ${t('addFromLibrary')}</button>
      <button class="btn" data-act="upload">↑ ${t('upload')}</button>
      <button class="btn" data-act="paint">✎ ${t('paint')}</button>`;
    row.querySelector('[data-act="lib"]').onclick = () => openLibrary(this, target.isStage ? 'backdrop' : 'sprite');
    row.querySelector('[data-act="upload"]').onclick = () => this.uploadCostume();
    row.querySelector('[data-act="paint"]').onclick = () => openPaint(this, { asBackdrop: !!target.isStage });
    pane.appendChild(row);
    if (!(target.costumes || []).length) {
      pane.innerHTML += `<p class="hint">${t('noCostumes')}</p>`;
    }
  }

  async uploadCostume() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      const dims = await imageSize(dataUrl);
      const target = this.target;
      const ext = file.name.split('.').pop().toLowerCase() || 'png';
      const asset = addAsset(this.project, dataUrl, ext);
      this.trackAsset(asset.key);
      target.costumes.push({
        name: uniqueCostumeName(target, file.name.replace(/\.[^.]+$/, '') || 'costume'),
        assetId: asset.hash,
        md5ext: asset.key,
        dataFormat: ext,
        rotationCenterX: dims.w / 2,
        rotationCenterY: dims.h / 2,
        bitmapResolution: 1,
        width: dims.w,
        height: dims.h,
      });
      this.renderCostumes();
      this.renderSpritePane();
      this.markDirty('costume-add');
    };
    input.click();
  }

  addCostumeFromDataUrl(dataUrl, name) {
    const target = this.target;
    const asset = addAsset(this.project, dataUrl, 'png');
    this.trackAsset(asset.key);
    target.costumes = target.costumes || [];
    target.costumes.push({
      name: uniqueCostumeName(target, name || 'costume'),
      assetId: asset.hash,
      md5ext: asset.key,
      dataFormat: 'png',
      rotationCenterX: 240,
      rotationCenterY: 180,
      bitmapResolution: 1,
      width: 480,
      height: 360,
    });
    target.currentCostume = target.costumes.length - 1;
    this.renderCostumes();
    this.renderSpritePane();
    this.renderer.invalidate();
    this.markDirty('costume-add');
  }

  addBackdropFromDataUrl(dataUrl, name) {
    const asset = addAsset(this.project, dataUrl, 'png');
    this.trackAsset(asset.key);
    const stage = this.stage;
    stage.costumes = stage.costumes || [];
    stage.costumes.push({
      name: uniqueCostumeName(stage, name || 'backdrop'),
      assetId: asset.hash,
      md5ext: asset.key,
      dataFormat: 'png',
      rotationCenterX: 240,
      rotationCenterY: 180,
      bitmapResolution: 1,
      width: 480,
      height: 360,
    });
    stage.currentCostume = stage.costumes.length - 1;
    this.renderSpritePane();
    this.renderer.invalidate();
    if ($('.tab.active')?.dataset.tab === 'costumes') this.renderCostumes();
    this.markDirty('backdrop-add');
  }

  renderSounds() {
    const pane = $('[data-pane="sounds"]');
    const target = this.target;
    pane.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'asset-grid';
    (target.sounds || []).forEach((sound) => {
      const card = document.createElement('div');
      card.className = 'asset-card audio-card';
      const pill = document.createElement('div');
      pill.className = 'audio-pill';
      pill.textContent = '♪';
      pill.onclick = (e) => { e.stopPropagation(); this.previewSound(sound); };
      card.appendChild(pill);
      const name = document.createElement('div');
      name.className = 'ac-name';
      name.textContent = sound.name;
      card.appendChild(name);
      const tools = document.createElement('div');
      tools.className = 'ac-tools';
      const del = document.createElement('button');
      del.textContent = '🗑';
      del.onclick = (e) => {
        e.stopPropagation();
        target.sounds = target.sounds.filter((s) => s !== sound);
        this.renderSounds();
        this.markDirty('sound-delete');
      };
      tools.appendChild(del);
      card.appendChild(tools);
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginTop = '10px';
    row.innerHTML = `<button class="btn" data-act="lib">＋ ${t('addFromLibrary')}</button>
      <button class="btn" data-act="upload">↑ ${t('upload')}</button>
      <button class="btn" data-act="stop">■ ${t('stopAll')}</button>`;
    row.querySelector('[data-act="lib"]').onclick = () => openLibrary(this, 'sound');
    row.querySelector('[data-act="upload"]').onclick = () => this.uploadSound();
    row.querySelector('[data-act="stop"]').onclick = () => this.audio.stopAll();
    pane.appendChild(row);
    if (!(target.sounds || []).length) pane.innerHTML += `<p class="hint">${t('noSounds')}</p>`;
  }

  previewSound(sound) {
    const asset = this.project.assets[assetKey(sound)];
    if (asset) this.audio.playAsset(asset);
  }

  async uploadSound() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      const ext = file.name.split('.').pop().toLowerCase() || 'wav';
      const asset = addAsset(this.project, dataUrl, ext);
      this.trackAsset(asset.key);
      const target = this.target;
      target.sounds = target.sounds || [];
      target.sounds.push({
        name: uniqueSoundName(target, file.name.replace(/\.[^.]+$/, '') || 'sound'),
        assetId: asset.hash,
        md5ext: asset.key,
        dataFormat: ext,
        rate: 48000,
        sampleCount: 48000,
      });
      this.renderSounds();
      this.markDirty('sound-add');
    };
    input.click();
  }

  addSoundFromLibrary(entry, target = this.target) {
    const sound = soundFromLibrary(this.project, entry);
    target.sounds = target.sounds || [];
    target.sounds.push(sound);
    this.trackAsset(sound.md5ext);
    if ($('.tab.active')?.dataset.tab === 'sounds') this.renderSounds();
    this.markDirty('sound-add');
    toast(`تمت إضافة الصوت ${entry.name}`, 'ok');
  }

  addSpriteFromLibrary(entry) {
    const sprite = spriteFromLibrary(this.project, entry);
    for (const costume of sprite.costumes) this.trackAsset(costume.md5ext);
    this.renderSpritePane();
    this.switchTarget(sprite.id);
    this.afterStructuralChange();
    this.announce(`أضاف الكائن ${sprite.name}`);
    toast(`تمت إضافة الكائن ${sprite.name}`, 'ok');
    return sprite;
  }

  addBackdropFromLibrary(entry) {
    const costume = backdropFromLibrary(this.project, entry);
    this.trackAsset(costume.md5ext);
    this.stage.currentCostume = this.stage.costumes.length - 1;
    this.renderSpritePane();
    this.renderer.invalidate();
    if ($('.tab.active')?.dataset.tab === 'costumes') this.renderCostumes();
    this.markDirty('backdrop-add');
    toast(`تمت إضافة الخلفية ${entry.name}`, 'ok');
  }

  /* ============================================================ workspace */
  renderWorkspace() {
    this.workspace.project = this.project;
    this.workspace.render();
  }

  onWorkspaceChange(kind) {
    this.markDirty(kind);
    this.queueCollabSync();
  }

  afterStructuralChange(removedId = null) {
    this.buildPalette();
    this.renderSpritePane();
    this.refreshTabs();
    this.renderer.invalidate();
    this.markDirty('structure');
    if (this.collab.connected) {
      this.queueCollabSync({ structure: true, removedId });
    }
  }

  /* ============================================================ persistence */
  snapshot() {
    return JSON.stringify({
      name: this.project.name,
      targets: this.project.targets,
      monitors: this.project.monitors,
      extensions: this.project.extensions,
      meta: this.project.meta,
    });
  }

  markDirty(reason = 'edit', { snapshot = true } = {}) {
    this.markSaved('dirty');
    this.autosave();
    if (snapshot && !this.applyingRemote) {
      this.historyPush();
    }
    if (!this.applyingRemote) {
      this.renderer.invalidate();
      this.updateSpriteInfo();
      this.queueCollabSync();
    }
    void reason;
  }

  historyPush() {
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = setTimeout(() => this.flushHistory(), 350);
  }

  flushHistory() {
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = null;
    const snap = this.snapshot();
    if (this.undoStack[this.undoStack.length - 1] === snap) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    this.flushHistory();
    if (this.undoStack.length < 2) return toast('لا يوجد ما يمكن التراجع عنه', 'info');
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    this.restoreSnapshot(prev);
    toast('تراجع', 'info', 1200);
  }

  redo() {
    if (!this.redoStack.length) return toast('لا يوجد إعادة', 'info', 1200);
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    this.restoreSnapshot(next);
    toast('إعادة', 'info', 1200);
  }

  restoreSnapshot(json) {
    if (!json) return;
    try {
      const data = JSON.parse(json);
      this.applyingRemote = true;
      this.project.name = data.name;
      this.project.targets = data.targets;
      this.project.monitors = data.monitors || [];
      this.project.extensions = data.extensions || [];
      this.vm.project = this.project;
      this.renderer.setProject(this.project);
      this.currentTargetId = this.project.targets.find((x) => x.id === this.currentTargetId)?.id || this.project.targets[0].id;
      $('#project-name').value = this.project.name;
      this.renderSpritePane();
      this.buildPalette();
      this.renderWorkspace();
      this.updateSpriteInfo();
      this.refreshTabs();
      this.renderer.invalidate();
    } finally {
      this.applyingRemote = false;
    }
    this.markSaved('dirty');
    this.queueCollabSync();
  }

  loadProject(project, { fromRemote = false } = {}) {
    this.applyingRemote = fromRemote;
    this.project = ensureProjectShape(project);
    this.vm.project = this.project;
    this.vm.clones = [];
    this.vm.threads = [];
    this.vm.running = false;
    this.renderer.setProject(this.project);
    this.audio.setProject(this.project);
    this.renderer.preload();
    this.currentTargetId = (this.project.targets[1] || this.project.targets[0]).id;
    $('#project-name').value = this.project.name;
    this.workspace.setProject(this.project);
    this.workspace.targetId = this.currentTargetId;
    this.renderSpritePane();
    this.buildPalette();
    this.renderWorkspace();
    this.updateSpriteInfo();
    this.refreshTabs();
    this.renderer.invalidate();
    this.applyingRemote = false;
    this.markSaved(fromRemote ? 'saved' : 'dirty');
    this.undoStack = [this.snapshot()];
    this.redoStack = [];
    if (!fromRemote) saveLocalProject(this.project);
  }

  async saveToServer() {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: this.project.name, project: this.project }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      toast(`${t('savedServer')} (${data.id})`, 'ok');
      this.markSaved('saved');
    } catch (err) {
      toast(`${t('noServer')}: ${err.message}`, 'err');
    }
  }

  async openServerProjects() {
    const editor = this;
    let list = [];
    try {
      const res = await fetch('/api/projects');
      list = (await res.json()).projects || [];
    } catch {
      toast(t('noServer'), 'err');
      return;
    }
    const rows = list.length
      ? list.map((p) => `<div class="asset-card" style="flex-direction:row;align-items:center;gap:10px;padding:8px" data-id="${escapeHtml(p.id)}">
          <div style="flex:1">
            <div style="font-size:12.5px;font-weight:700">${escapeHtml(p.name)}</div>
            <div class="muted">${new Date((p.updated || 0) * 1000).toLocaleString()} • ${p.sprites || 0} كائنات</div>
          </div>
          <button class="btn primary" data-act="open">فتح</button>
          <button class="btn danger" data-act="del">حذف</button>
        </div>`).join('')
      : `<p class="hint">${t('nothingHere')}</p>`;
    const modal = openModal({
      title: t('openServer'),
      width: 560,
      body: `<div style="display:flex;flex-direction:column;gap:8px">${rows}</div>`,
      onMount(body) {
        body.querySelectorAll('[data-id]').forEach((row) => {
          const id = row.dataset.id;
          row.querySelector('[data-act="open"]').onclick = async () => {
            const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
            if (!res.ok) return toast('تعذر الفتح', 'err');
            const doc = await res.json();
            editor.loadProject(doc.project);
            toast(t('projectLoaded'), 'ok');
            modal.close();
          };
          row.querySelector('[data-act="del"]').onclick = async () => {
            await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
            row.remove();
          };
        });
      },
    });
  }

  async exportSb3() {
    const modal = openModal({ title: t('exportSb3'), width: 380, body: '<p class="muted">جارٍ تجهيز الملف…</p>' });
    try {
      const bytes = await exportSb3(this.project);
      const base = (this.project.name || 'project').replace(/[\\/:*?"<>|]+/g, '_');
      downloadBlob(bytes, `${base}.sb3`, 'application/zip');
      toast('تم تصدير project.sb3', 'ok');
    } catch (err) {
      console.error(err);
      toast(`${t('errorImport')}: ${err.message}`, 'err');
    } finally {
      modal.close();
    }
  }

  async importFile(file) {
    try {
      const project = await importProjectFile(file);
      this.loadProject(project);
      toast(t('sb3Imported'), 'ok');
    } catch (err) {
      console.error(err);
      toast(`${t('errorImport')} (${err.message})`, 'err');
    }
  }

  newProject() {
    confirmDialog('إنشاء مشروع جديد؟ سيتم استبدال المشروع الحالي (احفظه أولًا).').then((ok) => {
      if (!ok) return;
      clearLocalProject();
      this.loadProject(createEmptyProject());
      toast('مشروع جديد', 'ok');
    });
  }

  /* ================================================================ menus */
  bindTopbar() {
    $('#btn-lang').onclick = () => { toggleLang(); this.renderChat(); };
    $('#btn-fullscreen').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    };
    $('#btn-save').onclick = () => { saveLocalProject(this.project); this.markSaved('saved'); toast(t('saved'), 'ok'); };
    $('#btn-download-sb3').onclick = () => this.exportSb3();
    $('#btn-import').onclick = () => $('#file-import').click();
    $('#file-import').onchange = (ev) => {
      const file = ev.target.files?.[0];
      if (file) this.importFile(file);
      ev.target.value = '';
    };
    $('#btn-exe').onclick = () => window.open(this.releaseUrl || RELEASES_URL, '_blank', 'noopener');
    $('#btn-collab').onclick = () => this.openCollabModal();
    $('#brand').onclick = () => this.openAbout();
    $('#modal-close').onclick = () => closeModal();
    $('#modal-layer').addEventListener('click', (ev) => {
      if (ev.target.id === 'modal-layer') closeModal();
    });
    $('#ws-zoom-in').onclick = () => this.workspace.zoomAt(1.15, window.innerWidth / 2, window.innerHeight / 2);
    $('#ws-zoom-out').onclick = () => this.workspace.zoomAt(1 / 1.15, window.innerWidth / 2, window.innerHeight / 2);
    $('#ws-zoom-reset').onclick = () => this.workspace.resetZoom();
    $('#ws-cleanup').onclick = () => this.workspace.cleanupLayout();
  }

  bindMenus() {
    const layer = $('#menu-layer');
    const menuData = {
      file: [
        { label: t('newProject'), run: () => this.newProject() },
        { label: t('openLocal'), run: () => $('#file-import').click() },
        { label: t('saveLocal'), run: () => { saveLocalProject(this.project); this.markSaved('saved'); toast(t('saved'), 'ok'); } },
        { sep: true },
        { label: t('saveServer'), run: () => this.saveToServer() },
        { label: t('openServer'), run: () => this.openServerProjects() },
        { sep: true },
        { label: t('downloadSb3'), run: () => this.exportSb3() },
        { label: t('exportJson'), run: () => downloadText(JSON.stringify(this.project, null, 2), `${this.project.name || 'project'}.json`) },
      ],
      edit: [
        { label: t('undo'), kd: 'Ctrl+Z', run: () => this.undo() },
        { label: t('redo'), kd: 'Ctrl+Y', run: () => this.redo() },
        { sep: true },
        { label: 'ترتيب اللبنات', run: () => this.workspace.cleanupLayout() },
        { label: 'حذف لبنات الكائن', run: () => this.clearTargetBlocks() },
      ],
      collab: [
        { label: t('startCollab'), run: () => this.openCollabModal('host') },
        { label: t('joinCollab'), run: () => this.openCollabModal('guest') },
        { label: t('chat'), run: () => this.toggleChat(true) },
        { sep: true },
        { label: t('leaveCollab'), run: () => this.endSession() },
      ],
      help: [
        { label: t('about'), run: () => this.openAbout() },
        { label: t('docs'), run: () => window.open(`${REPO_URL}#readme`, '_blank', 'noopener') },
        { label: t('downloadExe'), run: () => window.open(this.releaseUrl || RELEASES_URL, '_blank', 'noopener') },
      ],
    };

    $$('.menu-btn').forEach((btn) => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const key = btn.dataset.menu;
        const items = menuData[key] || [];
        layer.hidden = false;
        layer.innerHTML = '';
        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown';
        const rect = btn.getBoundingClientRect();
        dropdown.style.left = `${Math.max(8, rect.left)}px`;
        dropdown.style.top = `${rect.bottom + 4}px`;
        for (const item of items) {
          if (item.sep) {
            const sep = document.createElement('div');
            sep.className = 'sep';
            dropdown.appendChild(sep);
            continue;
          }
          const b = document.createElement('button');
          b.innerHTML = `<span>${escapeHtml(item.label)}</span>${item.kd ? `<span class="kd">${item.kd}</span>` : ''}`;
          b.onclick = () => { this.closeMenus(); item.run(); };
          dropdown.appendChild(b);
        }
        layer.appendChild(dropdown);
        btn.classList.add('open');
        layer.onclick = (e) => { if (e.target === layer) this.closeMenus(); };
      };
    });
  }

  closeMenus() {
    const layer = $('#menu-layer');
    layer.hidden = true;
    layer.innerHTML = '';
    $$('.menu-btn').forEach((b) => b.classList.remove('open'));
  }

  clearTargetBlocks() {
    confirmDialog('حذف كل لبنات هذا الكائن؟').then((ok) => {
      if (!ok) return;
      this.target.blocks = {};
      this.workspace.render();
      this.markDirty('clear');
    });
  }

  openAbout() {
    const editor = this;
    const stats = projectStats(this.project);
    openModal({
      title: 'CRAFT WARP',
      width: 620,
      body: `
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:10px">
          <img src="img/logo.svg" width="64" height="64" alt="" />
          <div>
            <h3 style="margin:0">CRAFT WARP <span class="muted">v0.1.0</span></h3>
            <p class="muted" style="margin:2px 0 0">بديل خفيف وسريع لسكراتش وتوربو وارب — محرك Rust + واجهة ويب</p>
          </div>
        </div>
        <p>${escapeHtml(t('welcomeBody'))}</p>
        <div class="grid-2" style="margin-top:12px">
          <div class="card">
            <h4>المشروع الحالي</h4>
            <div class="muted">${stats.sprites} كائن • ${stats.blocks} لبنة • ${stats.costumes} مظهر • ${stats.sounds} صوت</div>
          </div>
          <div class="card">
            <h4>آخر إصدار</h4>
            <div class="muted">${escapeHtml(this.config?.version || '0.1.0')} — ${escapeHtml(this.config?.runtime || 'rust')}</div>
          </div>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-act="exe">${escapeHtml(t('downloadExe'))}</button>
          <button class="btn" data-act="repo">GitHub</button>
        </div>`,
      onMount(body) {
        body.querySelector('[data-act="exe"]').onclick = () => window.open(editor.releaseUrl || RELEASES_URL, '_blank', 'noopener');
        body.querySelector('[data-act="repo"]').onclick = () => window.open(REPO_URL, '_blank', 'noopener');
      },
    });
  }

  createCustomBlockFlow() {
    const editor = this;
    openModal({
      title: 'إنشاء لبنة مخصصة',
      width: 480,
      body: `
        <p class="muted">اكتب اسم اللبنة. استخدم <code>%n</code> لمدخل رقمي، <code>%s</code> لمدخل نصي، <code>%b</code> لمدخل شرطي.</p>
        <input class="input" id="cb-name" placeholder="مثال: اقفز %n بكسل" style="margin-top:8px" />
        <div class="row" style="justify-content:flex-end;margin-top:12px">
          <button class="btn" data-act="cancel">إلغاء</button>
          <button class="btn primary" data-act="ok">إنشاء</button>
        </div>`,
      onMount: (body) => {
        const input = body.querySelector('#cb-name');
        input.focus();
        const submit = () => {
          const value = input.value.trim();
          if (!value) return;
          const created = createCustomBlock(editor.project, editor.target, value);
          if (!created) return toast('اسم غير صالح', 'err');
          closeModal();
          editor.category = 'myblocks';
          editor.buildCategoryRail();
          editor.buildPalette();
          editor.renderWorkspace();
          toast('تم إنشاء اللبنة', 'ok');
          editor.markDirty('custom-block');
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        body.querySelector('[data-act="ok"]').onclick = submit;
        body.querySelector('[data-act="cancel"]').onclick = () => closeModal();
      },
    });
  }

  /* ============================================================== shortcuts */
  bindShortcuts() {
    window.addEventListener('keydown', (ev) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      const key = normalizeKey(ev.key);
      if (!typing) {
        this.vm.keys.add(key);
        if (key === 'any' || this.vm.keys.size) {
          this.vm.fireHats('event_whenkeypressed', (block) => {
            const wanted = block.fields?.KEY_OPTION?.[0];
            return wanted === 'any' || wanted === key;
          });
        }
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        saveLocalProject(this.project);
        this.markSaved('saved');
        toast(t('saved'), 'ok');
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !typing) {
        ev.preventDefault();
        if (ev.shiftKey) this.redo(); else this.undo();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y' && !typing) {
        ev.preventDefault();
        this.redo();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'e') {
        ev.preventDefault();
        this.exportSb3();
      }
    });
    window.addEventListener('keyup', (ev) => this.vm.keys.delete(normalizeKey(ev.key)));
    window.addEventListener('blur', () => this.vm.keys.clear());
  }

  /* ============================================================ collaboration */
  queueCollabSync(opts = {}) {
    if (!this.collab.connected) return;
    if (!this.collabSync) {
      this.collabSync = debounce(() => this.flushCollabSync(), 140);
    }
    this.pendingStructure = this.pendingStructure || [];
    if (opts.structure) this.pendingStructure.push(opts);
    this.collabSync();
  }

  flushCollabSync() {
    if (!this.collab.connected) return;
    try {
      // assets first
      const pending = Object.keys(this.pendingAssets || {});
      if (pending.length) {
        const assets = {};
        for (const key of pending) {
          assets[key] = this.project.assets[key];
          this.sentAssets.add(key);
        }
        this.collab.sendAssets(assets);
        this.pendingAssets = {};
      }
      for (const op of this.pendingStructure || []) {
        if (op.removedId) this.collab.sendTargetRemove(op.removedId);
      }
      const structure = (this.pendingStructure || []).length > 0;
      this.pendingStructure = [];
      this.collab.sendMeta({ name: this.project.name });
      this.collab.sendTarget(JSON.parse(JSON.stringify(this.target)));
      if (structure) {
        this.collab.sendOrder(this.project.targets.map((tg) => tg.id));
        for (const target of this.project.targets) {
          if (target.id !== this.target.id) this.collab.sendTarget(JSON.parse(JSON.stringify(target)));
        }
      }
    } catch (err) {
      console.warn('[cw] collab sync failed', err);
    }
  }

  trackAsset(key) {
    if (!key) return;
    if (!this.project.assets?.[key]) return;
    this.pendingAssets[key] = this.project.assets[key];
    if (this.collab?.connected) this.queueCollabSync();
  }

  onCollabStatus(status) {
    const btn = $('#btn-collab');
    const dot = document.querySelector('.bb-dot');
    if (status === 'connected' || status === 'reconnected') {
      btn?.classList.add('live');
      dot?.classList.remove('off');
      this.setStatus(this.collab.code ? `${t('collabLive')} • ${this.collab.code}` : t('ready'));
      if (status === 'reconnected') {
        toast('تمت إعادة الاتصال', 'ok');
        if (this.collab.isHost) this.collab.sendState(this.project);
      }
    } else {
      btn?.classList.remove('live');
      dot?.classList.add('off');
      this.setStatus(t('ready'));
    }
    this.refreshPresence();
    this.renderTeamPane();
  }

  onPresence(peers, msg) {
    const map = new Map();
    const previous = this.peers;
    for (const peer of peers || []) {
      const cursor = previous.get(peer.id)?.cursor || null;
      map.set(peer.id, { ...peer, cursor });
    }
    // keep my own cursor sprite info
    this.peers = map;
    if (msg && msg.id) void msg;
    this.refreshPresence();
    this.renderTeamPane();
    this.renderSpritePane();
    this.workspace.renderRemoteCursors([...map.values()].filter((p) => p.id !== this.collab.id && p.cursor));
  }

  refreshPresence() {
    const host = $('#presence');
    if (!host) return;
    host.innerHTML = '';
    const list = [...this.peers.values()];
    if (!list.length && this.collab.connected) {
      list.push({ id: this.collab.id, name: this.collab.name, color: this.collab.color, role: 'host', me: true });
    }
    for (const peer of list) {
      const el = document.createElement('div');
      el.className = 'avatar';
      el.style.background = peer.color || '#4c97ff';
      el.title = `${peer.name}${peer.role === 'host' ? ' (مضيف)' : ''}`;
      el.textContent = initials(peer.name);
      if (peer.id === this.collab.id) el.dataset.me = '1';
      host.appendChild(el);
    }
  }

  renderTeamPane() {
    const list = $('#team-list');
    const activity = $('#activity');
    if (!list) return;
    list.innerHTML = '';
    if (!this.collab.connected) {
      list.innerHTML = `<p class="hint">${t('noCollab')}</p>`;
    } else {
      for (const peer of this.peers.values()) {
        const row = document.createElement('div');
        row.className = 'team-row';
        row.innerHTML = `<span class="team-dot" style="background:${peer.color}"></span>
          <span>${escapeHtml(peer.name)}${peer.id === this.collab.id ? ' (أنت)' : ''}</span>
          <span class="t-role">${peer.role === 'host' ? t('host') : t('guest')}</span>`;
        list.appendChild(row);
      }
    }
    activity.innerHTML = this.activity.slice(-12).reverse().map((a) =>
      `<div class="activity-item"><b>${escapeHtml(a.name || '')}</b> ${escapeHtml(a.text || '')} <span class="muted">${fmtTime(a.at)}</span></div>`).join('');
  }

  openTeamModal() {
    const editor = this;
    const peers = [...this.peers.values()];
    const modal = openModal({
      title: t('people'),
      width: 520,
      body: `
        <div class="row" style="margin-bottom:10px">
          <span class="pill-btn" style="background:#eef6ff">${this.collab.connected ? `${t('collabLive')} • ${this.collab.code}` : t('noCollab')}</span>
        </div>
        <div class="team-list">${peers.map((p) => `
          <div class="team-row">
            <span class="team-dot" style="background:${p.color}"></span>
            <span>${escapeHtml(p.name)}</span>
            <span class="t-role">${p.role === 'host' ? t('host') : t('guest')}</span>
          </div>`).join('') || `<p class="hint">${t('noCollab')}</p>`}
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-act="host">${escapeHtml(t('startCollab'))}</button>
          <button class="btn" data-act="join">${escapeHtml(t('joinCollab'))}</button>
          <button class="btn danger" data-act="leave">${escapeHtml(t('leaveCollab'))}</button>
        </div>`,
      onMount(body) {
        body.querySelector('[data-act="host"]').onclick = () => { modal.close(); editor.openCollabModal('host'); };
        body.querySelector('[data-act="join"]').onclick = () => { modal.close(); editor.openCollabModal('guest'); };
        body.querySelector('[data-act="leave"]').onclick = () => { modal.close(); editor.endSession(); };
      },
    });
  }

  openCollabModal(mode = null) {
    const editor = this;
    if (this.collab.connected) {
      this.openTeamModal();
      return;
    }
    const savedName = localStorage.getItem('cw-name') || '';
    const body = `
      <div class="lib-tabs" id="collab-tabs">
        <button class="lib-tab ${mode !== 'guest' ? 'active' : ''}" data-mode="host">${escapeHtml(t('hostTitle'))}</button>
        <button class="lib-tab ${mode === 'guest' ? 'active' : ''}" data-mode="guest">${escapeHtml(t('guestTitle'))}</button>
      </div>
      <div id="collab-body"></div>`;
    const modal = openModal({
      title: t('collab'),
      width: 560,
      body,
      onMount: (bodyEl) => {
        const tabs = bodyEl.querySelector('#collab-tabs');
        const content = bodyEl.querySelector('#collab-body');
        let current = mode === 'guest' ? 'guest' : 'host';

        const renderHost = () => {
          content.innerHTML = `
            <p class="muted">${escapeHtml(t('hostDesc'))}</p>
            <label class="muted" style="display:block;margin:8px 0 4px">${escapeHtml(t('nameLabel'))}</label>
            <input class="input" id="collab-name" value="${escapeHtml(savedName)}" placeholder="${escapeHtml(t('namePlaceholder'))}" />
            <div id="collab-code-area"></div>
            <div class="row" style="justify-content:flex-end;margin-top:14px">
              <button class="btn primary" id="collab-create">${escapeHtml(t('createSession'))}</button>
            </div>`;
          content.querySelector('#collab-create').onclick = async () => {
            const name = content.querySelector('#collab-name').value.trim() || 'مضيف';
            localStorage.setItem('cw-name', name);
            const btn = content.querySelector('#collab-create');
            btn.disabled = true;
            btn.textContent = t('connecting');
            try {
              const code = await editor.collab.host(editor.project, name);
              editor.sentAssets = new Set();
              content.querySelector('#collab-code-area').innerHTML = `
                <div class="host-code">${escapeHtml(code)}</div>
                <div class="copy-row">
                  <button class="btn" id="collab-copy" style="flex:1">${escapeHtml(t('copy'))}</button>
                </div>
                <p class="muted" style="margin-top:8px">شارك الرمز عبر واتساب أو أي تطبيق. يكتبه صديقك في «انضم».</p>`;
              content.querySelector('#collab-copy').onclick = async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  toast(t('codeCopied'), 'ok');
                } catch {
                  promptDialog('انسخ الرمز:', code);
                }
              };
              btn.textContent = t('collabLive');
              editor.collab.sendState(editor.project);
              editor.chatAddSystem(`بدأت الجلسة ${code}`);
              const done = document.createElement('button');
              done.className = 'btn primary block';
              done.style.marginTop = '12px';
              done.textContent = 'ابدأ العمل ←';
              done.onclick = () => modal.close();
              content.querySelector('#collab-code-area').appendChild(done);
            } catch (err) {
              btn.disabled = false;
              btn.textContent = t('createSession');
              toast(`تعذر إنشاء الجلسة: ${err.message}`, 'err');
            }
          };
        };

        const renderGuest = () => {
          content.innerHTML = `
            <p class="muted">${escapeHtml(t('guestDesc'))}</p>
            <label class="muted" style="display:block;margin:8px 0 4px">${escapeHtml(t('nameLabel'))}</label>
            <input class="input" id="collab-name" value="${escapeHtml(savedName)}" placeholder="${escapeHtml(t('namePlaceholder'))}" />
            <label class="muted" style="display:block;margin:8px 0 4px">${escapeHtml(t('enterCode'))}</label>
            <input class="input code" id="collab-code" maxlength="6" placeholder="ABC123" autocapitalize="characters" />
            <div class="row" style="justify-content:flex-end;margin-top:14px">
              <button class="btn primary" id="collab-join">${escapeHtml(t('join'))}</button>
            </div>`;
          const input = content.querySelector('#collab-code');
          input.focus();
          input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
          const doJoin = async () => {
            const code = input.value.trim();
            const name = content.querySelector('#collab-name').value.trim() || 'ضيف';
            if (code.length < 4) return toast('رمز غير صالح', 'err');
            localStorage.setItem('cw-name', name);
            const btn = content.querySelector('#collab-join');
            btn.disabled = true;
            btn.textContent = t('connecting');
            try {
              await editor.collab.join(code, name);
              modal.close();
              toast(`${t('connected')} — ${code}`, 'ok');
              editor.toggleChat(true);
            } catch (err) {
              btn.disabled = false;
              btn.textContent = t('join');
              toast(err.message?.includes('closed') ? t('roomNotFound') : `تعذر الانضمام: ${err.message}`, 'err');
            }
          };
          content.querySelector('#collab-join').onclick = doJoin;
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
        };

        const select = tabs.querySelector(`[data-mode="${current}"]`);
        tabs.querySelectorAll('.lib-tab').forEach((b) => {
          b.onclick = () => {
            tabs.querySelectorAll('.lib-tab').forEach((x) => x.classList.remove('active'));
            b.classList.add('active');
            current = b.dataset.mode;
            if (current === 'host') renderHost(); else renderGuest();
          };
        });
        select?.classList.add('active');
        if (current === 'host') renderHost(); else renderGuest();
      },
    });
  }

  endSession() {
    if (!this.collab.connected) return toast(t('noCollab'), 'info');
    this.collab.close();
    this.peers = new Map();
    this.refreshPresence();
    this.renderTeamPane();
    this.workspace.renderRemoteCursors([]);
    toast(t('collabEnded'), 'info');
  }

  onCollabEvent(type, payload) {
    switch (type) {
      case 'snapshot':
      case 'state': {
        if (!payload) return;
        this.loadProject(payload, { fromRemote: true });
        toast('تم تحميل مشروع الجلسة', 'ok');
        break;
      }
      case 'request-state': {
        if (this.collab.isHost) {
          this.sentAssets = new Set();
          this.collab.sendState(this.project);
        }
        break;
      }
      case 'target': {
        if (!payload.target) return;
        if (this.workspace.drag) { this.remoteQueue.push({ type, payload }); return; }
        this.applyRemoteTarget(payload.target);
        break;
      }
      case 'target-remove': {
        this.project.targets = this.project.targets.filter((t) => t.id !== payload.id);
        if (this.currentTargetId === payload.id) this.currentTargetId = this.project.targets[1]?.id || 'stage';
        this.applyingRemote = true;
        this.renderSpritePane();
        this.switchTarget(this.currentTargetId);
        this.applyingRemote = false;
        break;
      }
      case 'targets-order': {
        const order = payload.ids || [];
        const map = new Map(this.project.targets.map((t) => [t.id, t]));
        const next = [];
        order.forEach((id, index) => {
          const target = map.get(id);
          if (target) { target.layerOrder = index; next.push(target); map.delete(id); }
        });
        this.project.targets = [...next, ...map.values()];
        this.renderSpritePane();
        break;
      }
      case 'assets': {
        if (!payload.assets) return;
        this.project.assets = { ...this.project.assets, ...payload.assets };
        this.renderer.preload();
        this.renderer.invalidate();
        if ($('.tab.active')?.dataset.tab === 'costumes') this.renderCostumes();
        this.renderSpritePane();
        break;
      }
      case 'meta': {
        if (payload.meta?.name) {
          this.project.name = payload.meta.name;
          $('#project-name').value = this.project.name;
        }
        break;
      }
      case 'cursor': {
        const peer = this.peers.get(payload.from);
        if (peer) {
          peer.cursor = { ...(payload.cursor || {}), at: Date.now() };
          this.workspace.renderRemoteCursors([...this.peers.values()].filter((p) => p.id !== this.collab.id && p.cursor));
          this.renderSpritePane();
        }
        break;
      }
      case 'activity': {
        this.pushActivity({ name: payload.name, text: payload.text, at: payload.at || Date.now() });
        break;
      }
      case 'peer-join': {
        this.pushActivity({ name: payload.name, text: 'انضم إلى الجلسة', at: Date.now() });
        toast(`${payload.name} ${t('activityJoin')}`, 'info');
          break;
      }
      case 'peer-leave': {
        this.pushActivity({ name: payload.name, text: 'غادر الجلسة', at: Date.now() });
        break;
      }
      case 'host-left': {
        toast(t('hostLeft'), 'err');
        this.collab.close();
        this.peers = new Map();
        this.refreshPresence();
        this.renderTeamPane();
        break;
      }
      default:
        break;
    }
  }

  applyRemoteTarget(remote) {
    if (!remote?.id) return;
    const index = this.project.targets.findIndex((t) => t.id === remote.id);
    this.applyingRemote = true;
    try {
      if (index >= 0) {
        const merged = { ...this.project.targets[index], ...remote };
        this.project.targets[index] = merged;
      } else {
        this.project.targets.push(remote);
      }
      this.renderSpritePane();
      if (remote.id === this.currentTargetId) {
        this.workspace.project = this.project;
        this.workspace.render();
      }
      this.renderer.invalidate();
      if ($('.tab.active')?.dataset.tab === 'costumes') this.renderCostumes();
    } finally {
      this.applyingRemote = false;
    }
  }

  flushRemoteQueue() {
    if (!this.remoteQueue.length) return;
    const queue = this.remoteQueue.splice(0);
    for (const item of queue) this.onCollabEvent(item.type, item.payload);
  }

  announce(text) {
    if (!this.collab.connected) return;
    this.collab.sendActivity(text);
    this.pushActivity({ name: this.peers.get(this.collab.id)?.name || this.collab.name, text, at: Date.now() });
  }

  pushActivity(entry) {
    this.activity.push(entry);
    if (this.activity.length > 60) this.activity.shift();
    this.renderTeamPane();
  }

  /* ================================================================== chat */
  bindChat() {
    const dock = $('#chat-dock');
    dock.hidden = true;
    $('#chat-send').onclick = () => this.sendChatFromInput();
    $('#chat-input').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') this.sendChatFromInput();
    });
    $('#chat-image-btn').onclick = () => $('#chat-image-input').click();
    $('#chat-image-input').onchange = async (ev) => {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      const dataUrl = await compressImage(file);
      this.sendChat('', dataUrl);
    };
    window.addEventListener('paste', (ev) => {
      if (!this.collab.connected) return;
      const item = [...(ev.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      ev.preventDefault();
      compressImage(file).then((dataUrl) => this.sendChat('', dataUrl));
    });
  }

  toggleChat(force = null) {
    const dock = $('#chat-dock');
    const open = force === null ? dock.hidden : force;
    dock.hidden = !open;
    if (open) {
      this.unreadChat = 0;
      const badge = $('#chat-badge');
      if (badge) badge.hidden = true;
      this.renderChat();
      $('#chat-input').focus();
    }
  }

  sendChatFromInput() {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.sendChat(text);
  }

  sendChat(text, image = null) {
    if (!this.collab.connected) {
      toast('الدردشة تعمل داخل جلسة تعاون فقط', 'info');
      return;
    }
    const me = this.peers.get(this.collab.id);
    const payload = {
      from: this.collab.id,
      name: me?.name || this.collab.name || 'أنا',
      color: me?.color || this.collab.color,
      text,
      image,
      at: Date.now(),
    };
    this.addChatMessage({ ...payload, mine: true });
    this.collab.sendChat(text, image);
    if (text) this.pushActivity({ name: payload.name, text: 'أرسل رسالة', at: Date.now() });
  }

  receiveChat(msg) {
    this.addChatMessage({ ...msg, mine: false });
    this.pushActivity({ name: msg.name, text: 'أرسل رسالة', at: Date.now() });
    const dock = $('#chat-dock');
    if (dock.hidden) {
      this.unreadChat++;
      const badge = $('#chat-badge');
      if (badge) { badge.hidden = false; badge.textContent = String(this.unreadChat); }
    }
  }

  chatAddSystem(text) {
    this.addChatMessage({ system: true, text, at: Date.now() });
  }

  addChatMessage(msg) {
    this.chatMessages.push(msg);
    if (this.chatMessages.length > 200) this.chatMessages.shift();
    this.renderChat();
  }

  renderChat() {
    const list = $('#chat-list');
    if (!list) return;
    if (!this.chatMessages.length) {
      list.innerHTML = `<div class="chat-empty">${escapeHtml(t('chatEmpty'))}</div>`;
      return;
    }
    list.innerHTML = this.chatMessages.map((m) => {
      if (m.system) return `<div class="chat-empty" style="padding:2px">${escapeHtml(m.text)}</div>`;
      return `<div class="chat-msg ${m.mine ? 'mine' : ''}">
        <div class="cm-owner" style="color:${m.color || '#4c97ff'}">${escapeHtml(m.name || '')}</div>
        ${m.text ? `<div>${escapeHtml(m.text)}</div>` : ''}
        ${m.image ? `<img src="${m.image}" alt="صورة" />` : ''}
        <div class="cm-time">${fmtTime(m.at)}</div>
      </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  }
}

/* --------------------------------------------------------------- helpers */
function imageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 100, h: 100 });
    img.src = dataUrl;
  });
}

function compressImage(file, max = 720, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(null);
      img.src = String(reader.result);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export { SOUND_LIBRARY, SPRITE_LIBRARY, BACKDROP_LIBRARY, newStage, addBlockAt, uid, dataUrlToBytes, createCustomBlockCall, findProcedure, getLang };
