/**
 * CRAFT WARP — built-in sprite / backdrop / sound library.
 * Everything is generated as inline SVG so the editor has no asset downloads:
 * instant load, works offline, tiny install.
 */

const svgUrl = (w, h, inner) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const costume = (name, w, h, inner, center) => ({
  name,
  ext: 'svg',
  width: w,
  height: h,
  dataUrl: svgUrl(w, h, inner),
  rotationCenterX: center ? center[0] : w / 2,
  rotationCenterY: center ? center[1] : h / 2,
  bitmapResolution: 1,
});

/* ------------------------------------------------------------------- cat */
const catA = costume('cat-a', 180, 140, `
  <g>
    <path d="M26 62 L16 12 L60 36 Z" fill="#f2a95c"/>
    <path d="M154 62 L164 12 L120 36 Z" fill="#f2a95c"/>
    <path d="M33 52 L27 26 L50 39 Z" fill="#ffc9a3"/>
    <path d="M147 52 L153 26 L130 39 Z" fill="#ffc9a3"/>
    <ellipse cx="90" cy="80" rx="70" ry="54" fill="#ffb867"/>
    <ellipse cx="90" cy="96" rx="44" ry="32" fill="#ffe3b8"/>
    <ellipse cx="64" cy="72" rx="15" ry="17" fill="#fff"/>
    <ellipse cx="116" cy="72" rx="15" ry="17" fill="#fff"/>
    <ellipse cx="66" cy="74" rx="7" ry="10" fill="#33323c"/>
    <ellipse cx="114" cy="74" rx="7" ry="10" fill="#33323c"/>
    <circle cx="68" cy="69" r="3" fill="#fff"/>
    <circle cx="116" cy="69" r="3" fill="#fff"/>
    <path d="M84 98 L96 98 L90 105 Z" fill="#e8788f"/>
    <path d="M90 105 q-10 12 -20 2" stroke="#8a5b33" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M90 105 q10 12 20 2" stroke="#8a5b33" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g stroke="#c98d4f" stroke-width="2.4" stroke-linecap="round">
      <path d="M28 84 L52 88"/><path d="M28 96 L52 95"/>
      <path d="M152 84 L128 88"/><path d="M152 96 L128 95"/>
    </g>
  </g>`);

const catB = costume('cat-b', 180, 140, `
  <g>
    <path d="M26 62 L16 12 L60 36 Z" fill="#f2a95c"/>
    <path d="M154 62 L164 12 L120 36 Z" fill="#f2a95c"/>
    <ellipse cx="90" cy="80" rx="70" ry="54" fill="#ffb867"/>
    <ellipse cx="90" cy="96" rx="44" ry="32" fill="#ffe3b8"/>
    <path d="M52 70 q12 12 24 0" stroke="#33323c" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M104 70 q12 12 24 0" stroke="#33323c" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M84 96 L96 96 L90 103 Z" fill="#e8788f"/>
    <path d="M82 110 q8 8 16 0" stroke="#8a5b33" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>`);

/* --------------------------------------------------------------- animals */
const dog = costume('dog-a', 170, 150, `
  <g>
    <ellipse cx="85" cy="95" rx="58" ry="50" fill="#c98f5c"/>
    <path d="M28 52 q-16 34 6 54 q18 -12 12 -46 Z" fill="#a9713f"/>
    <path d="M142 52 q16 34 -6 54 q-18 -12 -12 -46 Z" fill="#a9713f"/>
    <ellipse cx="85" cy="110" rx="34" ry="26" fill="#f2dfc4"/>
    <circle cx="66" cy="82" r="9" fill="#33261d"/><circle cx="104" cy="82" r="9" fill="#33261d"/>
    <circle cx="69" cy="79" r="3" fill="#fff"/><circle cx="107" cy="79" r="3" fill="#fff"/>
    <ellipse cx="85" cy="104" rx="14" ry="10" fill="#3b2b20"/>
    <path d="M85 114 q-10 12 -20 2" stroke="#3b2b20" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M85 114 q10 12 20 2" stroke="#3b2b20" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M70 124 q15 12 30 0" stroke="#d05b5b" stroke-width="6" fill="none" stroke-linecap="round"/>
  </g>`);

