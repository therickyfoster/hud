/* hud-loader.js — ultra-portable HUD bootstrapper
   - Shadow DOM overlay (isolated styles)
   - Hotkey toggle (Ctrl+`)
   - IndexedDB bootstrap
   - Optional TLK.io chat (collapsed)
   - Manifest-driven micro-modules
   - SW registration (scoped to /hud/)
   - Parallax starfield background (theme)
   - Avatar badge slot in titlebar (reads 'hud_avatar_svg' from kv)

   extrasuperficial antideprenarrative inversion — protective narrative shim (comment only)
*/

(() => {
  // ---- guard: single instance
  if (window.__PRA_HUD_LOADED__) return;
  window.__PRA_HUD_LOADED__ = true;

  // ---- config from dataset
  const currentScript = document.currentScript || (function(){
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const cfg = {
    root: (currentScript?.dataset.hudRoot || '/hud/').replace(/\/+$/, '') + '/',
    theme: currentScript?.dataset.theme || 'constellations',
    chatRoom: currentScript?.dataset.chatRoom || 'pra-global',
    collapsed: (currentScript?.dataset.collapsed || 'true') === 'true',
    manifest: currentScript?.dataset.manifest || 'hud-manifest.json',
  };

  // ---- create host container
  const host = document.createElement('div');
  host.id = 'pra-hud-host';
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0 0 auto auto',
    zIndex: '2147483000',
    width: '420px',
    maxWidth: '90vw',
    height: '560px',
    maxHeight: '90vh',
    pointerEvents: 'none',
  });
  document.documentElement.appendChild(host);

  // ---- shadow root
  const shadow = host.attachShadow({ mode: 'open' });

  // ---- base styles (scoped)
  const style = document.createElement('style');
  style.textContent = `
:host, .hud-root { all: initial; font-family: system-ui, ui-sans-serif, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji; }
.hud-root { pointer-events: auto; box-sizing: border-box; position: relative; display: grid; grid-template-rows: auto 1fr; width: 100%; height: 100%; border-radius: 16px; overflow: clip; background: rgba(6,10,18,.8); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,.08); }
.hud-titlebar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,0)); cursor: move; user-select: none; }
.hud-titlebar .title { font-weight: 600; letter-spacing:.2px; color: #EAF2FF; flex: 1; }
.hud-titlebar .btn { appearance: none; border: 0; background: rgba(255,255,255,.08); color: #EAF2FF; border-radius: 10px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
.hud-body { position: relative; padding: 0; }
.hud-tabs { display: flex; gap: 6px; padding: 8px; flex-wrap: wrap; }
.hud-tab { font-size: 12px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,.06); color: #CFE6FF; cursor: pointer; border: 1px solid rgba(255,255,255,.08); }
.hud-tab.active { background: rgba(127,227,199,.12); border-color: rgba(127,227,199,.35); color: #7FE3C7; }
.hud-panel { display: none; height: calc(100% - 44px); }
.hud-panel.active { display: block; }
.hud-iframe, .hud-canvas { width: 100%; height: 100%; border: 0; display: block; }

.hud-resize { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; opacity:.7; }
.hud-badge { position: absolute; left: 10px; bottom: 10px; font-size:10px; color:#9FC7FF; opacity:.8; }

.hud-collapsed { height: 46px !important; }
  `;
  shadow.appendChild(style);

  // ---- root UI (AVATAR BADGE SLOT ADDED)
  const root = document.createElement('div');
  root.className = 'hud-root';
  root.innerHTML = `
    <div class="hud-titlebar">
      <span id="hudAvatarBadge" style="width:22px;height:22px;border-radius:999px;overflow:hidden;display:inline-block;border:1px solid rgba(255,255,255,.2)"></span>
      <div class="title">PRA HUD</div>
      <button class="btn" id="hudToggle">Toggle</button>
      <button class="btn" id="hudMin">Min</button>
      <button class="btn" id="hudClose">Close</button>
    </div>
    <div class="hud-body">
      <div class="hud-tabs" id="hudTabs"></div>
      <div class="hud-panel active" id="panel-dashboard"></div>
    </div>
    <svg class="hud-resize" viewBox="0 0 12 12" aria-hidden="true"><path d="M2,10 L10,2 M4,10 L10,4 M6,10 L10,6" stroke="currentColor" stroke-width="2" fill="none"/></svg>
    <div class="hud-badge">Ctrl+\` to toggle • ${cfg.theme}</div>
  `;
  shadow.appendChild(root);

  const titlebar = root.querySelector('.hud-titlebar');
  const btnToggle = root.querySelector('#hudToggle');
  const btnMin = root.querySelector('#hudMin');
  const btnClose = root.querySelector('#hudClose');
  const tabsEl = root.querySelector('#hudTabs');
  const panelDashboard = root.querySelector('#panel-dashboard');
  const resizeEl = root.querySelector('.hud-resize');

  // ---- drag move
  let dragging = false, startX=0, startY=0, startLeft=0, startTop=0;
  titlebar.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = host.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    host.style.left = Math.max(0, startLeft + dx) + 'px';
    host.style.top  = Math.max(0, startTop  + dy) + 'px';
    host.style.right = 'auto'; host.style.bottom = 'auto';
  });
  window.addEventListener('mouseup', () => dragging = false);

  // ---- resize
  let resizing = false, startW=0, startH=0;
  resizeEl.addEventListener('mousedown', (e) => {
    resizing = true;
    const r = host.getBoundingClientRect();
    startW = r.width; startH = r.height;
    startX = e.clientX; startY = e.clientY;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    host.style.width = Math.max(320, startW + dx) + 'px';
    host.style.height = Math.max(240, startH + dy) + 'px';
  });
  window.addEventListener('mouseup', () => resizing = false);

  // ---- hotkeys
  const toggleHUD = () => {
    const isHidden = host.style.display === 'none';
    host.style.display = isHidden ? 'block' : 'none';
  };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '`') { toggleHUD(); }
  });

  // ---- buttons
  btnToggle.addEventListener('click', toggleHUD);
  btnMin.addEventListener('click', () => {
    if (root.classList.contains('hud-collapsed')) {
      root.classList.remove('hud-collapsed');
    } else {
      root.classList.add('hud-collapsed');
    }
  });
  btnClose.addEventListener('click', () => { host.remove(); });

  // ---- IndexedDB bootstrap (namespaced)
  const db = {
    _dbp: null,
    async open() {
      if (this._dbp) return this._dbp;
      this._dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open('pra_hud_db', 1);
        req.onupgradeneeded = (ev) => {
          const d = ev.target.result;
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
          if (!d.objectStoreNames.contains('logs')) d.createObjectStore('logs', { autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return this._dbp;
    },
    async put(store, key, value) {
      const d = await this.open();
      return new Promise((res, rej) => {
        const tx = d.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        const r = store === 'kv' ? os.put(value, key) : os.add(value);
        r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
      });
    },
    async get(store, key) {
      const d = await this.open();
      return new Promise((res, rej) => {
        const tx = d.transaction(store, 'readonly');
        const os = tx.objectStore(store);
        const r = os.get(key);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    }
  };

  // ---- theme: constellations (parallax canvas)
  const canvas = document.createElement('canvas');
  canvas.className = 'hud-canvas';
  panelDashboard.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });
  let pxRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const stars = Array.from({length: 180}, () => ({
    x: Math.random(), y: Math.random(), z: Math.random(), s: Math.random()*1.2+0.2
  }));
  function resizeCanvas(){
    const b = panelDashboard.getBoundingClientRect();
    canvas.width = Math.floor(b.width * pxRatio);
    canvas.height = Math.floor((b.height) * pxRatio);
    canvas.style.width = b.width + 'px';
    canvas.style.height = b.height + 'px';
  }
  resizeCanvas(); new ResizeObserver(resizeCanvas).observe(panelDashboard);

  let mouseX = .5, mouseY = .5;
  shadow.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) / (r.width || 1);
    mouseY = (e.clientY - r.top) / (r.height || 1);
  });

  function renderStars(t){
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    for (const star of stars){
      const depth = 0.6 + 0.4*star.z;
      const parX = (mouseX - .5) * 16 * (1.5 - depth);
      const parY = (mouseY - .5) * 16 * (1.5 - depth);
      const x = Math.floor((star.x * w) + parX);
      const y = Math.floor((star.y * h) + parY);
      const r = (star.s * depth) * pxRatio;
      ctx.globalAlpha = 0.6 + 0.4*Math.sin(t/1000 + star.x*6.28);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fillStyle = '#CFE6FF'; ctx.fill();
    }
    requestAnimationFrame(renderStars);
  }
  requestAnimationFrame(renderStars);

  // ---- tabs and panels from manifest
  const panels = {};
  function addTab(id, label){
    const tab = document.createElement('button');
    tab.className = 'hud-tab' + (Object.keys(panels).length ? '' : ' active');
    tab.textContent = label;
    tab.addEventListener('click', () => {
      shadow.querySelectorAll('.hud-tab').forEach(el=>el.classList.remove('active'));
      shadow.querySelectorAll('.hud-panel').forEach(el=>el.classList.remove('active'));
      tab.classList.add('active');
      panels[id].classList.add('active');
    });
    tabsEl.appendChild(tab);
  }
  function addPanel(id){
    const p = document.createElement('div');
    p.className = 'hud-panel';
    p.id = `panel-${id}`;
    root.querySelector('.hud-body').appendChild(p);
    if (Object.keys(panels).length === 0) p.classList.add('active');
    panels[id] = p;
    return p;
  }

  // ---- Optional: TLK.io chat (collapsed by default)
  function mountChat(id, room){
    const p = addPanel(id);
    addTab(id, 'Chat');
    p.innerHTML = '';
    const chat = document.createElement('iframe');
    chat.className = 'hud-iframe';
    chat.loading = 'lazy';
    chat.referrerPolicy = 'no-referrer';
    chat.src = `https://www.tlk.io/${encodeURIComponent(room)}`;
    p.appendChild(chat);
  }

  // ---- manifest-driven modules
  async function loadManifest() {
    const url = cfg.root + cfg.manifest;
    try {
      const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      return await res.json();
    } catch (e) {
      console.warn('[PRA HUD] manifest load failed:', e);
      return {
        version: 1,
        tabs: [
          { id: 'dashboard', label: 'Dashboard', type: 'canvas' },
          { id: 'log', label: 'Logs', type: 'iframe', src: cfg.root + 'modules/log.html' }
        ],
        options: { chat: true }
      };
    }
  }

  async function boot() {
    try {
      await db.open();

      // AVATAR BADGE INJECT: read small SVG stored by avatar module
      try {
        const badgeHost = shadow.getElementById('hudAvatarBadge');
        const svg = await db.get('kv','hud_avatar_svg');
        if (badgeHost && svg) { badgeHost.innerHTML = svg; }
      } catch {}

      const manifest = await loadManifest();

      // example: additional tabs
      for (const t of manifest.tabs || []){
        if (t.id === 'dashboard') continue; // already present
        addTab(t.id, t.label || t.id);
        const p = addPanel(t.id);
        if (t.type === 'iframe' && t.src){
          const f = document.createElement('iframe');
          f.className = 'hud-iframe'; f.src = t.src; f.loading = 'lazy'; p.appendChild(f);
        } else if (t.type === 'module' && t.src){
          // dynamically load a module that renders into panel
          try {
            const mod = await import(/* @vite-ignore */ t.src);
            mod?.mount?.(p, { cfg, db });
          } catch (e) { p.textContent = 'Module failed to load.'; }
        } else if (t.type === 'html' && t.src){
          const res = await fetch(t.src); p.innerHTML = await res.text();
        } else {
          p.textContent = 'Ready.';
        }
      }

      // chat
      if (manifest.options?.chat) {
        mountChat('chat', cfg.chatRoom);
        if (cfg.collapsed) root.classList.add('hud-collapsed');
      }

      // write a small boot log
      db.put('logs', null, { t: Date.now(), msg: 'HUD boot', page: location.href, theme: cfg.theme });

      // optional service worker (scoped to /hud/)
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register(cfg.root + 'hud-sw.js', { scope: cfg.root });
        } catch (e) {
          // non-fatal
        }
      }

      // anti-tamper-ish breadcrumb (lightweight)
      console.debug('%cPRA HUD ready', 'color:#7FE3C7');
    } catch (e) {
      console.error('[PRA HUD] boot error:', e);
    }
  }

  boot();
})();