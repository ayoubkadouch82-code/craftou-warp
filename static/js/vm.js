/**
 * CRAFT WARP — virtual machine.
 *
 * A compact, generator based Scratch 3 compatible interpreter: no DOM access,
 * so it can run head-less in tests, and it is fast enough to keep 60 fps with
 * hundreds of threads.
 */

const STOP_SCRIPT = Symbol('stop-script');

const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toStr = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(Math.round(v * 1e10) / 1e10) : String(v ?? ''));
const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v !== '' && v !== '0' && v.toLowerCase() !== 'false';
  return Boolean(v);
};
const wrapClamp = (d) => {
  let x = Number(d) || 0;
  if (x > 180) x -= 360 * Math.ceil((x - 180) / 360);
  if (x <= -180) x += 360 * Math.ceil((-x - 180) / 360);
  return x;
};
const cloneDeep = (v) => JSON.parse(JSON.stringify(v));

export class VM {
  constructor(project, opts = {}) {
    this.project = project;
    this.audio = opts.audio || null;
    this.renderer = opts.renderer || null;
    this.onAsk = opts.onAsk || null;
    this.onTargetsChanged = opts.onTargetsChanged || (() => {});
    this.onThreadEvent = opts.onThreadEvent || (() => {});
    this.username = opts.username || 'craftwarper';
    this.width = 480;
    this.height = 360;

    this.clones = [];
    this.threads = [];
    this.time = 0;
    this.timerStart = 0;
    this.running = false;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.answer = '';
    this.loudness = 0;
    this.threadCounter = 0;
    this.soundEffects = {};
    this.hatQueue = [];
  }

  /* ------------------------------------------------------------- lifecycle */
  get targets() {
    return [...this.project.targets, ...this.clones];
  }

  get stage() { return this.project.targets[0]; }

  get sprites() { return this.project.targets.slice(1); }

  targetById(id) { return this.targets.find((t) => t.id === id) || null; }

  spriteName(name) {
    return this.project.targets.find((t) => !t.isStage && t.name === name) || null;
  }

  greenFlag() {
    this.stopAll();
    this.clones = [];
    this.timerStart = 0;
    this.time = 0;
    this.running = true;
    for (const target of this.project.targets) {
      if (target.isStage) continue;
      target.say = null;
      target.effects = {};
    }
    this.fireHats('event_whenflagclicked');
    this.onTargetsChanged();
  }

  stopAll() {
    for (const th of this.threads) th.done = true;
    this.threads = [];
    this.running = false;
    this.clones = [];
    for (const t of this.targets) t.say = null;
    if (this.audio) this.audio.stopAll();
    this.onTargetsChanged();
  }

  stopTarget(target) {
    this.threads = this.threads.filter((th) => th.target !== target);
    for (const th of this.threads) th.done = false;
    if (target && target.say) target.say = null;
  }

  step(dt = 1 / 60) {
    if (!this.running) return;
    this.time += Math.min(0.2, Math.max(0, dt));
    for (const th of this.threads.slice()) {
      if (th.done) continue;
      try {
        this.pump(th);
      } catch (err) {
        if (err !== STOP_SCRIPT) console.warn('[cw vm]', err);
        th.done = true;
      }
    }
    if (this.threads.some((t) => t.done)) {
      this.threads = this.threads.filter((t) => !t.done);
    }
  }

  /* ------------------------------------------------------------- threading */
  startThread(target, topBlockId, opts = {}) {
    if (!target || !topBlockId) return null;
    if (!target.blocks || !target.blocks[topBlockId]) return null;
    const th = {
      id: ++this.threadCounter,
      target,
      topBlock: topBlockId,
      gen: null,
      done: false,
      pending: null,
      sendValue: undefined,
      warp: opts.warp ? 1 : 0,
      params: [],
      name: target.name,
    };
    th.gen = this.execStack(target, topBlockId, th);
    this.threads.push(th);
    return th;
  }

  pump(th) {
    let guard = 0;
    for (;;) {
      if (th.done) return;
      if (th.pending) {
        const p = th.pending;
        if (p.type === 'secs') {
          if (this.time < p.until) return;
          th.pending = null;
        } else if (p.type === 'until') {
          let ok = false;
          try { ok = !!p.fn(); } catch { ok = false; }
          if (!ok) return;
          th.pending = null;
        } else if (p.type === 'promise') {
          if (!p.done) return;
          th.pending = null;
        } else if (p.type === 'ask') {
          if (!p.done) return;
          th.sendValue = p.answer;
          th.pending = null;
        } else if (p.type === 'threads') {
          const alive = this.threads.some((t) => p.ids.includes(t.id) && !t.done);
          if (alive) return;
          th.pending = null;
        } else {
          th.pending = null;
        }
      }

      const res = th.gen.next(th.sendValue);
      th.sendValue = undefined;
      if (res.done) { th.done = true; return; }
      const y = res.value;
      if (y === undefined || y === 'frame') {
        if (th.warp > 0 && guard++ < 20000) continue;
        return;
      }
      if (y.type === 'secs') {
        if (y.secs <= 0) continue;
        th.pending = { type: 'secs', until: this.time + y.secs };
        return;
      }
      if (y.type === 'until') {
        if (y.fn && y.fn()) continue;
        th.pending = y;
        return;
      }
      if (y.type === 'promise') {
        th.pending = { type: 'promise', done: false };
        const p = th.pending;
        Promise.resolve(y.promise).then(() => { p.done = true; }).catch(() => { p.done = true; });
        return;
      }
      if (y.type === 'ask') {
        const p = { type: 'ask', done: false, answer: '' };
        th.pending = p;
        const q = y.question;
        const finish = (ans) => { p.answer = String(ans ?? ''); p.done = true; this.answer = p.answer; };
        if (this.onAsk) {
          this.onAsk(q, th.target).then(finish).catch(() => finish(''));
        } else {
          finish('');
        }
        return;
      }
      if (y.type === 'threads') { th.pending = y; return; }
      return;
    }
  }

