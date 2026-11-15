#!/usr/bin/env node
/**
 * CRAFT WARP — zero-dependency development/preview server.
 *
 * This mirrors the Rust server (src/main.rs, src/api.rs, src/collab.rs) so the
 * editor can be previewed without a Rust toolchain:
 *   • static editor from ./static
 *   • /api/health /api/config /api/rooms /api/projects
 *   • /ws collaboration relay (hand-rolled RFC6455 framing)
 *
 * Production ships the Rust binary; this file is dev-only.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'static');
const DATA = process.env.CW_DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.CW_PORT || process.env.PORT || 8080);
const HOST = process.env.CW_HOST || '0.0.0.0';
const VERSION = '0.1.0';
const REPO = 'https://github.com/ayoubkadouch82-code/craftou-warp';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const rooms = new Map();
const COLORS = ['#ff661a', '#4c97ff', '#9966ff', '#cf63cf', '#40bf4a', '#0fbd8c', '#ffab19', '#ec5959', '#855cd6', '#29beb6'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const code6 = () => Array.from(crypto.randomBytes(6), b => ALPHABET[b % ALPHABET.length]).join('');
const nowMs = () => Date.now();
const slug = (name) => {
  const cleaned = String(name || '').trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, '').replace(/\s+/g, '-').slice(0, 48);
  return cleaned.replace(/^-+|-+$/g, '').replace(/[A-Z]/g, (c) => c.toLowerCase()) || `project-${Math.floor(Date.now() / 1000)}`;
};

function json(res, code, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(STATIC, rel);
  if (!file.startsWith(STATIC)) return json(res, 403, { error: 'forbidden' });
  try {
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) return serveStatic(req, res, `${rel}/index.html`);
    const ext = path.extname(file).toLowerCase();
    const body = await fsp.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': ext === '.html' ? 'no-store' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  } catch {
    try {
      const body = await fsp.readFile(path.join(STATIC, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      json(res, 404, { error: 'not found' });
    }
  }
}

/* ------------------------------------------------------------------ rooms */

function roomState(code) {
  const room = rooms.get(code);
  if (!room) return null;
  return {
    exists: true,
    code,
    revision: room.revision,
    hasSnapshot: !!room.snapshot,
    peers: [...room.peers.values()].map(p => ({ id: p.id, name: p.name, color: p.color, role: p.role })),
  };
}

/* ------------------------------------------------------- websocket relay */

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}

function encodeFrame(payload, opcode = 1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, data]);
}