const fish = costume('fish-a', 160, 100, `
  <g>
    <path d="M126 50 L158 20 L156 80 Z" fill="#ff8a3d"/>
    <ellipse cx="80" cy="50" rx="56" ry="34" fill="#ffa04d"/>
    <path d="M70 20 q18 -20 30 4" fill="#ff8a3d"/>
    <circle cx="52" cy="42" r="8" fill="#fff"/><circle cx="50" cy="42" r="4.5" fill="#2b2b33"/>
    <path d="M84 44 q14 8 0 16" stroke="#e2702a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M30 50 q10 10 20 0" stroke="#e2702a" stroke-width="3" fill="none"/>
  </g>`);

const bird = costume('bird-a', 150, 120, `
  <g>
    <ellipse cx="80" cy="66" rx="46" ry="38" fill="#4c97ff"/>
    <circle cx="112" cy="50" r="20" fill="#6faaff"/>
    <path d="M130 50 L150 56 L130 62 Z" fill="#ffbf00"/>
    <circle cx="118" cy="46" r="5" fill="#22303f"/>
    <path d="M52 62 q-24 18 -4 34 q18 6 22 -18 Z" fill="#3373cc"/>
    <path d="M40 88 q-22 6 -26 22" stroke="#3373cc" stroke-width="6" fill="none" stroke-linecap="round"/>
  </g>`);

const butterfly = costume('butterfly-a', 170, 140, `
  <g>
    <path d="M84 70 q-52 -58 -66 -10 q-10 34 46 34 Z" fill="#9966ff"/>
    <path d="M86 70 q52 -58 66 -10 q10 34 -46 34 Z" fill="#9966ff"/>
    <path d="M84 92 q-46 46 -22 52 q28 4 30 -38 Z" fill="#b98cff"/>
    <path d="M86 92 q46 46 22 52 q-28 4 -30 -38 Z" fill="#b98cff"/>
    <ellipse cx="85" cy="80" rx="7" ry="34" fill="#3d2a63"/>
    <path d="M80 46 q-10 -18 -18 -22" stroke="#3d2a63" stroke-width="3" fill="none"/>
    <path d="M90 46 q10 -18 18 -22" stroke="#3d2a63" stroke-width="3" fill="none"/>
  </g>`);

/* --------------------------------------------------------------- fantasy */
const ghost = costume('ghost-a', 140, 160, `
  <g>
    <path d="M20 150 V70 a50 50 0 0 1 100 0 V150 l-16 -14 -16 14 -16 -14 -16 14 -16 -14 Z" fill="#eef3fb" stroke="#cfd9e6" stroke-width="3"/>
    <ellipse cx="52" cy="72" rx="9" ry="13" fill="#3f4a5a"/>
    <ellipse cx="88" cy="72" rx="9" ry="13" fill="#3f4a5a"/>
    <path d="M56 104 q14 12 28 0" stroke="#3f4a5a" stroke-width="4" fill="none" stroke-linecap="round"/>
  </g>`);

const robot = costume('robot-a', 150, 170, `
  <g>
    <rect x="36" y="20" width="78" height="62" rx="16" fill="#9aa7bb"/>
    <rect x="46" y="32" width="58" height="38" rx="12" fill="#22303f"/>
    <circle cx="64" cy="51" r="8" fill="#4ce0ff"/><circle cx="86" cy="51" r="8" fill="#4ce0ff"/>
    <rect x="30" y="88" width="90" height="64" rx="14" fill="#c3ccdb"/>
    <rect x="50" y="104" width="50" height="30" rx="6" fill="#22303f"/>
    <circle cx="62" cy="119" r="5" fill="#ff661a"/><circle cx="86" cy="119" r="5" fill="#40bf4a"/>
    <path d="M75 20 V8" stroke="#7c8ba1" stroke-width="5"/><circle cx="75" cy="6" r="6" fill="#ff661a"/>
    <rect x="16" y="94" width="14" height="44" rx="7" fill="#8f9db2"/>
    <rect x="120" y="94" width="14" height="44" rx="7" fill="#8f9db2"/>
  </g>`);

