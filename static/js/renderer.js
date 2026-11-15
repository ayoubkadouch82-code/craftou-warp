/**
 * CRAFT WARP — canvas stage renderer.
 * Draws backdrops, sprites (rotation styles, size, effects), speech bubbles,
 * variable monitors and reports geometry back to the VM for sensing blocks.
 */

export function assetKey(costumeOrSound) {
  if (!costumeOrSound) return '';
  return costumeOrSound.md5ext || costumeOrSound.assetId || costumeOrSound.name || '';
}

export function getAsset(project, key) {
  if (!project?.assets) return null;
  return project.assets[key] || null;
}

export class Renderer {
  constructor(canvas, vm, project) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.vm = vm;
    this.project = project;
    this.images = new Map(); // key -> {img, ready}
    this.scale = 1;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.raf = 0;
    this.last = 0;
    this.dirty = true;
    this.mouseOver = false;
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  setProject(project) {
    this.project = project;
    this.images.clear();
    this.dirty = true;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scale = w / 480;
    this.scaleY = h / 360;
    this.dirty = true;
    this.draw();
  }

  image(key) {
    if (!key) return null;
    if (this.images.has(key)) {
      const entry = this.images.get(key);
      return entry.ready ? entry.img : null;
    }
    const asset = getAsset(this.project, key);
    if (!asset || !asset.dataUrl) return null;
    const img = new Image();
    const entry = { img, ready: false };
    this.images.set(key, entry);
    img.onload = () => {
      entry.ready = true;
      if (entry.naturalW === undefined) {
        entry.naturalW = img.naturalWidth;
        entry.naturalH = img.naturalHeight;
      }
      this.dirty = true;
    };
    img.onerror = () => { entry.ready = false; this.dirty = true; };
    img.src = asset.dataUrl;
    return null;
  }

