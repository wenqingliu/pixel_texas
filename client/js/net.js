// WebSocket 封装：自动重连 + token 会话
// ?guest 模式：会话存 sessionStorage（每个标签页独立身份，便于同机多开测试）
export class Net {
  constructor(onMsg) {
    this.onMsg = onMsg;
    this.guest = new URLSearchParams(location.search).has('guest');
    this.store = this.guest ? sessionStorage : localStorage;
    this.token = this.store.getItem('pt_token') || null;
    this.ws = null;
    this.name = this.store.getItem('pt_name') || '';
    this.closedByUser = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onopen = () => {
      this.send({ t: 'hello', name: this.name, token: this.token });
    };
    this.ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome' && m.token) {
        this.token = m.token;
        if (m.name) { this.name = m.name; this.store.setItem('pt_name', m.name); }
        this.store.setItem('pt_token', m.token);
      }
      if (m.t === 'replaced') {
        // 会话在其他页面登录，停止自动重连
        this.closedByUser = true;
      }
      this.onMsg(m);
    };
    this.ws.onclose = () => {
      if (this.closedByUser) return;
      this.onMsg({ t: '_disconnected' });
      setTimeout(() => this.connect(), 1200);
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch { /* noop */ } };
  }

  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  setName(name) {
    this.name = name;
    this.store.setItem('pt_name', name);
    this.send({ t: 'set_name', name });
  }
}