const wizard = costume('wizard-a', 150, 190, `
  <g>
    <path d="M40 186 q-10 -80 35 -104 q45 24 35 104 Z" fill="#4c6bcc"/>
    <circle cx="75" cy="86" r="30" fill="#ffd9b3"/>
    <path d="M75 26 L126 74 L24 74 Z" fill="#33427a"/>
    <path d="M24 74 h102 l-6 12 H30 Z" fill="#22305c"/>
    <circle cx="64" cy="84" r="4.5" fill="#2b3446"/><circle cx="86" cy="84" r="4.5" fill="#2b3446"/>
    <path d="M64 98 q11 9 22 0" stroke="#b06a5b" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M52 62 q23 -12 46 0 q-23 -22 -46 0" fill="#e9eefb"/>
    <rect x="112" y="52" width="7" height="96" rx="3.5" fill="#8a6a3a" transform="rotate(9 115 100)"/>
    <circle cx="128" cy="48" r="9" fill="#ffe066"/>
  </g>`);

const star = costume('star-a', 140, 140, `
  <g>
    <path d="M70 8 L88 54 L138 56 L98 86 L112 134 L70 106 L28 134 L42 86 L2 56 L52 54 Z" fill="#ffd23f" stroke="#e6b400" stroke-width="4"/>
  </g>`);

const heart = costume('heart-a', 140, 130, `
  <path d="M70 122 C20 88 8 56 22 36 C34 18 60 20 70 40 C80 20 106 18 118 36 C132 56 120 88 70 122 Z" fill="#ff5a7a" stroke="#d63d5c" stroke-width="4"/>
`);

/* ----------------------------------------------------------------- items */
const ball = costume('ball-a', 120, 120, `
  <g>
    <circle cx="60" cy="60" r="54" fill="#ff661a"/>
    <path d="M6 60 a54 54 0 0 1 108 0" fill="#ff8a3d"/>
    <circle cx="44" cy="38" r="14" fill="#ffd6bd" opacity=".7"/>
    <path d="M60 6 a54 54 0 0 1 0 108" fill="none" stroke="#e04d0a" stroke-width="4"/>
  </g>`);

const rocket = costume('rocket-a', 120, 200, `
  <g>
    <path d="M60 6 q34 36 34 96 v56 H26 V102 Q26 42 60 6 Z" fill="#eef3fb" stroke="#c3ccdb" stroke-width="3"/>
    <path d="M60 6 q18 20 26 52 H34 Q42 26 60 6 Z" fill="#ff661a"/>
    <circle cx="60" cy="88" r="18" fill="#9fd8ff" stroke="#4c97ff" stroke-width="4"/>
    <path d="M26 118 L4 176 L26 160 Z" fill="#4c97ff"/>
    <path d="M94 118 L116 176 L94 160 Z" fill="#4c97ff"/>
    <path d="M44 158 h32 l-16 36 Z" fill="#ffbf00"/>
    <path d="M52 158 h16 l-8 22 Z" fill="#ff661a"/>
  </g>`);

const car = costume('car-a', 200, 120, `
  <g>
    <path d="M14 82 q0 -22 22 -22 h14 q10 -26 40 -26 h30 q24 0 34 26 h20 q14 0 14 22 v10 H14 Z" fill="#4c97ff"/>
    <rect x="64" y="46" width="32" height="22" rx="6" fill="#cfe6ff"/>
    <rect x="104" y="46" width="32" height="22" rx="6" fill="#cfe6ff"/>
    <circle cx="52" cy="92" r="16" fill="#2b3446"/><circle cx="52" cy="92" r="7" fill="#c3ccdb"/>
    <circle cx="150" cy="92" r="16" fill="#2b3446"/><circle cx="150" cy="92" r="7" fill="#c3ccdb"/>
    <rect x="176" y="66" width="14" height="10" rx="4" fill="#ffbf00"/>
  </g>`);

