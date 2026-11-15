/** CRAFT WARP — editor bootstrap. */
import { Editor } from './editor.js';
import { applyI18n } from './i18n.js';
import { toast } from './ui.js';

function boot() {
  try {
    applyI18n();
    const editor = new Editor();
    window.craftwarp = editor;
    document.addEventListener('error', (ev) => {
      if (ev.target && ev.target.tagName === 'IMG') return;
      console.error('[cw] runtime error', ev.error || ev.message);
    });
    window.addEventListener('unhandledrejection', (ev) => {
      console.error('[cw] unhandled rejection', ev.reason);
    });
    console.info('%cCRAFT WARP %c v0.1.0 — Rust engine + block editor',
      'background:#4c97ff;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700',
      'color:#8899aa');
  } catch (err) {
    console.error('[cw] boot failed', err);
    const boot = document.getElementById('boot');
    if (boot) {
      boot.innerHTML = `<h1>CRAFT WARP</h1><p style="color:#c33;max-width:420px;text-align:center;line-height:1.8">
        تعذر تشغيل المحرر: ${String(err && err.message || err)}<br/>
        <small>افتح وحدة التحكم (Console) لمزيد من التفاصيل.</small></p>
        <button class="btn primary" onclick="location.reload()">إعادة التحميل</button>`;
    }
    toast('تعذر تشغيل المحرر', 'err');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