  fireHats(opcode, predicate = null) {
    const started = [];
    for (const target of this.targets) {
      for (const [id, block] of Object.entries(target.blocks || {})) {
        if (block.opcode !== opcode) continue;
        const isTop = block.topLevel || !this.parentOf(target, id);
        if (!isTop) continue;
        if (predicate && !predicate(block, target)) continue;
        // restart an already running copy of the same script
        const existing = this.threads.find((t) => t.target === target && t.topBlock === id);
        if (existing) existing.done = true;
        const th = this.startThread(target, id);
        if (th) started.push(th);
      }
    }
    this.threads = this.threads.filter((t) => !t.done);
    return started;
  }

  parentOf(target, blockId) {
    for (const blk of Object.values(target.blocks || {})) {
      for (const inp of Object.values(blk.inputs || {})) {
        if (Array.isArray(inp) && inp[1] === blockId) return blk;
      }
      if (blk.next === blockId) return blk;
    }
    return null;
  }

  broadcast(name) {
    return this.fireHats('event_whenbroadcastreceived', (block) => this.field(block, 'BROADCAST_OPTION') === name);
  }

  /* ----------------------------------------------------------- block input */
  field(block, name) {
    const f = block?.fields?.[name];
    if (!f) return '';
    return f[0];
  }

  inputBlockId(block, name) {
    const inp = block?.inputs?.[name];
    if (!inp) return null;
    const v = inp[1];
    return typeof v === 'string' ? v : null;
  }

  lookupVar(target, idOrName) {
    const find = (t) => {
      if (!t || !t.variables) return null;
      if (t.variables[idOrName]) return t.variables[idOrName];
      return Object.values(t.variables).find((v) => v[0] === idOrName) || null;
    };
    return find(target) || find(this.stage);
  }

  lookupList(target, idOrName) {
    const find = (t) => {
      if (!t || !t.lists) return null;
      if (t.lists[idOrName]) return t.lists[idOrName];
      return Object.values(t.lists).find((v) => v[0] === idOrName) || null;
    };
    return find(target) || find(this.stage);
  }

  /** full input value: evaluates nested reporters, returns primitive */
  input(target, block, name) {
    const inp = block?.inputs?.[name];
    if (!inp) return '';
    let v = inp[1];
    if (typeof v === 'string') {
      const nested = target.blocks?.[v];
      if (!nested) return '';
      return this.evaluate(target, nested);
    }
    if (Array.isArray(v)) {
      const [type, val] = v;
      if (type === 12) {
        const variable = this.lookupVar(target, val);
        return variable ? variable[1] : '';
      }
      if (type === 13) {
        const list = this.lookupList(target, val);
        return list ? list[1].join('') : '';
      }
      return val;
    }
    return '';
  }

  numInput(target, block, name) { return toNum(this.input(target, block, name)); }
  strInput(target, block, name) { return toStr(this.input(target, block, name)); }
  boolInput(target, block, name) {
    const id = this.inputBlockId(block, name);
    if (id && target.blocks?.[id]) return toBool(this.evaluate(target, target.blocks[id]));
    return false;
  }

  substackId(block, name = 'SUBSTACK') {
    const inp = block?.inputs?.[name];
    if (!inp) return null;
    return typeof inp[1] === 'string' ? inp[1] : null;
  }

