// Minimal Chrome DevTools Protocol client. Node 24 ships a WebSocket client and
// Playwright's chromium is already on this machine, so driving a real browser
// costs no new dependency and nothing extra in the browser bundle.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const CANDIDATES = [
  process.env.GHOSTLINE_CHROME,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  // macOS. Without these every script in this folder needs GHOSTLINE_CHROME
  // exported by hand, which is a papercut that turns into "the audio check
  // does not work on my machine".
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
].filter(Boolean);

export function findChrome() {
  for (const p of CANDIDATES) if (existsSync(p)) return p;
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (existsSync(root)) {
    for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const p = `${root}/${dir}/${rel}`;
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

async function poll(fn, { tries = 60, every = 250, what = 'condition' } = {}) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch { /* keep waiting */ }
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`timed out waiting for ${what}`);
}
export { poll };

export class Browser {
  static async launch({ port = 9333, profile } = {}) {
    const bin = findChrome();
    if (!bin) throw new Error('no chromium found — set GHOSTLINE_CHROME');
    const proc = spawn(bin, [
      '--headless=new', `--remote-debugging-port=${port}`,
      '--no-sandbox', '--disable-dev-shm-usage',
      // SwiftShader so WebGL context creation succeeds without a GPU.
      '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
      '--autoplay-policy=no-user-gesture-required',
      // Without these, Chromium clamps setTimeout in a page it considers
      // backgrounded — and a headless page always is. It only bites after the
      // ~5 minute intensive-throttling threshold, so a short run looks fine and
      // a long one appears to hang partway through. The caption typewriter is
      // a setTimeout chain, so it is the first thing to visibly stall.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--window-size=1600,900', '--hide-scrollbars', '--mute-audio',
      ...(profile ? [`--user-data-dir=${profile}`] : []),
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.stderr.resume();     // drain, or chrome blocks on a full pipe

    // Ctrl-C or a failed assertion must not leave a headless Chromium running
    // with a stale profile in /tmp. `exit` covers every normal and error exit,
    // including an unhandled rejection; the two signals would otherwise kill us
    // before `exit` handlers run, so they reap and then re-raise so the exit
    // code still says what happened.
    //
    // Deliberately no `uncaughtException` hook: registering one stops Node
    // crashing on a real bug, which would turn a failing test green.
    const reapChild = () => { try { proc.kill(); } catch { /* already gone */ } };
    process.once('exit', reapChild);
    const onSignal = (signal) => {
      reapChild();
      process.removeListener(signal, onSignal);
      process.kill(process.pid, signal);
    };
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, onSignal);

    const ver = await poll(
      async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json(),
      { what: 'chrome devtools endpoint' });
    return new Browser(proc, port, ver.webSocketDebuggerUrl, reapChild, onSignal);
  }

  constructor(proc, port, wsUrl, reap, onSignal) {
    this.proc = proc; this.port = port; this.wsUrl = wsUrl;
    this.reap = reap; this.onSignal = onSignal;
  }

  async open(url) {
    const ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const page = new Page(ws);
    const { targetId } = await page.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await page.send('Target.attachToTarget', { targetId, flatten: true });
    page.sessionId = sessionId;
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Page.enable');
    await page.send('Network.enable');
    await page.send('Page.navigate', { url });
    return page;
  }

  close() {
    this.reap();
    process.removeListener('exit', this.reap);
    for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, this.onSignal);
  }
}

export class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedRequests = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        return;
      }
      if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
        this.failedRequests.push(`${msg.params.response.status} ${msg.params.response.url}`);
      }
      if (msg.method === 'Network.loadingFailed') {
        this.failedRequests.push(`failed ${msg.params.errorText}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.pageErrors.push(d.exception?.description || d.text || 'unknown exception');
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(msg.params.args.map((a) => a.description ?? a.value).join(' '));
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        this.consoleErrors.push(msg.params.entry.text);
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 30000);
    });
  }

  // Evaluates in the page and returns a structured-cloned value.
  async eval(fnOrExpr, ...args) {
    const expr = typeof fnOrExpr === 'function'
      ? `(${fnOrExpr.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`
      : fnOrExpr;
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }

  waitFor(fn, opts = {}) { return poll(() => this.eval(fn), opts); }
}
