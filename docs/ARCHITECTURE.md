# CRAFT WARP — Architecture

CRAFT WARP is intentionally boring to deploy and fast to run:

```
┌─────────────────────────────────────────────────────────────┐
│  craftwarp.exe  (Rust, single file)                         │
│  ├─ static assets embedded at compile time (include_dir)    │
│  ├─ HTTP API   /api/health  /api/config                     │
│  │             /api/rooms   /api/projects                   │
│  └─ WebSocket  /ws  → collaboration relay                   │
└─────────────────────────────────────────────────────────────┘
                           │ http + ws
┌─────────────────────────────────────────────────────────────┐
│  Browser (no build step, no framework, no CDN)              │
│  editor.js ── workspace.js ── blockview.js ── blocks.js     │
│      │             │                                        │
│      ├── vm.js (interpreter) ── renderer.js (canvas)        │
│      ├── project.js ── sb3.js ── zip.js                     │
│      └── collab.js (WebSocket client) ── chat / cursors     │
└─────────────────────────────────────────────────────────────┘
```

## 1. Server (Rust)

| file | responsibility |
|---|---|
| `src/main.rs` | CLI (`--port`, `--host`, env `CW_PORT`/`CW_HOST`/`CW_DATA_DIR`), router, CORS, 96 MB body limit, banner |
| `src/api.rs` | health, runtime config, room creation, JSON project store (`craftwarp-data/projects/<slug>.json`, atomic tmp+rename) |
| `src/collab.rs` | `WebSocketUpgrade` handler: room roster, `tokio::sync::broadcast` fan-out, snapshot cache, host enforcement, join/leave/host-left notices |
| `src/assets.rs` | every file under `static/` embedded into the binary, correct MIME + cache headers, SPA fallback to `index.html` |
| `src/state.rs` | `AppState { rooms, data_dir }`, room codes (unambiguous 6-char alphabet), peer colours |

Why a relay and not an authoritative server? Block edits are tiny JSON objects; the client already owns
the document. A relay keeps the binary small, latency low (no extra round trips), and still gives late
joiners a full snapshot. See `docs/COLLAB.md`.

## 2. Document model (`static/js/project.js`)

The project is a **superset of Scratch 3**:

```jsonc
{
  "name": "…",
  "meta": { "semver": "3.0.0", "agent": "CRAFT WARP" },
  "targets": [ /* stage first, then sprites */ ],
  "monitors": [],
  "extensions": [],
  "assets": { "6f1c….svg": { "dataUrl": "data:image/svg+xml;…", "ext": "svg" } }
}
```

Key decision: **assets live once at project level and are referenced by `md5ext`**. Targets only carry
ids, so a collaboration delta for "a friend moved 3 blocks" is a few kilobytes instead of megabytes.

Targets keep Scratch fields (`variables`, `lists`, `broadcasts`, `blocks`, `costumes`, `sounds`,
`currentCostume`, `layerOrder`, `x/y/direction/size/visible/rotationStyle`) plus editor-only helpers
(`effects`, `say`, `dragMode`, `id`). Blocks are byte-compatible Scratch objects:

```jsonc
"b12": {
  "opcode": "motion_movesteps", "next": null, "parent": "b11",
  "inputs": { "STEPS": [1, [4, "10"]] },
  "fields": {}, "shadow": false, "topLevel": false
}
```

## 3. Block catalog (`static/js/blocks.js`)

119 opcodes with Scratch's own names/field ids, described with a tiny DSL so the palette, the painter,
the interpreter and the `.sb3` translator all read the same source:

```js
add('motion_movesteps', 'motion', 'stack', ['move', N('STEPS'), 'steps']);
add('control_repeat',  'control', 'c',     ['repeat', N('TIMES','10'), SUB]);
add('sensing_of', 'sensing', 'reporter',
   [F('PROPERTY', [...], 'x position'), 'of', M('OBJECT', 'objects', '_stage_')]);
```

`N` numeric oval, `S` text oval, `B` boolean slot, `SUB`/`SUB2` C-block substacks, `F` dropdown field,
`V`/`L` variable/list selectors, `M` menu (stored as a field while editing, exported as a Scratch
shadow menu block).

## 4. Painter (`static/js/blockview.js`)

Blocks are drawn as SVG strings with Scratch geometry: 40 px rows, notches, C arms, hexagon booleans,
hat curves. A recursive layout pass measures text with a canvas context, places inputs/reporters, and
emits nested stacks. Because it is string based:

- rendering 500 blocks is a single `innerHTML` assignment;
- the same painter feeds the palette, the workspace, and the drag ghost;
- invisible `<rect class="cw-substack">` markers expose the exact pixel geometry of empty C slots to
  the hit-tester.

## 5. Workspace (`static/js/workspace.js`)

State: `view {x, y, scale}` → `transform="translate() scale()"` on one `<g>`.

Interaction model:

1. `pointerdown` on a block **detaches it from its parent immediately** (exactly like Scratch) so the
   remaining stack re-renders without it.
2. A floating copy is painted into `#layer-floating`; the pointer only moves a transform.
3. Snap candidates are computed from **DOM rects** (`getBoundingClientRect`) — next connections,
   empty substack markers, and reporter/boolean slots — converted to workspace coordinates. Nearest
   candidate within 52 px wins and is previewed with a hint rect.
4. `pointerup` either connects (`next`, `SUBSTACK`, slot) or drops the stack at the pointer position.
   Dropping over the palette deletes (with the trash overlay).

Inline editing: clicks on `.cw-field` open a popup menu (variables, lists, sprites, costumes, sounds,
broadcasts, messages…), clicks on `.cw-input` open a floating `<input>` over the oval. Both write
straight into the block object and notify the editor.

## 6. VM (`static/js/vm.js`)

- One generator per thread: `execStack` walks `next` chains, `execBlock` awaits via `yield`.
- `pump()` interprets yields: `'frame'` (skip in warp mode), `{type:'secs'}`, `{type:'until'}`,
  `{type:'promise'}` (sounds), `{type:'ask'}`, `{type:'threads'}` (broadcast-and-wait).
- Hats restart their script; clones get their own variables; `procedures_call` pushes a parameter
  frame, supports recursion and warp mode.
- Run at display refresh rate with a clamped delta; `renderer.js` reads target state and draws.

Sensing geometry comes from the renderer (`getBounds`, `touching`), so the VM stays DOM-free and is
unit-testable in Node.

## 7. Renderer (`static/js/renderer.js`)

480×360 stage in Scratch coordinates (y up), device-pixel-ratio aware. Draws backdrop (cover fit),
sprites with rotation styles and effects (`ghost`, `brightness`, `color` via canvas filters), speech
and thought bubbles with wrapping and tails, and visible variable monitors. Mouse picking returns the
topmost sprite for `when this sprite clicked` and dragging.

## 8. `.sb3` transport (`static/js/sb3.js`, `static/js/zip.js`)

- ZIP read: central directory walk + `DecompressionStream('deflate-raw')`.
- ZIP write: local headers + central directory, stored by default, optional deflate via
  `CompressionStream`.
- MD5 is implemented in ~60 lines and verified against `node:crypto` in the tests, so exported asset
  names are genuine `md5.ext` and Scratch/TurboWarp accept them.
- Translation details (menus ↔ shadow blocks, broadcast inline values, variable/list shadow types) are
  documented in `docs/SB3-COMPATIBILITY.md`.

## 9. Collaboration (`static/js/collab.js` + `src/collab.rs`)

Ops: `target`, `target-remove`, `targets-order`, `assets`, `meta`, `cursor`, `chat`, `activity`,
`state` (full snapshot), `request-state`. Local edits are debounced 140 ms and sent as whole target
objects; the receiver merges by id. Cursors are throttled to ~70 ms. Images are downscaled to 720 px
JPEG in the browser before sending. Details: `docs/COLLAB.md`.

## 10. Persistence

- **Local**: `localStorage['craftwarp.project.v1']`, debounced autosave (900 ms) + 6 s safety timer.
- **Server**: `POST /api/projects` writes `craftwarp-data/projects/<slug>.json`.
- **Files**: `.sb3` export, JSON export, import of `.sb3`/`.json`.

## 11. Performance notes

- No framework, no bundler: the editor is ~380 KB of static files, parsed once.
- Palette/workspace rendering is string concatenation; pointer moves only mutate transforms.
- The VM runs at most one frame-budget per thread; warp blocks are capped at 20 000 iterations/frame.
- Collaboration payloads are target-scoped, so editing never re-sends the whole project (only the host
  does that on join).

## 12. Extending

- **New block**: add one line in `blocks.js`, implement its behaviour in `vm.js` (`execBlock` for
  stacks, `evaluate` for reporters). Palette, painter, `.sb3` export and palette search pick it up.
- **New library item**: append an SVG factory in `library.js`.
- **New op**: add a `case` in `collab.js` (both client), then relay it in `src/collab.rs` if it needs
  server-side caching.
