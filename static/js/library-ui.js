/** CRAFT WARP — library browser + built-in paint editor. */
import { openModal, toast, escapeHtml } from './ui.js';
import { SPRITE_LIBRARY, BACKDROP_LIBRARY } from './library.js';
import { SOUND_LIBRARY } from './audio.js';
import { t } from './i18n.js';

const ICON_SOUND = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 3v18l-6-5H3V8h3l6-5zm4.5 3.5a6 6 0 0 1 0 11v-2.2a3.8 3.8 0 0 0 0-6.6V6.5z"/></svg>`;

export function openLibrary(editor, kind = 'sprite') {
  const titles = {
    sprite: t('chooseSprite'),
    backdrop: t('chooseBackdrop'),
    sound: t('chooseSound'),
  };
  const modal = openModal({
    title: titles[kind] || t('library'),
    width: 820,
    body: `<div class="lib-tabs" id="lib-tabs"></div><div id="lib-content"></div>`,
    onMount(body) {
      const tabsEl = body.querySelector('#lib-tabs');
      const contentEl = body.querySelector('#lib-content');

      if (kind === 'sound') {
        tabsEl.innerHTML = `<span class="lib-tab active">${t('soundLib')}</span>`;
        contentEl.innerHTML = `<div class="lib-grid">${SOUND_LIBRARY.map((s, i) => `
          <div class="lib-item" data-sound="${i}">
            <div class="audio-pill" style="width:44px;height:44px;border-radius:12px">${ICON_SOUND}</div>
            <span class="lib-name">${escapeHtml(s.name)}</span>
          </div>`).join('')}</div>`;
        contentEl.querySelectorAll('[data-sound]').forEach((el) => {
          el.onclick = () => {
            const entry = SOUND_LIBRARY[Number(el.dataset.sound)];
            editor.addSoundFromLibrary(entry);
            modal.close();
          };
        });
        return;
      }

      if (kind === 'backdrop') {
        tabsEl.innerHTML = `<span class="lib-tab active">${t('backdrops')}</span>`;
        contentEl.innerHTML = `<div class="lib-grid">${BACKDROP_LIBRARY.map((b, i) => `
          <div class="lib-item" data-backdrop="${i}">
            <img class="lib-svg" style="width:96px;height:72px;object-fit:cover;border-radius:6px" src="${b.dataUrl}" alt="" />
            <span class="lib-name">${escapeHtml(b.name)}</span>
          </div>`).join('')}</div>`;
        contentEl.querySelectorAll('[data-backdrop]').forEach((el) => {
          el.onclick = () => {
            const entry = BACKDROP_LIBRARY[Number(el.dataset.backdrop)];
            editor.addBackdropFromLibrary(entry);
            modal.close();
          };
        });
        return;
      }

      const categories = [
        { id: 'all', label: 'الكل' },
        { id: 'animals', label: t('animals') },
        { id: 'fantasy', label: t('fantasy') },
        { id: 'items', label: t('items') },
      ];
      const render = (cat) => {
        const items = SPRITE_LIBRARY.filter((s) => cat === 'all' || s.category === cat);
        contentEl.innerHTML = `<div class="lib-grid">${items.map((s) => `
          <div class="lib-item" data-sprite="${escapeHtml(s.id)}">
            <img class="lib-svg" src="${s.costumes[0].dataUrl}" alt="" />
            <span class="lib-name">${escapeHtml(s.name)}</span>
          </div>`).join('')}</div>`;
        contentEl.querySelectorAll('[data-sprite]').forEach((el) => {
          el.onclick = () => {
            const entry = SPRITE_LIBRARY.find((s) => s.id === el.dataset.sprite);
            editor.addSpriteFromLibrary(entry);
            modal.close();
          };
        });
      };
      tabsEl.innerHTML = categories.map((c) => `<button class="lib-tab ${c.id === 'all' ? 'active' : ''}" data-cat="${c.id}">${escapeHtml(c.label)}</button>`).join('');
      tabsEl.querySelectorAll('[data-cat]').forEach((btn) => {
        btn.onclick = () => {
          tabsEl.querySelectorAll('.lib-tab').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          render(btn.dataset.cat);
        };
      });
      render('all');
    },
  });
  return modal;
}