  preload() {
    for (const target of this.vm?.targets || []) {
      for (const costume of target.costumes || []) this.image(assetKey(costume));
    }
    if (this.vm?.stage) {
      for (const costume of this.vm.stage.costumes || []) this.image(assetKey(costume));
    }
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.vm) {
        this.vm.step(dt);
        if (this.vm.threads.length || this.vm.running) this.dirty = true;
      }
      if (this.dirty) {
        this.dirty = false;
        this.draw();
      }
      for (const t of this.vm?.targets || []) {
        if (t.say && t.say.until !== Infinity && this.vm.time > t.say.until) t.say = null;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /* --------------------------------------------------------------- drawing */
  costumeOf(target) {
    const list = target?.costumes || [];
    return list[(target.currentCostume || 0) % Math.max(1, list.length)] || null;
  }

  costumeImage(costume) {
    if (!costume) return null;
    return this.image(assetKey(costume));
  }

  naturalSize(target, costume) {
    const entry = this.images.get(assetKey(costume));
    const res = costume?.bitmapResolution || 1;
    const w = entry?.naturalW || costume?.width || 100;
    const h = entry?.naturalH || costume?.height || 100;
    const s = ((target?.size ?? 100) / 100) / res;
    return { w: w * s, h: h * s, cx: (costume?.rotationCenterX ?? w / 2) / res, cy: (costume?.rotationCenterY ?? h / 2) / res };
  }

  draw() {
    const ctx = this.ctx;
    const { canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sx = this.scale;
    const sy = this.scaleY || this.scale;
    ctx.setTransform(sx, 0, 0, sy, canvas.width / 2, canvas.height / 2);

    this.drawBackdrop(ctx);
    const order = this.drawOrder();
    for (const target of order) {
      this.drawSprite(ctx, target);
    }
    for (const target of order) {
      if (target.say) this.drawBubble(ctx, target);
    }
    this.drawMonitors(ctx);
  }

  drawBackdrop(ctx) {
    const stage = this.vm?.stage || this.project?.targets?.[0];
    if (!stage) return;
    const costume = this.costumeOf(stage);
    const img = this.costumeImage(costume);
    if (img) {
      ctx.save();
      ctx.globalAlpha = 1;
      const entry = this.images.get(assetKey(costume));
      const res = costume.bitmapResolution || 1;
      const w = (entry?.naturalW || 480) / res;
      const h = (entry?.naturalH || 360) / res;
      const scaleToFit = Math.max(480 / w, 360 / h);
      ctx.drawImage(img, (-w * scaleToFit) / 2, (-h * scaleToFit) / 2, w * scaleToFit, h * scaleToFit);
      ctx.restore();
    } else {
      ctx.fillStyle = '#eef3fa';
      ctx.fillRect(-240, -180, 480, 360);
    }
  }

  drawOrder() {
    const sprites = (this.vm?.sprites || []).slice();
    const clones = this.vm?.clones || [];
    const ordered = [];
    const sorted = sprites.slice().sort((a, b) => (a.layerOrder || 0) - (b.layerOrder || 0));
    for (const sprite of sorted) {
      ordered.push(sprite);
      for (const clone of clones) {
        if (clone.spriteId === sprite.id) ordered.push(clone);
      }
    }
    for (const clone of clones) if (!ordered.includes(clone)) ordered.push(clone);
    return ordered.filter((t) => t.visible !== false);
  }

  drawSprite(ctx, target) {
    const costume = this.costumeOf(target);
    const img = this.costumeImage(costume);
    const effects = target.effects || {};
    const ghost = Math.min(100, Math.max(0, effects.ghost || 0));
    if (ghost >= 100) return;

    ctx.save();
    ctx.translate(target.x || 0, -(target.y || 0));
    const theta = (((target.direction ?? 90) - 90) * Math.PI) / 180;
    const style = target.rotationStyle || 'all around';
    let mirror = false;
    if (style === 'all around') ctx.rotate(theta);
    else if (style === 'left-right') mirror = (target.direction ?? 90) < 0;

    ctx.globalAlpha = 1 - ghost / 100;
    const brightness = Math.min(200, Math.max(-100, effects.brightness || 0));
    const color = effects.color || 0;
    if (brightness !== 0 || color !== 0) {
      const filters = [];
      if (brightness !== 0) filters.push(`brightness(${Math.max(0, 1 + brightness / 100)})`);
      if (color !== 0) filters.push(`hue-rotate(${color * 3.6}deg)`);
      ctx.filter = filters.join(' ');
    }

    if (img) {
      const entry = this.images.get(assetKey(costume));
      const res = costume?.bitmapResolution || 1;
      const nw = entry?.naturalW || costume?.width || 100;
      const nh = entry?.naturalH || costume?.height || 100;
      const s = ((target.size ?? 100) / 100) / res;
      const cx = (costume?.rotationCenterX ?? nw / 2) / res;
      const cy = (costume?.rotationCenterY ?? nh / 2) / res;
      if (mirror) ctx.scale(-1, 1);
      ctx.drawImage(img, -cx * s, -cy * s, nw * s, nh * s);
    } else {
      // placeholder while assets load
      ctx.fillStyle = '#c9d7e8';
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(target.name?.slice(0, 8) || '', 0, -32);
    }
    ctx.restore();
  }

  drawBubble(ctx, target) {
    const say = target.say;
    if (!say || !say.text) return;
    const text = String(say.text);
    const isThink = say.kind === 'think';
    ctx.save();
    ctx.font = '12px "Helvetica Neue", Helvetica, Arial, sans-serif';
    const maxW = 150;
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    const lineH = 15;
    const w = Math.min(maxW + 18, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18);
    const h = lines.length * lineH + 14;
    const b = this.getBounds(target);
    let x = (target.x || 0) + b.w / 2 + 6;
    let y = -(target.y || 0) - b.h / 2 - h - 12;
    if (x + w > 236) x = (target.x || 0) - b.w / 2 - w - 6;
    if (y < -176) y = -(target.y || 0) + b.h / 2 + 8;
    x = Math.max(-236, Math.min(236 - w, x));

    ctx.fillStyle = isThink ? 'rgba(255,255,255,.96)' : '#ffffff';
    ctx.strokeStyle = '#cfd9e6';
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, y, w, h, 10, true);
    // tail
    ctx.beginPath();
    const tcx = Math.max(x + 14, Math.min(x + w - 14, x + 12));
    if (isThink) {
      ctx.arc(tcx + 4, y + h + 8, 3.2, 0, Math.PI * 2);
      ctx.arc(tcx + 11, y + h + 15, 2, 0, Math.PI * 2);
    } else {
      ctx.moveTo(tcx, y + h - 1);
      ctx.lineTo(tcx + 10, y + h - 1);
      ctx.lineTo(tcx + 2, y + h + 10);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2c3a4d';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x + 9, y + 8 + i * lineH));
    ctx.restore();
  }

  drawMonitors(ctx) {
    const monitors = (this.project?.monitors || []).filter((m) => m.visible);
    if (!monitors.length) return;
    const stage = this.vm?.stage;
    let y = -170;
    for (const monitor of monitors) {
      const variable = stage?.variables?.[monitor.id];
      const value = variable ? variable[1] : monitor.value;
      const label = `${variable ? variable[0] : 'value'}: ${typeof value === 'number' ? Math.round(value * 100) / 100 : value}`;
      ctx.save();
      ctx.font = '10px "Helvetica Neue", Helvetica, Arial, sans-serif';
      const w = Math.min(180, ctx.measureText(label).width + 18);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.strokeStyle = '#c7d3e2';
      roundRect(ctx, -232, y, w, 18, 4, true);
      ctx.fillStyle = '#33415a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, -224, y + 10);
      ctx.restore();
      y += 22;
    }
  }

  /* -------------------------------------------------------------- geometry */
  getBounds(target) {
    const costume = this.costumeOf(target);
    const size = this.naturalSize(target, costume);
    const theta = Math.abs(((target.direction ?? 90) - 90) * Math.PI / 180);
    if ((target.rotationStyle || 'all around') !== 'all around') {
      return { w: size.w, h: size.h };
    }
    const c = Math.abs(Math.cos(theta));
    const s = Math.abs(Math.sin(theta));
    return { w: size.w * c + size.h * s, h: size.w * s + size.h * c };
  }

  touching(a, b) {
    if (!a || !b) return false;
    const ba = this.getBounds(a);
    const bb = this.getBounds(b);
    return Math.abs((a.x || 0) - (b.x || 0)) < (ba.w + bb.w) / 2 &&
      Math.abs((a.y || 0) - (b.y || 0)) < (ba.h + bb.h) / 2;
  }

  /** topmost visible sprite at stage coordinates */
  pickAt(x, y) {
    const order = this.drawOrder().slice().reverse();
    for (const target of order) {
      const b = this.getBounds(target);
      if (Math.abs(x - (target.x || 0)) <= b.w / 2 && Math.abs(y - (target.y || 0)) <= b.h / 2) {
        return target;
      }
    }
    return null;
  }

  toStage(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 480 - 240;
    const y = 180 - ((clientY - rect.top) / rect.height) * 360;
    return { x, y };
  }

  invalidate() { this.dirty = true; }
}

export function roundRect(ctx, x, y, w, h, r, fill = false) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) { ctx.fill(); ctx.stroke(); }
}

/** Paint a costume into a small canvas (sprite pane, costume tab, library). */
export function drawCostumeToCanvas(canvas, project, costume, { background = 'transparent' } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  const asset = getAsset(project, assetKey(costume));
  if (!asset?.dataUrl) return;
  const img = new Image();
  img.onload = () => {
    const res = costume.bitmapResolution || 1;
    const nw = img.naturalWidth / res;
    const nh = img.naturalHeight / res;
    const scale = Math.min(w / nw, h / nh) * 0.86;
    ctx.drawImage(img, (w - nw * scale) / 2, (h - nh * scale) / 2, nw * scale, nh * scale);
  };
  img.src = asset.dataUrl;
}