const tree = costume('tree-a', 160, 200, `
  <g>
    <rect x="66" y="120" width="28" height="74" rx="8" fill="#8a5b33"/>
    <circle cx="80" cy="80" r="52" fill="#40bf4a"/>
    <circle cx="44" cy="106" r="34" fill="#37a844"/>
    <circle cx="116" cy="106" r="34" fill="#4ecb58"/>
    <circle cx="58" cy="58" r="26" fill="#57d061" opacity=".8"/>
  </g>`);

const apple = costume('apple-a', 130, 140, `
  <g>
    <path d="M65 34 C34 18 8 48 12 84 C16 120 42 136 65 128 C88 136 114 120 118 84 C122 48 96 18 65 34 Z" fill="#ec5959"/>
    <path d="M64 34 q-4 -18 6 -24" stroke="#8a5b33" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M70 18 q22 -14 34 4 q-20 12 -34 -4 Z" fill="#40bf4a"/>
    <ellipse cx="42" cy="66" rx="12" ry="18" fill="#ff8a8a" opacity=".55" transform="rotate(-20 42 66)"/>
  </g>`);

const cloud = costume('cloud-a', 200, 120, `
  <g fill="#ffffff" stroke="#dbe6f2" stroke-width="3">
    <circle cx="60" cy="66" r="34"/><circle cx="100" cy="52" r="42"/><circle cx="142" cy="68" r="30"/>
    <rect x="52" y="66" width="96" height="34" rx="17"/>
  </g>`);

const paddle = costume('paddle-a', 120, 30, `
  <rect x="3" y="3" width="114" height="24" rx="12" fill="#4c97ff" stroke="#3373cc" stroke-width="3"/>
`);

const arrow = costume('arrow-a', 120, 80, `
  <g>
    <path d="M6 30 h66 V8 l42 32 -42 32 V50 H6 Z" fill="#ffbf00" stroke="#e0a300" stroke-width="3"/>
  </g>`);

/* -------------------------------------------------------------- backdrops */
const backdrop = (name, inner, w = 480, h = 360) => ({
  name,
  ext: 'svg',
  width: w,
  height: h,
  dataUrl: svgUrl(w, h, inner),
  rotationCenterX: w / 2,
  rotationCenterY: h / 2,
  bitmapResolution: 1,
});