const PAINT_COLORS = ['#000000', '#ffffff', '#ec5959', '#ff8c1a', '#ffbf00', '#40bf4a', '#0fbd8c',
  '#4c97ff', '#9966ff', '#cf63cf', '#8a5b33', '#8899aa'];

export function openPaint(editor, { asBackdrop = false } = {}) {
  const width = 480;
  const height = 360;
  const modal = openModal({
    title: asBackdrop ? 'رسم خلفية' : 'رسم مظهر',
    width: 620,
    body: `
      <div class="paint-tools row" style="margin-bottom:8px">
        <div class="row" id="paint-colors"></div>
        <label class="muted" style="display:flex;align-items:center;gap:6px">الحجم
          <input id="paint-size" type="range" min="1" max="40" value="6" style="width:90px" />
        </label>
        <button class="btn" id="paint-eraser">ممحاة</button>
        <button class="btn" id="paint-undo">تراجع</button>
        <button class="btn" id="paint-clear">مسح</button>
      </div>
      <div style="border:1px solid #d7e0ea;border-radius:10px;overflow:hidden;background:
        repeating-conic-gradient(#eef2f7 0% 25%, #ffffff 0% 50%) 50% / 18px 18px">
        <canvas id="paint-canvas" width="${width}" height="${height}" style="width:100%;display:block;touch-action:none;cursor:crosshair"></canvas>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:12px">
        <button class="btn" id="paint-cancel">إلغاء</button>
        <button class="btn primary" id="paint-save">${asBackdrop ? 'إضافة كخلفية' : 'إضافة كمظهر'}</button>
      </div>`,
    onMount(body) {
      const canvas = body.querySelector('#paint-canvas');
      const ctx = canvas.getContext('2d');
      if (asBackdrop) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
      let color = '#000000';
      let size = 6;
      let erasing = false;
      let drawing = false;
      const history = [];
      const colorsEl = body.querySelector('#paint-colors');
      PAINT_COLORS.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.style.cssText = `width:20px;height:20px;border-radius:50%;background:${c};border:2px solid ${i === 0 ? '#4c97ff' : '#dfe6ee'};margin-inline-end:4px`;
        btn.onclick = () => {
          color = c;
          erasing = false;
          body.querySelectorAll('#paint-colors button').forEach((b) => { b.style.borderColor = '#dfe6ee'; });
          btn.style.borderColor = '#4c97ff';
        };
        colorsEl.appendChild(btn);
      });

      const pushHistory = () => {
        history.push(ctx.getImageData(0, 0, width, height));
        if (history.length > 20) history.shift();
      };

      const pos = (ev) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: ((ev.clientX - rect.left) / rect.width) * width,
          y: ((ev.clientY - rect.top) / rect.height) * height,
        };
      };
      const stroke = (from, to) => {
        ctx.save();
        ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      };
      let last = null;
      canvas.addEventListener('pointerdown', (ev) => {
        canvas.setPointerCapture(ev.pointerId);
        pushHistory();
        drawing = true;
        last = pos(ev);
        stroke(last, last);
      });
      canvas.addEventListener('pointermove', (ev) => {
        if (!drawing) return;
        const p = pos(ev);
        stroke(last || p, p);
        last = p;
      });
      const end = () => { drawing = false; last = null; };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointerleave', end);

      body.querySelector('#paint-size').oninput = (ev) => { size = Number(ev.target.value); };
      body.querySelector('#paint-eraser').onclick = (ev) => {
        erasing = !erasing;
        ev.target.classList.toggle('primary', erasing);
      };
      body.querySelector('#paint-undo').onclick = () => {
        const snap = history.pop();
        if (snap) ctx.putImageData(snap, 0, 0);
      };
      body.querySelector('#paint-clear').onclick = () => {
        pushHistory();
        ctx.clearRect(0, 0, width, height);
        if (asBackdrop) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
      };
      body.querySelector('#paint-cancel').onclick = () => modal.close();
      body.querySelector('#paint-save').onclick = () => {
        const dataUrl = canvas.toDataURL('image/png');
        if (asBackdrop) editor.addBackdropFromDataUrl(dataUrl, 'رسمي');
        else editor.addCostumeFromDataUrl(dataUrl, 'رسمي');
        toast('تمت إضافة الرسم', 'ok');
        modal.close();
      };
    },
  });
  return modal;
}
