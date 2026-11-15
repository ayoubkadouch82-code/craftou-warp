/** CRAFT WARP — small UI helpers (toasts, modals, dialogs). */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toast(message, kind = 'info', timeout = 2800) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 280);
  }, timeout);
}

const modalLayer = () => document.getElementById('modal-layer');
const modalTitle = () => document.getElementById('modal-title');
const modalBody = () => document.getElementById('modal-body');
let escHandler = null;

export function openModal({ title, body, onMount, width = null, dismissible = true }) {
  const layer = modalLayer();
  if (!layer) return { close: () => {}, body: null };
  layer.hidden = false;
  modalTitle().textContent = title;
  const bodyEl = modalBody();
  bodyEl.innerHTML = typeof body === 'string' ? body : '';
  const modalEl = layer.querySelector('.modal');
  if (width) modalEl.style.width = `min(${width}px, 100%)`;
  if (onMount) onMount(bodyEl);
  const close = () => {
    layer.hidden = true;
    bodyEl.innerHTML = '';
    if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  };
  if (dismissible) {
    escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
  }
  return { close, body: bodyEl, el: modalEl };
}

export function closeModal() {
  const layer = modalLayer();
  if (layer) layer.hidden = true;
  const bodyEl = modalBody();
  if (bodyEl) bodyEl.innerHTML = '';
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
}

export function confirmDialog(message, { ok = 'تأكيد', cancel = 'إلغاء' } = {}) {
  return new Promise((resolve) => {
    const modal = openModal({
      title: 'تأكيد',
      width: 420,
      body: `
        <p style="font-size:13px;line-height:1.9">${escapeHtml(message)}</p>
        <div class="row" style="justify-content:flex-end;margin-top:16px">
          <button class="btn" data-act="cancel">${escapeHtml(cancel)}</button>
          <button class="btn danger" data-act="ok">${escapeHtml(ok)}</button>
        </div>`,
      onMount(body) {
        body.querySelector('[data-act="cancel"]').onclick = () => { modal.close(); resolve(false); };
        body.querySelector('[data-act="ok"]').onclick = () => { modal.close(); resolve(true); };
      },
    });
  });
}

export function promptDialog(title, value = '', { placeholder = '', ok = 'حفظ' } = {}) {
  return new Promise((resolve) => {
    const modal = openModal({
      title,
      width: 420,
      body: `
        <input class="input" id="cw-prompt-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button class="btn" data-act="cancel">إلغاء</button>
          <button class="btn primary" data-act="ok">${escapeHtml(ok)}</button>
        </div>`,
      onMount(body) {
        const input = body.querySelector('#cw-prompt-input');
        input.focus();
        input.select();
        const submit = () => { const v = input.value.trim(); modal.close(); resolve(v || null); };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') { modal.close(); resolve(null); }
        });
        body.querySelector('[data-act="ok"]').onclick = submit;
        body.querySelector('[data-act="cancel"]').onclick = () => { modal.close(); resolve(null); };
      },
    });
  });
}

export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function debounce(fn, ms = 300) {
  let timer = 0;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(timer); fn(...args); };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function throttle(fn, ms = 100) {
  let last = 0;
  let timer = 0;
  return (...args) => {
    const now = performance.now();
    if (now - last >= ms) { last = now; fn(...args); return; }
    clearTimeout(timer);
    timer = setTimeout(() => { last = performance.now(); fn(...args); }, ms - (now - last));
  };
}

export function initials(name) {
  const clean = String(name || '?').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export function downloadText(text, filename, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
