/**
 * CRAFT WARP — block painter.
 *
 * Draws Scratch-shaped blocks (notches, C arms, hats, boolean hexagons) as pure
 * SVG strings. Geometry is computed in workspace units (48 px grid feel, 40 px
 * block height) so the same painter is used by the workspace, the palette and
 * the drag ghost.
 */
import { getDef, CATEGORY_COLORS } from './blocks.js';

export const H = 40;
export const HAT_TOP = 14;
export const FOOT = 24;
export const INNER_MIN = 24;
export const INDENT = 16;
export const PAD = 12;
export const SLOT_H = 20;
const R = 5;
const NOTCH_W = 8;

const FONT = '500 12.5px "Helvetica Neue", Helvetica, Arial, sans-serif';
let measureCtx = null;
function measure(text, font = FONT) {
  if (!measureCtx) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    measureCtx = c.getContext('2d');
  }
  measureCtx.font = font;
  return measureCtx.measureText(String(text)).width;
}

export function shade(hex, amount) {
  const clean = String(hex || '#4c97ff').replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* --------------------------------------------------------------- paths */
function stackPath(x, y, w, h, { topNotch = true, bottomTab = true, radius = R } = {}) {
  const r = radius;
  let d = `M${x + r},${y}`;
  if (topNotch) {
    d += `H${x + 16}c0,0 2,4 4,4h${NOTCH_W}c2,0 4,-4 4,-4`;
  }
  d += `H${x + w - r}q${r},0 ${r},${r}V${y + h - r}`;
  d += `q0,${r} -${r},${r}`;
  if (bottomTab) {
    d += `H${x + 32}c-2,0 -2,4 -4,4h-${NOTCH_W}c-2,0 -2,-4 -4,-4`;
  }
  d += `H${x + r}q-${r},0 -${r},-${r}V${y + r}q0,-${r} ${r},-${r}Z`;
  return d;
}

function hatPath(x, y, w, h) {
  const r = R;
  return `M${x},${y + 26}` +
    `q0,-26 26,-26H${x + w - 26}q26,0 26,26` +
    `V${y + h - r}q0,${r} -${r},${r}` +
    `H${x + 32}c-2,0 -2,4 -4,4h-${NOTCH_W}c-2,0 -2,-4 -4,-4H${x + r}` +
    `q-${r},0 -${r},-${r}Z`;
}

function reporterPath(x, y, w, h) {
  const r = h / 2;
  return `M${x + r},${y}H${x + w - r}a${r},${r} 0 0 1 0,${h}H${x + r}a${r},${r} 0 0 1 0,-${h}Z`;
}

function booleanPath(x, y, w, h) {
  const b = 7;
  return `M${x + b},${y}H${x + w - b}L${x + w},${y + h / 2}L${x + w - b},${y + h}H${x + b}L${x},${y + h / 2}Z`;
}

function cPath(x, y, w, h, { cavities, footH, topNotch = true, bottomTab = true }) {
  const r = R;
  let d = `M${x + r},${y}`;
  if (topNotch) d += `H${x + 16}c0,0 2,4 4,4h${NOTCH_W}c2,0 4,-4 4,-4`;
  d += `H${x + w - r}q${r},0 ${r},${r}V${y + h - r}q0,${r} -${r},${r}`;
  if (bottomTab) d += `H${x + 32}c-2,0 -2,4 -4,4h-${NOTCH_W}c-2,0 -2,-4 -4,-4`;
  d += `H${x + r}q-${r},0 -${r},-${r}`;
  d += `V${y + h - footH}`;
  const sorted = cavities.slice().sort((a, b) => b.top - a.top);
  for (const cav of sorted) {
    d += `V${cav.top + cav.height}H${x + INDENT}V${cav.top}H${x}`;
  }
  d += `V${y + r}q0,-${r} ${r},-${r}Z`;
  return d;
}

/* -------------------------------------------------------------- painter */
export class BlockPainter {
  constructor(project, target) {
    this.project = project;
    this.target = target;
  }

  colorFor(block) {
    const def = getDef(block.opcode);
    return CATEGORY_COLORS[def.cat] || '#4c97ff';
  }

  fieldLabel(block, name, part) {
    const raw = block.fields?.[name];
    let value = Array.isArray(raw) ? raw[0] : raw ?? part?.v ?? '';
    if (part?.k === 'var') {
      const found = Object.values(this.target?.variables || {}).find(([, n]) => n === value) ||
        Object.values(this.project?.targets?.[0]?.variables || {}).find(([, n]) => n === value);
      if (raw) {
        const byId = this.target?.variables?.[raw[0]] || this.project?.targets?.[0]?.variables?.[raw[0]];
        if (byId) value = byId[0];
      }
      if (found) value = found[0];
    }
    if (part?.k === 'list') {
      if (raw) {
        const byId = this.target?.lists?.[raw[0]] || this.project?.targets?.[0]?.lists?.[raw[0]];
        if (byId) value = byId[0];
      }
    }
    if (part?.k === 'dropdown' && part.opts?.length && !part.opts.includes(value)) {
      value = part.opts[0];
    }
    if (part?.k === 'color') value = value || part.v || '#4c97ff';
    return String(value ?? '');
  }

  /** Paints one stack; returns { svg, width, height, blocks: [] } */
  paintStack(startId, x, y, { ghost = false } = {}) {
    let svg = '';
    let cursorY = y;
    let width = 0;
    let id = startId;
    let guard = 0;
    const ids = [];
    while (id && this.target?.blocks?.[id] && guard++ < 400) {
      const block = this.target.blocks[id];
      const res = this.paintBlock(block, x, cursorY, { ghost, id });
      svg += res.svg;
      width = Math.max(width, res.width);
      cursorY += res.height;
      ids.push(id);
      id = block.next;
    }
    return { svg, width, height: cursorY - y, ids };
  }

  paintBlock(block, x, y, { ghost = false, id = null } = {}) {
    const def = getDef(block.opcode);
    const color = this.colorFor(block);
    const stroke = shade(color, -46);
    const shape = def.shape;
    const isHat = shape === 'hat';
    const parts = def.parts || [];
    const hasSubstack = parts.some((p) => p && p.i === 'SUBSTACK');
    const isC = shape === 'c';
    const top = y + (isHat ? HAT_TOP : 0);
    const rowH = H;
    let cursorX = x + PAD;
    let inner = '';
    const rowY = top;

    const partsSvg = [];
    const slotMarkup = [];

    for (const part of parts) {
      if (typeof part === 'string') {
        if (!part) continue;
        const w = measure(part);
        partsSvg.push(`<text x="${cursorX}" y="${rowY + H / 2 + 4.5}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="12.5" font-weight="500" fill="#ffffff" pointer-events="none">${esc(part)}</text>`);
        cursorX += w + 6;
        continue;
      }
      if (!part) continue;
      if (part.icon) {
        const glyph = part.icon === 'flag'
          ? `<path d="M3 2v12M3 2l8 2.4L3 7z" stroke="#ffffff" stroke-width="1.6" fill="#ffffff" stroke-linejoin="round"/>`
          : part.icon === 'right'
            ? `<path d="M4 9a5 5 0 1 1 2 4" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/><path d="M3.4 10.6 4 14l3-1.6z" fill="#ffffff"/>`
            : `<path d="M12 9a5 5 0 1 0 -2 4" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/><path d="M12.6 10.6 12 14l-3-1.6z" fill="#ffffff"/>`;
        inner += `<g transform="translate(${cursorX},${rowY + H / 2 - 8})" pointer-events="none" style="pointer-events:none">${glyph}</g>`;
        cursorX += 18;
        continue;
      }
      if (part.i === 'SUBSTACK' || part.i === 'SUBSTACK2' || part.k === 'stack') continue;

      if (part.k === 'menu' || part.f) {
        const name = part.f || part.i;
        const label = this.fieldLabel(block, name, part);
        const isColor = part.k === 'color';
        const w = Math.max(30, measure(label) + (isColor ? 34 : 30));
        const h = SLOT_H + 2;
        const yMid = rowY + (H - h) / 2;
        const fill = isColor ? '#ffffff' : shade(color, 26);
        const textFill = isColor ? '#2b3446' : '#ffffff';
        inner += `<g class="cw-field" data-f="${esc(name)}" data-kind="${esc(part.k || 'dropdown')}" style="cursor:pointer">` +
          `<rect x="${cursorX - 2}" y="${yMid}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${shade(color, -30)}" stroke-width="1"/>` +
          (isColor ? `<circle cx="${cursorX + 10}" cy="${yMid + h / 2}" r="7" fill="${label}" stroke="#b9c6d6" stroke-width="1"/>` : '') +
          `<text x="${isColor ? cursorX + 23 : cursorX + 12}" y="${yMid + h / 2 + 4}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="12" font-weight="600" fill="${textFill}" pointer-events="none">${esc(isColor ? label.toUpperCase() : label)}</text>` +
          (isColor ? '' : `<path d="M${cursorX + w - 15} ${yMid + h / 2 - 2.5}l4.5 4.5 4.5-4.5" fill="none" stroke="${textFill}" stroke-width="1.6" stroke-linecap="round" pointer-events="none"/>`) +
          `</g>`;
        cursorX += w + 6;
        continue;
      }

      // inputs: reporter / boolean / number / text
      const nestedId = typeof block.inputs?.[part.i]?.[1] === 'string' ? block.inputs[part.i][1] : null;
      if (nestedId && this.target?.blocks?.[nestedId]) {
        const nestedBlock = this.target.blocks[nestedId];
        const probe = this.paintBlock(nestedBlock, -9999, -9999, { ghost });
        const offsetY = rowY + Math.max(0, (H - probe.height) / 2);
        const res = this.paintBlock(nestedBlock, cursorX, offsetY, { ghost, id: nestedId });
        inner += `<g class="cw-slot" data-i="${esc(part.i)}" data-accept="${part.k === 'boolean' ? 'boolean' : 'reporter'}">${res.svg}</g>`;
        cursorX += res.width + 6;
        continue;
      }

      if (part.k === 'boolean') {
        const w = 44;
        const h = 20;
        const yMid = rowY + (H - h) / 2;
        inner += `<g class="cw-slot" data-i="${esc(part.i)}" data-accept="boolean" style="cursor:pointer">` +
          `<path d="${booleanPath(cursorX, yMid, w, h)}" fill="${shade(color, -34)}" stroke="${shade(color, -52)}" stroke-width="1"/>` +
          `</g>`;
        cursorX += w + 6;
        continue;
      }

      const raw = block.inputs?.[part.i];
      const value = this.inputLabel(raw);
      const w = Math.max(part.k === 'number' ? 36 : 44, measure(value) + 20);
      const h = SLOT_H;
      const yMid = rowY + (H - h) / 2;
      inner += `<g class="cw-slot cw-input" data-i="${esc(part.i)}" data-accept="reporter" data-kind="${esc(part.k)}" style="cursor:text">` +
        `<rect x="${cursorX}" y="${yMid}" width="${w}" height="${h}" rx="${h / 2}" fill="#ffffff" stroke="${shade(color, -20)}" stroke-width="1"/>` +
        `<text x="${cursorX + w / 2}" y="${yMid + h / 2 + 4}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="12" font-weight="500" fill="#2b3446" pointer-events="none">${esc(value)}</text>` +
        `</g>`;
      cursorX += w + 6;
    }

    let width = Math.max(96, cursorX - x + PAD - 6);
    const headH = (isHat ? HAT_TOP : 0) + rowH;
    let height = headH;
    let substackSvg = '';
    const cavities = [];
    let midsSvg = '';

    if (isC) {
      const sub1 = block.inputs?.SUBSTACK?.[1];
      const sub2 = block.inputs?.SUBSTACK2?.[1];
      const hasElse = parts.some((p) => p && p.i === 'SUBSTACK2') || !!sub2;
      let innerY = top + H;
      const s1 = sub1 ? this.paintStack(sub1, x + INDENT, innerY) : { svg: '', width: 0, height: 0 };
      const h1 = Math.max(INNER_MIN, s1.height + (s1.height ? 8 : 0));
      substackSvg += s1.svg;
      cavities.push({ top: innerY, height: h1, name: 'SUBSTACK' });
      innerY += h1;
      width = Math.max(width, s1.width + INDENT + PAD + 8);

      if (hasElse) {
        midsSvg += `<text x="${x + PAD}" y="${innerY + 16}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="12.5" font-weight="500" fill="#ffffff" pointer-events="none">else</text>`;
        innerY += 22;
        const s2 = sub2 ? this.paintStack(sub2, x + INDENT, innerY) : { svg: '', width: 0, height: 0 };
        const h2 = Math.max(INNER_MIN, s2.height + (s2.height ? 8 : 0));
        substackSvg += s2.svg;
        cavities.push({ top: innerY, height: h2, name: 'SUBSTACK2' });
        innerY += h2;
        width = Math.max(width, s2.width + INDENT + PAD + 8);
      }
      height = innerY + FOOT - y;
    }

    let path;
    if (isC) {
      path = cPath(x, y, width, height, {
        cavities,
        footH: FOOT,
        topNotch: true,
        bottomTab: def.cap !== true,
      });
    } else if (isHat) {
      path = hatPath(x, y, width, height, {});
    } else if (shape === 'reporter') {
      path = reporterPath(x, y, width, height);
    } else if (shape === 'boolean') {
      path = booleanPath(x, y + 2, width, height - 4);
    } else {
      path = stackPath(x, y, width, height, {
        topNotch: !isHat,
        bottomTab: def.cap !== true,
      });
    }

    const markers = isC
      ? cavities.map((cav) => `<rect class="cw-substack" data-i="${esc(cav.name || 'SUBSTACK')}" x="${x + INDENT}" y="${cav.top}" width="${Math.max(24, width - INDENT - 4)}" height="${cav.height}" fill="none" pointer-events="none"/>`).join('')
      : '';
    const body = (partsSvg.join('') + inner + midsSvg + substackSvg + markers);

    const svg = `<g class="block-group" data-b="${esc(id || '')}" ${ghost ? 'opacity="0.95"' : ''}>` +
      `<path d="${path}" fill="${color}" stroke="${stroke}" stroke-width="1"/>` +
      body +
      `</g>`;

    return { svg, width, height };
  }

  inputLabel(raw) {
    if (!raw) return '';
    const v = raw[1];
    if (Array.isArray(v)) return String(v[1] ?? '');
    if (typeof v === 'string' && this.target?.blocks?.[v]) {
      const block = this.target.blocks[v];
      const def = getDef(block.opcode);
      if (def.shape === 'reporter' || def.shape === 'boolean') return '▭';
      return '';
    }
    return '';
  }
}

/* --------------------------------------------------------- single blocks */
export function paintStandaloneBlock(project, target, block, x = 0, y = 0) {
  const painter = new BlockPainter(project, target);
  const res = painter.paintBlock({ ...block, next: null }, x, y, {});
  return { svg: res.svg, width: res.width, height: res.height };
}

export function paintStackSvg(project, target, startId, x = 0, y = 0) {
  const painter = new BlockPainter(project, target);
  return painter.paintStack(startId, x, y);
}

export { stackPath, hatPath, reporterPath, booleanPath, cPath, measure, esc };