const BACKDROPS = [
  backdrop('blue-sky', `
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#69b7ff"/><stop offset="1" stop-color="#cfeaff"/></linearGradient></defs>
    <rect width="480" height="360" fill="url(#sky)"/>
    <circle cx="400" cy="70" r="40" fill="#fff3b0"/>
    <g fill="#ffffff" opacity=".92">
      <ellipse cx="120" cy="90" rx="60" ry="30"/><ellipse cx="170" cy="80" rx="46" ry="34"/>
      <ellipse cx="300" cy="150" rx="52" ry="24"/><ellipse cx="340" cy="144" rx="38" ry="28"/>
    </g>
    <path d="M0 300 q120 -60 240 -10 q120 50 240 0 v70 H0 Z" fill="#66c76a"/>`),
  backdrop('desert', `
    <defs><linearGradient id="dune" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd79a"/><stop offset="1" stop-color="#ffbe66"/></linearGradient>
      <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#ffe9b8"/></linearGradient>
    </defs>
    <rect width="480" height="360" fill="url(#sky2)"/>
    <circle cx="380" cy="80" r="34" fill="#fff1a8"/>
    <path d="M0 230 q120 -60 250 10 q130 60 230 -20 v140 H0 Z" fill="#f4b355"/>
    <path d="M0 290 q140 -40 260 10 q120 50 220 0 v60 H0 Z" fill="url(#dune)"/>
    <g fill="#3f7d4a"><path d="M70 250 q6 -30 12 0 q10 -22 12 6 z"/><path d="M110 262 q5 -24 10 0 q8 -18 10 5 z"/></g>`),
  backdrop('night', `
    <rect width="480" height="360" fill="#16223c"/>
    <circle cx="380" cy="70" r="34" fill="#f5f3d8"/>
    <circle cx="368" cy="62" r="30" fill="#16223c"/>
    <g fill="#ffffff">
      <circle cx="60" cy="50" r="2"/><circle cx="120" cy="90" r="1.6"/><circle cx="200" cy="40" r="2.2"/>
      <circle cx="260" cy="110" r="1.5"/><circle cx="330" cy="150" r="1.8"/><circle cx="90" cy="160" r="1.4"/>
      <circle cx="430" cy="180" r="2"/><circle cx="160" cy="200" r="1.3"/>
    </g>
    <path d="M0 300 q140 -50 260 0 q120 50 220 -10 v70 H0 Z" fill="#20304f"/>`),
  backdrop('space', `
    <rect width="480" height="360" fill="#0b1020"/>
    <g fill="#ffffff">
      ${Array.from({ length: 60 }, (_, i) => {
        const x = (i * 97) % 480; const y = (i * 53) % 360; const r = (i % 3) * 0.7 + 0.7;
        return `<circle cx="${x}" cy="${y}" r="${r}"/>`;
      }).join('')}
    </g>
    <circle cx="120" cy="250" r="60" fill="#4c6bcc"/><ellipse cx="120" cy="250" rx="96" ry="18" fill="none" stroke="#ffbf00" stroke-width="6" transform="rotate(-18 120 250)"/>
    <circle cx="360" cy="90" r="34" fill="#c9d4ea"/>`),
  backdrop('grid', `
    <rect width="480" height="360" fill="#f7fbff"/>
    <g stroke="#cfe3f7" stroke-width="1">
      ${Array.from({ length: 25 }, (_, i) => `<path d="M${i * 20} 0 V360"/>`).join('')}
      ${Array.from({ length: 19 }, (_, i) => `<path d="M0 ${i * 20} H480"/>`).join('')}
    </g>`),
  backdrop('underwater', `
    <defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2aa8d8"/><stop offset="1" stop-color="#0b4f78"/></linearGradient></defs>
    <rect width="480" height="360" fill="url(#sea)"/>
    <g fill="#1c7fa8" opacity=".55">
      <circle cx="80" cy="300" r="26"/><circle cx="120" cy="330" r="20"/><circle cx="400" cy="310" r="30"/>
    </g>
    <path d="M0 340 q120 -30 240 0 q120 30 240 0 v20 H0 Z" fill="#f3e0a8"/>`),
  backdrop('forest', `
    <rect width="480" height="360" fill="#cdebd2"/>
    <path d="M0 250 q160 -40 300 10 q90 32 180 0 v100 H0 Z" fill="#5aa86b"/>
    <g fill="#2f7a45">
      <path d="M70 250 L100 150 L130 250 Z"/><path d="M150 260 L182 130 L214 260 Z"/><path d="M330 262 L362 150 L394 262 Z"/>
    </g>
    <g fill="#7a5a3a"><rect x="92" y="250" width="16" height="40"/><rect x="174" y="260" width="14" height="30"/><rect x="354" y="262" width="16" height="30"/></g>`),
  backdrop('city', `
    <rect width="480" height="360" fill="#dfe9f6"/>
    <g fill="#8fa6c4">
      <rect x="20" y="180" width="70" height="180"/><rect x="110" y="130" width="60" height="230"/>
      <rect x="190" y="200" width="80" height="160"/><rect x="290" y="150" width="66" height="210"/>
      <rect x="370" y="190" width="90" height="170"/>
    </g>
    <g fill="#ffe9a8">
      ${Array.from({ length: 40 }, (_, i) => {
        const x = 30 + (i * 37) % 410; const y = 200 + ((i * 29) % 140);
        return `<rect x="${x}" y="${y}" width="9" height="12"/>`;
      }).join('')}
    </g>`),
  backdrop('room', `
    <rect width="480" height="360" fill="#f3e9d8"/>
    <rect width="480" height="250" fill="#f7efdf"/>
    <rect y="250" width="480" height="110" fill="#c99a63"/>
    <rect x="40" y="70" width="120" height="90" rx="6" fill="#a8d8ef" stroke="#8a6a3a" stroke-width="8"/>
    <rect x="320" y="120" width="110" height="80" rx="8" fill="#b98cff"/>
    <ellipse cx="240" cy="330" rx="140" ry="30" fill="#e0b781"/>`),
  backdrop('spotlight', `
    <rect width="480" height="360" fill="#111318"/>
    <radialGradient id="sp" cx="50%" cy="42%" r="52%">
      <stop offset="0" stop-color="#4a5568"/><stop offset="1" stop-color="#0d0f13"/></radialGradient>
    <rect width="480" height="360" fill="url(#sp)"/>
    <ellipse cx="240" cy="330" rx="150" ry="34" fill="#ffdca8" opacity=".18"/>`),
  backdrop('purple', `
    <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9966ff"/><stop offset="1" stop-color="#3b1f6e"/></linearGradient></defs>
    <rect width="480" height="360" fill="url(#pg)"/>
    <g fill="#ffffff" opacity=".2">
      <circle cx="90" cy="260" r="60"/><circle cx="380" cy="90" r="48"/>
    </g>`),
  backdrop('beach', `
    <rect width="480" height="360" fill="#bfe9ff"/>
    <rect y="200" width="480" height="80" fill="#2fa8d8"/>
    <path d="M0 280 q240 -26 480 0 v80 H0 Z" fill="#f4e2b8"/>
    <circle cx="70" cy="60" r="32" fill="#fff3b0"/>
    <path d="M0 210 q60 -16 120 0 q60 16 120 0 q60 -16 120 0 q60 16 120 0 v12 H0 Z" fill="#ffffff" opacity=".6"/>`),
];