  /* --------------------------------------------------------- reporter eval */
  evaluate(target, block) {
    if (!block) return '';
    const op = block.opcode;
    const num = (n) => this.numInput(target, block, n);
    const str = (n) => this.strInput(target, block, n);
    const f = (n) => this.field(block, n);

    switch (op) {
      case 'motion_xposition': return target.x ?? 0;
      case 'motion_yposition': return target.y ?? 0;
      case 'motion_direction': return target.direction ?? 90;
      case 'looks_size': return target.size ?? 100;
      case 'looks_costumenumbername':
        return f('NUMBER_NAME') === 'name'
          ? (target.costumes?.[target.currentCostume || 0]?.name ?? '')
          : (target.currentCostume || 0) + 1;
      case 'looks_backdropnumbername':
        return f('NUMBER_NAME') === 'name'
          ? (this.stage?.costumes?.[this.stage.currentCostume || 0]?.name ?? '')
          : (this.stage?.currentCostume || 0) + 1;
      case 'sound_volume': return target.volume ?? 100;
      case 'operator_add': return num('NUM1') + num('NUM2');
      case 'operator_subtract': return num('NUM1') - num('NUM2');
      case 'operator_multiply': return num('NUM1') * num('NUM2');
      case 'operator_divide': {
        const d = num('NUM2');
        return d === 0 ? Infinity : num('NUM1') / d;
      }
      case 'operator_random': {
        const a = num('FROM'); const b = num('TO');
        const lo = Math.min(a, b); const hi = Math.max(a, b);
        const isInt = Number.isInteger(a) && Number.isInteger(b);
        return isInt ? Math.floor(Math.random() * (hi - lo + 1)) + lo : Math.random() * (hi - lo) + lo;
      }
      case 'operator_gt': return this.compare(target, block) > 0;
      case 'operator_lt': return this.compare(target, block) < 0;
      case 'operator_equals': return this.compare(target, block) === 0;
      case 'operator_and': return this.boolInput(target, block, 'OPERAND1') && this.boolInput(target, block, 'OPERAND2');
      case 'operator_or': return this.boolInput(target, block, 'OPERAND1') || this.boolInput(target, block, 'OPERAND2');
      case 'operator_not': return !this.boolInput(target, block, 'OPERAND');
      case 'operator_join': return str('STRING1') + str('STRING2');
      case 'operator_letter_of': {
        const s = str('STRING'); const i = Math.floor(num('LETTER'));
        return i >= 1 && i <= s.length ? s[i - 1] : '';
      }
      case 'operator_length': return str('STRING').length;
      case 'operator_contains': return str('STRING1').toLowerCase().includes(str('STRING2').toLowerCase());
      case 'operator_mod': {
        const a = num('NUM1'); const b = num('NUM2');
        if (b === 0) return NaN;
        return ((a % b) + b) % b;
      }
      case 'operator_round': return Math.round(num('NUM'));
      case 'operator_mathop': {
        const v = num('NUM');
        switch (f('OPERATOR')) {
          case 'abs': return Math.abs(v);
          case 'floor': return Math.floor(v);
          case 'ceiling': return Math.ceil(v);
          case 'sqrt': return Math.sqrt(v);
          case 'sin': return Math.round(Math.sin((v * Math.PI) / 180) * 1e10) / 1e10;
          case 'cos': return Math.round(Math.cos((v * Math.PI) / 180) * 1e10) / 1e10;
          case 'tan': return Math.round(Math.tan((v * Math.PI) / 180) * 1e10) / 1e10;
          case 'asin': return (Math.asin(v) * 180) / Math.PI;
          case 'acos': return (Math.acos(v) * 180) / Math.PI;
          case 'atan': return (Math.atan(v) * 180) / Math.PI;
          case 'ln': return Math.log(v);
          case 'log': return Math.log10(v);
          case 'e ^': return Math.exp(v);
          case '10 ^': return Math.pow(10, v);
          default: return 0;
        }
      }
      case 'data_itemoflist': {
        const list = this.lookupList(target, f('LIST'));
        const arr = list ? list[1] : [];
        let i = Math.floor(num('INDEX'));
        if (i < 0) i = arr.length + i + 1;
        return arr[i - 1] ?? '';
      }
      case 'data_itemnumoflist': {
        const list = this.lookupList(target, f('LIST'));
        const arr = list ? list[1] : [];
        const item = str('ITEM');
        return arr.findIndex((x) => toStr(x).toLowerCase() === item.toLowerCase()) + 1;
      }
      case 'data_lengthoflist': {
        const list = this.lookupList(target, f('LIST'));
        return list ? list[1].length : 0;
      }
      case 'data_listcontainsitem': {
        const list = this.lookupList(target, f('LIST'));
        const arr = list ? list[1] : [];
        const item = str('ITEM').toLowerCase();
        return arr.some((x) => toStr(x).toLowerCase() === item);
      }
      case 'argument_reporter_string_number': {
        const name = f('VALUE');
        for (let i = th_params(target).length - 1; i >= 0; i--) {
          const frame = th_params(target)[i];
          if (frame && Object.prototype.hasOwnProperty.call(frame, name)) return frame[name];
        }
        return 0;
      }
      case 'argument_reporter_boolean': {
        const name = f('VALUE');
        for (let i = th_params(target).length - 1; i >= 0; i--) {
          const frame = th_params(target)[i];
          if (frame && Object.prototype.hasOwnProperty.call(frame, name)) return toBool(frame[name]);
        }
        return false;
      }
      case 'sensing_answer': return this.answer;
      case 'sensing_keypressed': {
        const key = this.field(block, 'KEY_OPTION');
        return this.keys.has(normalizeKey(key));
      }
      case 'sensing_mousedown': return this.mouse.down;
      case 'sensing_mousex': return this.mouse.x;
      case 'sensing_mousey': return this.mouse.y;
      case 'sensing_timer': return this.time - this.timerStart;
      case 'sensing_dayssince2000': return (Date.now() - Date.UTC(2000, 0, 1)) / 86400000;
      case 'sensing_username': return this.username;
      case 'sensing_loudness': return this.loudness;
      case 'sensing_current': {
        const d = new Date();
        switch (f('CURRENTMENU')) {
          case 'YEAR': return d.getFullYear();
          case 'MONTH': return d.getMonth() + 1;
          case 'DATE': return d.getDate();
          case 'DAYOFWEEK': return d.getDay() + 1;
          case 'HOUR': return d.getHours();
          case 'MINUTE': return d.getMinutes();
          case 'SECOND': return d.getSeconds();
          default: return 0;
        }
      }
      case 'sensing_distanceto': {
        const other = this.resolveTarget(target, f('DISTANCETOMENU'));
        if (f('DISTANCETOMENU') === '_mouse_') {
          return Math.hypot(this.mouse.x - (target.x || 0), this.mouse.y - (target.y || 0));
        }
        if (!other) return 10000;
        return Math.hypot((other.x || 0) - (target.x || 0), (other.y || 0) - (target.y || 0));
      }
      case 'sensing_of': {
        const prop = f('PROPERTY');
        const other = this.resolveTarget(target, f('OBJECT'));
        if (!other) return 0;
        switch (prop) {
          case 'x position': return other.x ?? 0;
          case 'y position': return other.y ?? 0;
          case 'direction': return other.direction ?? 90;
          case 'costume #': return (other.currentCostume || 0) + 1;
          case 'costume name': return other.costumes?.[other.currentCostume || 0]?.name ?? '';
          case 'size': return other.size ?? 100;
          case 'volume': return other.volume ?? 100;
          case 'stage width': return this.width;
          case 'stage height': return this.height;
          default: return 0;
        }
      }
      case 'sensing_touchingobject': {
        const menu = f('TOUCHINGOBJECTMENU');
        if (menu === '_mouse_') return this.touchingPoint(target, this.mouse.x, this.mouse.y);
        if (menu === '_edge_') return this.touchingEdge(target);
        const other = this.resolveTarget(target, menu);
        return other ? this.touchingTarget(target, other) : false;
      }
      case 'sensing_touchingcolor':
      case 'sensing_coloristouchingcolor':
        return false; // pixel perfect colour picking is not part of the core renderer
      default: {
        // custom reporter / unknown opcode: resolve through the procedure table
        const procs = this.procedures(target);
        const proc = procs[block.opcode];
        if (proc) return '';
        return '';
      }
    }
  }

