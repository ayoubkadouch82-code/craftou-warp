/**
 * CRAFT WARP — collaboration client.
 *
 * Host creates a room (6 character code), guests type the code and land inside
 * the same project. Every edit is broadcast as a small op; cursors and chat ride
 * on the same socket. The server is a dumb fast relay (see src/collab.rs).
 */

export class CollabClient {
  constructor({ onStatus, onEvent, onPresence, onChat, toast }) {
    this.ws = null;
    this.role = null;
    this.code = null;
    this.name = 'Guest';
    this.id = null;
    this.color = '#4c97ff';
    this.peers = [];
    this.connected = false;
    this.reconnectAttempts = 0;
    this.closedByUser = false;
    this.pending = [];
    this.lastCursor = 0;
    this.onStatus = onStatus || (() => {});
    this.onEvent = onEvent || (() => {});
    this.onPresence = onPresence || (() => {});
    this.onChat = onChat || (() => {});
    this.toast = toast || (() => {});
    this.pinger = null;
  }

  get isHost() { return this.role === 'host'; }

  async createRoom() {
    const res = await fetch('/api/rooms', { method: 'POST' });
    if (!res.ok) throw new Error('room create failed');
    const data = await res.json();
    return data.code;
  }

  async host(project, name) {
    this.closedByUser = false;
    this.role = 'host';
    this.name = name || 'Host';
    const code = await this.createRoom();
    await this.connect(code, 'host', name);
    this.sendState(project);
    return code;
  }

  async join(code, name) {
    this.closedByUser = false;
    this.role = 'guest';
    this.name = name || 'Guest';
    await this.connect(code.toUpperCase(), 'guest', name);
    return true;
  }