/* ---------------------------------------------------------------- exports */
export const SPRITE_LIBRARY = [
  { id: 'cat', name: 'Cat', category: 'animals', costumes: [catA, catB] },
  { id: 'dog', name: 'Dog', category: 'animals', costumes: [dog] },
  { id: 'fish', name: 'Fish', category: 'animals', costumes: [fish] },
  { id: 'bird', name: 'Bird', category: 'animals', costumes: [bird] },
  { id: 'butterfly', name: 'Butterfly', category: 'animals', costumes: [butterfly] },
  { id: 'ghost', name: 'Ghost', category: 'fantasy', costumes: [ghost] },
  { id: 'robot', name: 'Robot', category: 'fantasy', costumes: [robot] },
  { id: 'wizard', name: 'Wizard', category: 'fantasy', costumes: [wizard] },
  { id: 'star', name: 'Star', category: 'fantasy', costumes: [star] },
  { id: 'heart', name: 'Heart', category: 'items', costumes: [heart] },
  { id: 'ball', name: 'Ball', category: 'items', costumes: [ball] },
  { id: 'rocket', name: 'Rocket', category: 'items', costumes: [rocket] },
  { id: 'car', name: 'Car', category: 'items', costumes: [car] },
  { id: 'tree', name: 'Tree', category: 'items', costumes: [tree] },
  { id: 'apple', name: 'Apple', category: 'items', costumes: [apple] },
  { id: 'cloud', name: 'Cloud', category: 'items', costumes: [cloud] },
  { id: 'paddle', name: 'Paddle', category: 'items', costumes: [paddle] },
  { id: 'arrow', name: 'Arrow', category: 'items', costumes: [arrow] },
];

export const BACKDROP_LIBRARY = BACKDROPS.map((b) => ({ ...b, category: 'backdrops' }));

export const LIBRARY_CATEGORIES = {
  sprites: [
    { id: 'animals', label: 'حيوانات' },
    { id: 'fantasy', label: 'خيال' },
    { id: 'items', label: 'أشياء' },
  ],
  backdrops: [{ id: 'backdrops', label: 'خلفيات' }],
};

export function findSprite(id) { return SPRITE_LIBRARY.find((s) => s.id === id) || SPRITE_LIBRARY[0]; }
export { catA as defaultCatCostume, catB as defaultCatCostume2 };
export const DEFAULT_STAGE_BACKDROP = BACKDROPS[0];