  compare(target, block) {
    const a = this.input(target, block, 'OPERAND1');
    const b = this.input(target, block, 'OPERAND2');
    const an = toNum(a); const bn = toNum(b);
    const aNum = a !== '' && !Number.isNaN(Number(a));
    const bNum = b !== '' && !Number.isNaN(Number(b));
    if (aNum && bNum) return an === bn ? 0 : an < bn ? -1 : 1;
    const as = toStr(a).toLowerCase(); const bs = toStr(b).toLowerCase();
    return as === bs ? 0 : as < bs ? -1 : 1;
  }

  /* ------------------------------------------------------------ execution */
  *execStack(target, startId, th, limit = 50000) {
    let id = startId;
    let guard = 0;
    while (id && guard++ < limit) {
      const block = target.blocks?.[id];
      if (!block) return;
      yield* this.execBlock(target, block, th);
      id = block.next;
    }
  }

  *waitSeconds(secs) { yield { type: 'secs', secs }; }

  *execBlock(target, block, th) {
    const op = block.opcode;
    const f = (n) => this.field(block, n);
    const num = (n) => this.numInput(target, block, n);
    const str = (n) => this.strInput(target, block, n);
    const sub = (n = 'SUBSTACK') => this.substackId(block, n);

    switch (op) {
      /* ---------------- motion */
      case 'motion_movesteps': {
        const steps = num('STEPS');
        const rad = ((90 - (target.direction ?? 90)) * Math.PI) / 180;
        target.x = (target.x || 0) + Math.cos(rad) * steps;
        target.y = (target.y || 0) + Math.sin(rad) * steps;
        return;
      }
      case 'motion_turnright': target.direction = wrapClamp((target.direction ?? 90) + num('DEGREES')); return;
      case 'motion_turnleft': target.direction = wrapClamp((target.direction ?? 90) - num('DEGREES')); return;
      case 'motion_goto': {
        const other = this.resolveTarget(target, f('TO'));
        if (other) { target.x = other.x ?? 0; target.y = other.y ?? 0; }
        return;
      }
      case 'motion_gotoxy': target.x = num('X'); target.y = num('Y'); return;
      case 'motion_glidesecstoxy': {
        const secs = Math.max(0, num('SECS'));
        const sx = target.x || 0; const sy = target.y || 0;
        const ex = num('X'); const ey = num('Y');
        const t0 = this.time;
        for (;;) {
          const p = secs <= 0 ? 1 : Math.min(1, (this.time - t0) / secs);
          target.x = sx + (ex - sx) * p;
          target.y = sy + (ey - sy) * p;
          if (p >= 1) return;
          yield 'frame';
        }
      }
      case 'motion_glideto': {
        const other = this.resolveTarget(target, f('TO'));
        if (!other) return;
        const secs = Math.max(0, num('SECS'));
        const sx = target.x || 0; const sy = target.y || 0;
        const t0 = this.time;
        for (;;) {
          const p = secs <= 0 ? 1 : Math.min(1, (this.time - t0) / secs);
          target.x = sx + ((other.x || 0) - sx) * p;
          target.y = sy + ((other.y || 0) - sy) * p;
          if (p >= 1) return;
          yield 'frame';
        }
      }
      case 'motion_pointindirection': target.direction = wrapClamp(num('DIRECTION')); return;
      case 'motion_pointtowards': {
        const menu = f('TOWARDS');
        let ox; let oy;
        if (menu === '_mouse_') { ox = this.mouse.x; oy = this.mouse.y; } else {
          const other = this.resolveTarget(target, menu);
          if (!other) return;
          ox = other.x || 0; oy = other.y || 0;
        }
        target.direction = wrapClamp((Math.atan2(oy - (target.y || 0), ox - (target.x || 0)) * 180) / Math.PI + 0);
        // atan2 gives mathematical angle (x right, y up); Scratch direction 90 = right
        target.direction = wrapClamp((Math.atan2(oy - (target.y || 0), ox - (target.x || 0)) * 180) / Math.PI);
        return;
      }
      case 'motion_changexby': target.x = (target.x || 0) + num('DX'); return;
      case 'motion_setx': target.x = num('X'); return;
      case 'motion_changeyby': target.y = (target.y || 0) + num('DY'); return;
      case 'motion_sety': target.y = num('Y'); return;
      case 'motion_ifonedgebounce': {
        const b = this.bounds(target);
        const hw = this.width / 2; const hh = this.height / 2;
        let dir = target.direction ?? 90;
        const rad = ((90 - dir) * Math.PI) / 180;
        let bounced = false;
        if ((target.x || 0) + b.w / 2 > hw || (target.x || 0) - b.w / 2 < -hw) {
          dir = (180 - dir) * -1;
          dir = 180 - dir;
          bounced = true;
        }
        if ((target.y || 0) + b.h / 2 > hh || (target.y || 0) - b.h / 2 < -hh) {
          dir = -dir;
          bounced = true;
        }
        target.x = Math.max(-hw + b.w / 2, Math.min(hw - b.w / 2, target.x || 0));
        target.y = Math.max(-hh + b.h / 2, Math.min(hh - b.h / 2, target.y || 0));
        if (bounced) target.direction = wrapClamp(dir);
        void rad;
        return;
      }
      case 'motion_setrotationstyle': target.rotationStyle = f('STYLE'); return;

      /* ---------------- looks */
      case 'looks_say': target.say = { text: str('MESSAGE'), kind: 'say', until: Infinity }; return;
      case 'looks_think': target.say = { text: str('MESSAGE'), kind: 'think', until: Infinity }; return;
      case 'looks_sayforsecs':
      case 'looks_thinkforsecs': {
        const kind = op === 'looks_sayforsecs' ? 'say' : 'think';
        const text = str('MESSAGE');
        const secs = Math.max(0, num(op === 'looks_sayforsecs' ? 'SECS' : 'SECS'));
        target.say = { text, kind, until: this.time + secs };
        if (secs > 0) yield* this.waitSeconds(secs);
        if (target.say && target.say.until <= this.time) target.say = null;
        return;
      }
      case 'looks_switchcostumeto': {
        this.setCostume(target, f('COSTUME'));
        return;
      }
      case 'looks_nextcostume': {
        const n = target.costumes?.length || 0;
        if (n) target.currentCostume = ((target.currentCostume || 0) + 1) % n;
        return;
      }
      case 'looks_switchbackdropto': {
        this.setBackdrop(f('BACKDROP'));
        return;
      }
      case 'looks_switchbackdroptoandwait': {
        const name = f('BACKDROP');
        this.setBackdrop(name);
        const nameNow = this.stage?.costumes?.[this.stage.currentCostume || 0]?.name;
        if (name !== 'next backdrop' && name !== 'previous backdrop' && nameNow === name) {
          yield 'frame';
        }
        this.fireHats('event_whenbackdropswitchesto', (b) => this.field(b, 'BACKDROP') === name);
        return;
      }
      case 'looks_nextbackdrop': {
        const stage = this.stage;
        const n = stage?.costumes?.length || 0;
        if (n) stage.currentCostume = ((stage.currentCostume || 0) + 1) % n;
        return;
      }
      case 'looks_changesizeby': target.size = Math.max(0, (target.size ?? 100) + num('CHANGE')); return;
      case 'looks_setsizeto': target.size = Math.max(0, num('SIZE')); return;
      case 'looks_changeeffectby': {
        target.effects = target.effects || {};
        const key = f('EFFECT');
        target.effects[key] = Math.max(key === 'ghost' || key === 'brightness' ? -100 : -1000, (target.effects[key] || 0) + num('CHANGE'));
        if (key === 'ghost') target.effects.ghost = Math.min(100, Math.max(0, target.effects.ghost));
        return;
      }
      case 'looks_seteffectto': {
        target.effects = target.effects || {};
        target.effects[f('EFFECT')] = num('VALUE');
        return;
      }
      case 'looks_cleargraphiceffects': target.effects = {}; return;
      case 'looks_show': target.visible = true; return;
      case 'looks_hide': target.visible = false; return;
      case 'looks_gotofrontback': {
        const sprites = this.sprites;
        const order = f('FRONT_BACK') === 'front' ? Math.max(0, ...sprites.map((s) => s.layerOrder || 0)) + 1 : Math.min(...sprites.map((s) => s.layerOrder || 0)) - 1;
        target.layerOrder = order;
        return;
      }
      case 'looks_goforwardbackward': {
        const delta = num('NUM') * (f('FORWARD_BACKWARD') === 'forward' ? 1 : -1);
        target.layerOrder = (target.layerOrder || 0) + delta;
        return;
      }

      /* ---------------- sound */
      case 'sound_play': {
        if (this.audio) this.audio.play(target, f('SOUND_MENU'), target.volume ?? 100);
        return;
      }
      case 'sound_playuntildone': {
        const name = f('SOUND_MENU');
        const sound = (target.sounds || []).find((s) => s.name === name);
        const dur = sound ? (sound.sampleCount || 0) / (sound.rate || 48000) : 0.5;
        if (this.audio) this.audio.play(target, name, target.volume ?? 100);
        yield* this.waitSeconds(Math.max(0.05, dur));
        return;
      }
      case 'sound_stopallsounds': if (this.audio) this.audio.stopAll(); return;
      case 'sound_changeeffectby':
      case 'sound_seteffectto':
      case 'sound_cleareffects': return;
      case 'sound_setvolumeto': target.volume = Math.max(0, Math.min(100, num('VOLUME'))); return;
      case 'sound_changevolumeby': target.volume = Math.max(0, Math.min(100, (target.volume ?? 100) + num('VOLUME'))); return;

      /* ---------------- events */
      case 'event_broadcast': {
        const name = str('BROADCAST_INPUT') || f('BROADCAST_INPUT');
        this.broadcast(name);
        return;
      }
      case 'event_broadcastandwait': {
        const name = str('BROADCAST_INPUT') || f('BROADCAST_INPUT');
        const started = this.broadcast(name);
        if (started.length) {
          yield { type: 'threads', ids: started.map((t) => t.id) };
        }
        return;
      }
      case 'event_whenflagclicked':
      case 'event_whenkeypressed':
      case 'event_whenthisspriteclicked':
      case 'event_whenbackdropswitchesto':
      case 'event_whengreaterthan':
      case 'event_whenbroadcastreceived':
      case 'control_start_as_clone':
        return;

      /* ---------------- control */
      case 'control_wait': {
        const secs = Math.max(0, num('DURATION'));
        if (secs > 0) yield* this.waitSeconds(secs);
        return;
      }
      case 'control_repeat': {
        const times = Math.max(0, Math.round(num('TIMES')));
        const body = sub();
        for (let i = 0; i < times; i++) {
          if (this.stopped) return;
          if (body) yield* this.execStack(target, body, th);
          yield 'frame';
        }
        return;
      }
      case 'control_forever': {
        const body = sub();
        for (;;) {
          if (this.stopped) return;
          if (body) yield* this.execStack(target, body, th);
          yield 'frame';
        }
      }
      case 'control_if': {
        if (this.boolInput(target, block, 'CONDITION')) {
          const body = sub();
          if (body) yield* this.execStack(target, body, th);
        }
        return;
      }
      case 'control_if_else': {
        const body = this.boolInput(target, block, 'CONDITION') ? sub('SUBSTACK') : sub('SUBSTACK2');
        if (body) yield* this.execStack(target, body, th);
        return;
      }
      case 'control_wait_until': {
        const id = this.inputBlockId(block, 'CONDITION');
        const predicate = () => {
          const condBlock = target.blocks?.[id];
          return condBlock ? toBool(this.evaluate(target, condBlock)) : false;
        };
        while (!predicate()) {
          if (this.stopped) return;
          yield { type: 'until', fn: predicate };
        }
        return;
      }
      case 'control_repeat_until': {
        const id = this.inputBlockId(block, 'CONDITION');
        const body = sub();
        while (true) {
          const condBlock = target.blocks?.[id];
          if (condBlock && toBool(this.evaluate(target, condBlock))) return;
          if (this.stopped) return;
          if (body) yield* this.execStack(target, body, th);
          yield 'frame';
        }
      }
      case 'control_while': {
        const id = this.inputBlockId(block, 'CONDITION');
        const body = sub();
        while (true) {
          const condBlock = target.blocks?.[id];
          if (!condBlock || !toBool(this.evaluate(target, condBlock))) return;
          if (this.stopped) return;
          if (body) yield* this.execStack(target, body, th);
          yield 'frame';
        }
      }
      case 'control_stop': {
        const option = f('STOP_OPTION');
        if (option === 'all') { this.stopAll(); throw STOP_SCRIPT; }
        if (option === 'this script') throw STOP_SCRIPT;
        if (option === 'other scripts in sprite') {
          for (const t of this.threads) if (t.target === target && t !== th) t.done = true;
          return;
        }
        return;
      }
      case 'control_create_clone_of': {
        const which = f('CLONE_OPTION');
        this.createClone(which === '_myself_' ? target : this.spriteName(which));
        return;
      }
      case 'control_delete_this_clone': {
        if (target.isClone) {
          this.deleteClone(target);
          throw STOP_SCRIPT;
        }
        return;
      }

      /* ---------------- sensing */
      case 'sensing_askandwait': {
        const q = str('QUESTION');
        const ans = yield { type: 'ask', question: q };
        this.answer = toStr(ans);
        void ans;
        return;
      }
      case 'sensing_resettimer': this.timerStart = this.time; return;
      case 'sensing_setdragmode': target.dragMode = f('DRAG_MODE'); return;

      /* ---------------- data */
      case 'data_setvariableto': {
        const v = this.lookupVar(target, f('VARIABLE'));
        if (v) v[1] = this.input(target, block, 'VALUE');
        return;
      }
      case 'data_changevariableby': {
        const v = this.lookupVar(target, f('VARIABLE'));
        if (v) v[1] = toNum(v[1]) + num('VALUE');
        return;
      }
      case 'data_showvariable':
      case 'data_hidevariable': {
        const v = this.lookupVar(target, f('VARIABLE'));
        if (!v) return;
        this.project.monitors = this.project.monitors || [];
        const existing = this.project.monitors.find((m) => m.id === f('VARIABLE'));
        const visible = op === 'data_showvariable';
        if (existing) existing.visible = visible;
        else if (visible) {
          this.project.monitors.push({
            id: f('VARIABLE'), mode: 'default', opcode: 'data_variable',
            params: { VARIABLE: v[0] }, spriteName: target.isStage ? null : target.name,
            value: v[1], width: 0, height: 0, x: 5, y: 5, visible: true,
          });
        }
        return;
      }
      case 'data_addtolist': {
        const l = this.lookupList(target, f('LIST'));
        if (l) l[1].push(this.input(target, block, 'ITEM'));
        return;
      }
      case 'data_deleteoflist': {
        const l = this.lookupList(target, f('LIST'));
        if (!l) return;
        const raw = this.input(target, block, 'INDEX');
        if (toStr(raw) === 'all') { l[1] = []; return; }
        let i = Math.floor(toNum(raw));
        if (i < 0) i = l[1].length + i + 1;
        if (i >= 1 && i <= l[1].length) l[1].splice(i - 1, 1);
        return;
      }
      case 'data_deletealloflist': {
        const l = this.lookupList(target, f('LIST'));
        if (l) l[1] = [];
        return;
      }
      case 'data_insertatlist': {
        const l = this.lookupList(target, f('LIST'));
        if (!l) return;
        let i = Math.floor(num('INDEX'));
        if (i < 0) i = l[1].length + i + 2;
        i = Math.max(1, Math.min(l[1].length + 1, i));
        l[1].splice(i - 1, 0, this.input(target, block, 'ITEM'));
        return;
      }
      case 'data_replaceitemoflist': {
        const l = this.lookupList(target, f('LIST'));
        if (!l) return;
        let i = Math.floor(num('INDEX'));
        if (i < 0) i = l[1].length + i + 1;
        if (i >= 1 && i <= l[1].length) l[1][i - 1] = this.input(target, block, 'ITEM');
        return;
      }

      /* ---------------- procedures */
      case 'procedures_call': {
        yield* this.callProcedure(target, block, th);
        return;
      }
      case 'procedures_definition':
        return;

      default: {
        // pen & unknown blocks are ignored gracefully
        return;
      }
    }
  }