function attachWs(req, socket, head) {
  const url = new URL(req.url, 'http://local');
  const roomCodeRaw = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
  const name = (url.searchParams.get('name') || 'Guest').slice(0, 28);

  const send = (obj) => {
    if (socket.destroyed) return;
    try {
      socket.write(encodeFrame(JSON.stringify(obj)));
    } catch { /* closed */ }
  };
  const close = (code = 1000, reason = '') => {
    if (socket.destroyed) return;
    try {
      const body = Buffer.alloc(2 + Buffer.byteLength(reason));
      body.writeUInt16BE(code, 0);
      body.write(reason, 2);
      socket.write(encodeFrame(body, 8));
    } catch { /* ignore */ }
    socket.end();
  };

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${wsAccept(req.headers['sec-websocket-key'] || '')}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const room = rooms.get(roomCodeRaw);
  if (roomCodeRaw.length < 4 || !room) {
    send({ t: 'error', code: roomCodeRaw.length < 4 ? 'bad-room' : 'room-not-found', message: 'No live session with that code' });
    close(4004, 'room');
    return;
  }
  if (role === 'host' && [...room.peers.values()].some(p => p.role === 'host')) {
    send({ t: 'error', code: 'host-taken', message: 'This session already has a host' });
    close(4003, 'host-taken');
    return;
  }

  const id = `p${nowMs() % 100000}_${room.peers.size + 1}`;
  const color = COLORS[room.peers.size % COLORS.length];
  const peer = { id, name, color, role, socket, send };
  room.peers.set(id, peer);

  const peerList = () => [...room.peers.values()].map(p => ({ id: p.id, name: p.name, color: p.color, role: p.role }));
  send({
    t: 'welcome',
    id,
    name,
    color,
    role,
    room: roomCodeRaw,
    revision: room.revision,
    peers: peerList(),
    snapshot: room.snapshot ? JSON.parse(room.snapshot) : null,
    serverTime: nowMs(),
    runtime: 'node-preview',
  });
  room.broadcast({ t: 'join', id, name, color, role }, id);

  let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let fragOpcode = 0;
  let fragments = [];

  const handleFrame = (fin, opcode, payload) => {
    if (opcode === 8) { cleanup(); return; }
    if (opcode === 9) { socket.write(encodeFrame(payload, 10)); return; }
    if (opcode === 10) return;
    if (opcode === 0) {
      fragments.push(payload);
      if (fin) {
        const full = Buffer.concat(fragments);
        fragments = [];
        if (fragOpcode === 1) onText(full.toString('utf8'));
      }
      return;
    }
    if (!fin) {
      fragOpcode = opcode;
      fragments = [payload];
      return;
    }
    if (opcode === 1) onText(payload.toString('utf8'));
  };

  const onText = (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const t = msg.t;
    if (!t || ['welcome', 'join', 'leave'].includes(t)) return;
    msg.from = id;
    msg.name = name;
    msg.color = color;
    msg.role = role;
    msg.at = nowMs();
    if (t === 'state') {
      room.snapshot = JSON.stringify(msg);
      room.revision += 1;
      msg.revision = room.revision;
    }
    room.broadcast(msg, id);
  };

  const parse = () => {
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        len = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (len > 64 * 1024 * 1024) { cleanup(); return; }
      const maskLen = masked ? 4 : 0;
      if (buffer.length < offset + maskLen + len) return;
      let payload = Buffer.from(buffer.subarray(offset + maskLen, offset + maskLen + len));
      if (masked) {
        const mask = buffer.subarray(offset, offset + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      buffer = buffer.subarray(offset + maskLen + len);
      handleFrame(fin, opcode, payload);
    }
  };

  let closed = false;
  function cleanup() {
    if (closed) return;
    closed = true;
    room.peers.delete(id);
    room.broadcast({ t: 'leave', id, name, role }, id);
    if (role === 'host') room.broadcast({ t: 'host-left' }, id);
    if (room.peers.size === 0) rooms.delete(roomCodeRaw);
    socket.destroy();
  }

  socket.on('data', (chunk) => { buffer = Buffer.concat([buffer, chunk]); parse(); });
  socket.on('close', cleanup);
  socket.on('error', cleanup);
  parse();
}

/* ------------------------------------------------------------------ http */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }

  try {
    if (p === '/api/health') {
      return json(res, 200, { ok: true, name: 'CRAFT WARP', version: VERSION, rooms: rooms.size, runtime: 'node-preview' });
    }
    if (p === '/api/config') {
      return json(res, 200, {
        name: 'CRAFT WARP', version: VERSION, runtime: 'node-preview',
        repository: REPO, releaseUrl: `${REPO}/releases/latest`,
        maxProjectBytes: 64 * 1024 * 1024, collab: true,
      });
    }
    if (p === '/api/rooms' && req.method === 'POST') {
      let code = code6();
      while (rooms.has(code)) code = code6();
      rooms.set(code, { code, peers: new Map(), revision: 0, snapshot: null, createdAt: nowMs(), broadcast(msg, except) {
        const text = JSON.stringify(msg);
        for (const [peerId, peer] of this.peers) {
          if (peerId === except) continue;
          if (!peer.socket.destroyed) {
            try { peer.socket.write(encodeFrame(text)); } catch { /* closed */ }
          }
        }
      } });
      return json(res, 200, { code });
    }
    const roomMatch = p.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
    if (roomMatch) {
      const info = roomState(roomMatch[1].toUpperCase());
      return json(res, 200, info || { exists: false, code: roomMatch[1].toUpperCase(), peers: [] });
    }
    if (p === '/api/projects' && req.method === 'GET') {
      const dir = path.join(DATA, 'projects');
      await fsp.mkdir(dir, { recursive: true });
      const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.json'));
      const items = [];
      for (const f of files) {
        try {
          const doc = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8'));
          const stat = await fsp.stat(path.join(dir, f));
          items.push({
            id: doc.id || f.replace(/\.json$/, ''),
            name: doc.name || 'Untitled',
            updated: Math.floor(stat.mtimeMs / 1000),
            sprites: Math.max(0, (doc.project?.targets?.length || 1) - 1),
          });
        } catch { /* skip */ }
      }
      items.sort((a, b) => b.updated - a.updated);
      return json(res, 200, { projects: items });
    }
    if (p === '/api/projects' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (!body.project) return json(res, 400, { error: 'missing project' });
      const name = body.name || body.project.name || 'Untitled';
      const id = slug(name);
      const dir = path.join(DATA, 'projects');
      await fsp.mkdir(dir, { recursive: true });
      const doc = { id, name, updated: Math.floor(Date.now() / 1000), project: body.project };
      await fsp.writeFile(path.join(dir, `${id}.json`), JSON.stringify(doc));
      return json(res, 200, { ok: true, id, name });
    }
    const projMatch = p.match(/^\/api\/projects\/(.+)$/);
    if (projMatch) {
      const id = slug(decodeURIComponent(projMatch[1]));
      const file = path.join(DATA, 'projects', `${id}.json`);
      if (req.method === 'GET') {
        try {
          const doc = JSON.parse(await fsp.readFile(file, 'utf8'));
          return json(res, 200, doc);
        } catch { return json(res, 404, { error: 'project not found' }); }
      }
      if (req.method === 'PUT') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        if (!body.project) return json(res, 400, { error: 'missing project' });
        const doc = { id, name: body.name || body.project.name || id, updated: Math.floor(Date.now() / 1000), project: body.project };
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.writeFile(file, JSON.stringify(doc));
        return json(res, 200, { ok: true, id, name: doc.name });
      }
      if (req.method === 'DELETE') {
        try { await fsp.unlink(file); } catch { /* gone */ }
        return json(res, 200, { ok: true });
      }
    }
    return serveStatic(req, res, p);
  } catch (err) {
    json(res, 500, { error: String(err && err.message || err) });
  }
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  attachWs(req, socket, head);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  CRAFT WARP  dev/preview server`);
  console.log(`  → http://${HOST}:${PORT}`);
  console.log(`  → projects: ${path.join(DATA, 'projects')}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500); });
}