  connect(code, role, name) {
    return new Promise((resolve, reject) => {
      this.code = code;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(code)}&role=${role}&name=${encodeURIComponent(name || 'Guest')}`;
      let settled = false;
      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; try { this.ws.close(); } catch { /* noop */ } reject(new Error('timeout')); }
      }, 8000);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.onStatus('connected');
        this.startPing();
      };
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!settled && msg.t === 'welcome') {
          settled = true;
          clearTimeout(timeout);
          this.id = msg.id;
          this.color = msg.color;
          this.peers = msg.peers || [];
          this.onPresence(this.peerList(), msg);
          resolve(msg);
        }
        this.handleMessage(msg);
      };
      this.ws.onerror = () => {
        if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('connection failed')); }
      };
      this.ws.onclose = (ev) => {
        this.connected = false;
        this.stopPing();
        this.onStatus('disconnected');
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`closed ${ev.code}`));
          return;
        }
        if (!this.closedByUser && this.reconnectAttempts < 6) {
          this.reconnectAttempts++;
          const delay = Math.min(8000, 600 * this.reconnectAttempts);
          this.toast('انقطع الاتصال… إعادة المحاولة', 'info');
          setTimeout(() => {
            if (!this.closedByUser) {
              this.connect(this.code, this.role, this.name).then(() => {
                this.onStatus('reconnected');
                this.send({ t: 'request-state' });
              }).catch(() => {});
            }
          }, delay);
        }
      };
    });
  }

  startPing() {
    this.stopPing();
    this.pinger = setInterval(() => this.send({ t: 'ping' }), 25000);
  }

  stopPing() {
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
  }

  handleMessage(msg) {
    switch (msg.t) {
      case 'welcome': {
        this.id = msg.id;
        this.color = msg.color;
        this.peers = msg.peers || [];
        if (msg.snapshot && msg.snapshot.project) {
          this.onEvent('snapshot', msg.snapshot.project);
        } else if (msg.role === 'guest') {
          this.send({ t: 'request-state' });
        }
        this.onPresence(this.peerList(), msg);
        break;
      }
      case 'join': {
        if (msg.id !== this.id) {
          this.peers = [...this.peers.filter((p) => p.id !== msg.id), { id: msg.id, name: msg.name, color: msg.color, role: msg.role }];
          this.onPresence(this.peerList(), msg);
          this.onEvent('peer-join', msg);
        }
        break;
      }
      case 'leave': {
        this.peers = this.peers.filter((p) => p.id !== msg.id);
        this.onPresence(this.peerList(), msg);
        this.onEvent('peer-leave', msg);
        break;
      }
      case 'host-left': {
        this.onEvent('host-left', msg);
        break;
      }
      case 'error': {
        this.toast(msg.message || 'collab error', 'err');
        this.onEvent('error', msg);
        this.closedByUser = true;
        this.close();
        break;
      }
      case 'state': {
        if (msg.from !== this.id) this.onEvent('state', msg.project || msg.data);
        break;
      }
      case 'target': {
        if (msg.from !== this.id) this.onEvent('target', msg);
        break;
      }
      case 'target-remove': {
        if (msg.from !== this.id) this.onEvent('target-remove', msg);
        break;
      }
      case 'targets-order': {
        if (msg.from !== this.id) this.onEvent('targets-order', msg);
        break;
      }
      case 'assets': {
        if (msg.from !== this.id) this.onEvent('assets', msg);
        break;
      }
      case 'meta': {
        if (msg.from !== this.id) this.onEvent('meta', msg);
        break;
      }
      case 'cursor': {
        if (msg.from !== this.id) this.onEvent('cursor', msg);
        break;
      }
      case 'chat': {
        if (msg.from !== this.id) {
          this.onChat({ from: msg.from, name: msg.name, color: msg.color, text: msg.text, image: msg.image, at: msg.at });
          this.onEvent('chat', msg);
        }
        break;
      }
      case 'activity': {
        if (msg.from !== this.id) this.onEvent('activity', msg);
        break;
      }
      case 'request-state': {
        if (this.isHost) this.onEvent('request-state', msg);
        break;
      }
      default:
        break;
    }
  }

  peerList() {
    return this.peers.map((p) => ({ ...p }));
  }

  send(obj) {
    if (!this.ws) return false;
    if (this.ws.readyState !== WebSocket.OPEN) {
      if (obj.t !== 'cursor') this.pending.push(obj);
      return false;
    }
    try {
      this.ws.send(JSON.stringify(obj));
      if (this.pending.length) {
        const queued = this.pending.splice(0);
        for (const item of queued) this.ws.send(JSON.stringify(item));
      }
      return true;
    } catch {
      return false;
    }
  }

  /* -------------------------------------------------------------- ops */
  sendState(project) {
    this.send({ t: 'state', project: this.stripped(project) });
  }

  stripped(project) {
    return {
      name: project.name,
      meta: project.meta,
      targets: project.targets,
      monitors: project.monitors,
      extensions: project.extensions,
      assets: project.assets,
    };
  }

  sendTarget(target) {
    this.send({ t: 'target', target });
  }

  sendTargetRemove(id) {
    this.send({ t: 'target-remove', id });
  }

  sendOrder(ids) {
    this.send({ t: 'targets-order', ids });
  }

  sendAssets(assets) {
    this.send({ t: 'assets', assets });
  }

  sendMeta(meta) {
    this.send({ t: 'meta', meta });
  }

  sendChat(text, image = null) {
    this.send({ t: 'chat', text: String(text || '').slice(0, 2000), image });
  }

  sendCursor(sx, sy, spriteId) {
    const now = performance.now();
    if (now - this.lastCursor < 70) return;
    this.lastCursor = now;
    this.send({ t: 'cursor', cursor: { sx: Math.round(sx), sy: Math.round(sy), sprite: spriteId } });
  }

  sendActivity(text) {
    this.send({ t: 'activity', text });
  }

  requestState() {
    this.send({ t: 'request-state' });
  }

  close() {
    this.closedByUser = true;
    this.stopPing();
    this.connected = false;
    this.role = null;
    this.peers = [];
    if (this.ws) {
      try { this.ws.close(); } catch { /* noop */ }
      this.ws = null;
    }
    this.onStatus('closed');
    this.onPresence([], {});
  }
}