  /* ------------------------------------------------------------ procedures */
  procedures(target) {
    if (target.__procs && target.__procsFor === target.blocks) return target.__procs;
    const table = {};
    const blocks = target.blocks || {};
    for (const [id, block] of Object.entries(blocks)) {
      if (block.opcode !== 'procedures_definition') continue;
      const protoId = this.inputBlockId(block, 'custom_block');
      const proto = protoId ? blocks[protoId] : null;
      if (!proto) continue;
      const mutation = proto.mutation || {};
      const proccode = mutation.proccode || '';
      if (!proccode) continue;
      let argumentIds = [];
      let argumentNames = [];
      try { argumentIds = JSON.parse(mutation.argumentids || '[]'); } catch { argumentIds = []; }
      try { argumentNames = JSON.parse(mutation.argumentnames || '[]'); } catch { argumentNames = []; }
      table[proccode] = {
        defId: id,
        protoId,
        argumentIds,
        argumentNames,
        warp: mutation.warp === true || mutation.warp === 'true',
      };
    }
    target.__procs = table;
    target.__procsFor = blocks;
    return table;
  }

  *callProcedure(target, block, th) {
    const proccode = block.mutation?.proccode;
    const procs = this.procedures(target);
    const proc = procs[proccode];
    if (!proc) return;
    const params = {};
    proc.argumentIds.forEach((argId, i) => {
      const name = proc.argumentNames[i] ?? argId;
      const inpId = this.inputBlockId(block, argId);
      params[name] = inpId ? this.evaluate(target, target.blocks[inpId]) : this.input(target, block, argId);
    });
    const list = th_params(target);
    list.push(params);
    if (proc.warp) th.warp++;
    try {
      const defBlock = target.blocks[proc.defId];
      if (defBlock?.next) yield* this.execStack(target, defBlock.next, th);
    } finally {
      list.pop();
      if (proc.warp) th.warp--;
    }
  }

  /* --------------------------------------------------------------- target utils */
  resolveTarget(target, menuValue) {
    if (!menuValue) return null;
    if (menuValue === '_myself_') return target;
    if (menuValue === '_stage_') return this.stage;
    return this.project.targets.find((t) => t.name === menuValue && !t.isStage) || null;
  }

  setCostume(target, name) {
    if (!target.costumes || !target.costumes.length) return;
    if (name === 'next costume') { target.currentCostume = ((target.currentCostume || 0) + 1) % target.costumes.length; return; }
    if (name === 'previous costume') { target.currentCostume = ((target.currentCostume || 0) - 1 + target.costumes.length) % target.costumes.length; return; }
    const asNum = Number(name);
    if (Number.isFinite(asNum) && String(name).trim() !== '' && Number.isInteger(asNum)) {
      const idx = Math.max(0, Math.min(target.costumes.length - 1, asNum - 1));
      target.currentCostume = idx;
      return;
    }
    const idx = target.costumes.findIndex((c) => c.name === name);
    if (idx >= 0) target.currentCostume = idx;
  }

  setBackdrop(name) {
    const stage = this.stage;
    if (!stage?.costumes?.length) return;
    if (name === 'next backdrop') { stage.currentCostume = ((stage.currentCostume || 0) + 1) % stage.costumes.length; return; }
    if (name === 'previous backdrop') { stage.currentCostume = ((stage.currentCostume || 0) - 1 + stage.costumes.length) % stage.costumes.length; return; }
    const idx = stage.costumes.findIndex((c) => c.name === name);
    if (idx >= 0) stage.currentCostume = idx;
  }

  createClone(source) {
    if (!source || this.clones.length >= 300) return null;
    const clone = {
      ...cloneDeep({
        id: `${source.id}_clone${this.clones.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
        name: source.name,
        isStage: false,
        isClone: true,
        spriteId: source.id,
        x: source.x, y: source.y, direction: source.direction, size: source.size,
        visible: source.visible, rotationStyle: source.rotationStyle,
        currentCostume: source.currentCostume, effects: cloneDeep(source.effects || {}),
        volume: source.volume, layerOrder: source.layerOrder, dragMode: source.dragMode,
        variables: cloneDeep(source.variables || {}),
        lists: cloneDeep(source.lists || {}),
        say: null,
      }),
      blocks: source.blocks,
      costumes: source.costumes,
      sounds: source.sounds,
      broadcasts: source.broadcasts,
    };
    if (!clone.visible) clone.visible = true;
    this.clones.push(clone);
    this.fireHatsForTarget(clone, 'control_start_as_clone');
    this.onTargetsChanged();
    return clone;
  }

  fireHatsForTarget(target, opcode) {
    for (const [id, block] of Object.entries(target.blocks || {})) {
      if (block.opcode === opcode) {
        this.startThread(target, id);
      }
    }
  }

  deleteClone(clone) {
    this.clones = this.clones.filter((c) => c !== clone);
    for (const th of this.threads) if (th.target === clone) th.done = true;
    this.threads = this.threads.filter((t) => !t.done);
    this.onTargetsChanged();
  }

  /* --------------------------------------------------------------- geometry */
  bounds(target) {
    if (this.renderer && this.renderer.getBounds) return this.renderer.getBounds(target);
    return { w: 60, h: 60 };
  }

  touchingTarget(a, b) {
    if (this.renderer && this.renderer.touching) return this.renderer.touching(a, b);
    const ba = this.bounds(a); const bb = this.bounds(b);
    return Math.abs((a.x || 0) - (b.x || 0)) < (ba.w + bb.w) / 2 &&
      Math.abs((a.y || 0) - (b.y || 0)) < (ba.h + bb.h) / 2;
  }

  touchingPoint(target, x, y) {
    const b = this.bounds(target);
    return Math.abs(x - (target.x || 0)) <= b.w / 2 && Math.abs(y - (target.y || 0)) <= b.h / 2;
  }

  touchingEdge(target) {
    const b = this.bounds(target);
    return Math.abs(target.x || 0) + b.w / 2 >= this.width / 2 - 0.5 ||
      Math.abs(target.y || 0) + b.h / 2 >= this.height / 2 - 0.5;
  }
}

function th_params(target) {
  if (!target.__paramsStack) target.__paramsStack = [];
  return target.__paramsStack;
}

export function normalizeKey(key) {
  if (key === ' ') return 'space';
  const map = {
    ArrowUp: 'up arrow', ArrowDown: 'down arrow', ArrowLeft: 'left arrow', ArrowRight: 'right arrow',
    Enter: 'enter', Escape: 'escape', Backspace: 'backspace', Delete: 'delete', Tab: 'tab',
  };
  if (map[key]) return map[key];
  return String(key).toLowerCase();
}

export { toNum, toStr, toBool };
