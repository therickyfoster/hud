/* PRA HUD — Avatar Tab (SVG generator + PNG/SVG export + NFT/ENS fetch + seed/palette)
   - Offline-first, no server needed
   - Local “avatar DB” for assets; HUD’s main DB for cross-tab sharing
   - Randomizer, palettes, trait sliders, upload photo mask, export PNG/SVG
   - Optional NFT PFP import (via ethers v6 if available)
   - Writes HUD-badge SVG to kv key 'hud_avatar_svg' for other modules
   extrasuperficial antideprenarrative inversion (comment only; protective narrative shim)
*/

export async function mount(root, { cfg, db }) {
  root.style.padding = '10px';
  root.style.fontSize = '13px';
  root.style.color = '#EAF2FF';

  const cssBtn = 'all:unset;cursor:pointer;padding:8px 12px;border-radius:10px;background:rgba(127,227,199,.15);border:1px solid rgba(127,227,199,.35);color:#7FE3C7;font-weight:600';
  const row = (gap=8) => `display:flex;gap:${gap}px;align-items:center;flex-wrap:wrap`;

  // Lightweight local DB just for avatar binaries (don’t touch HUD DB versioning)
  const adb = {
    _dbp:null,
    async open(){
      if (this._dbp) return this._dbp;
      this._dbp = new Promise((res,rej)=>{
        const req = indexedDB.open('pra_avatar_db', 1);
        req.onupgradeneeded = (ev)=>{
          const d = ev.target.result;
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
          if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
        };
        req.onsuccess = ()=>res(req.result);
        req.onerror = ()=>rej(req.error);
      });
      return this._dbp;
    },
    async put(store,key,val){
      const d = await this.open();
      return new Promise((res,rej)=>{
        const tx = d.transaction(store,'readwrite');
        const os = tx.objectStore(store);
        const r = os.put(val,key);
        r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);
      });
    },
    async get(store,key){
      const d = await this.open();
      return new Promise((res,rej)=>{
        const tx = d.transaction(store,'readonly');
        const os = tx.objectStore(store);
        const r = os.get(key);
        r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
      });
    }
  };

  // Default palette & trait “pack” (you can swap this later with external JSON)
  const PACK = {
    palettes: {
      aurora: ['#0b1020','#1a2a6c','#2a9d8f','#7fe3c7','#ffd36e'],
      magma:  ['#120b11','#7b1e3a','#f46036','#ffc857','#e4fde1'],
      ocean:  ['#06121f','#0b3954','#087e8b','#bfd7ea','#ff5a5f']
    },
    // Layer order: bg -> body -> face -> eyes -> mouth -> accessory
    layers: ['bg','body','face','eyes','mouth','acc'],
    shapes: {
      body: ['rounded','hex','circle','squircle'],
      face: ['oval','round','square'],
      eyes: ['dots','sleepy','wide','cyber'],
      mouth:['line','smile','frown','robot'],
      acc:  ['none','visor','mask','antenna']
    }
  };

  // State
  const state = {
    name: 'Traveler',
    seed: genSeed(),
    palette: 'aurora',
    bgStyle: 'gradient',
    traits: {
      body: 'squircle',
      face: 'oval',
      eyes: 'dots',
      mouth: 'smile',
      acc: 'none'
    },
    hueShift: 0,
    eyeY: 0, mouthY: 0
  };

  // UI skeleton
  root.innerHTML = `
    <div style="display:grid;gap:10px">
      <div style="${row(10)}">
        <strong style="color:#7FE3C7">Avatar</strong>
        <button id="rand" style="${cssBtn}">Randomize</button>
        <button id="save" style="${cssBtn}">Save</button>
        <button id="exportSvg" style="${cssBtn}">Export SVG</button>
        <button id="exportPng" style="${cssBtn}">Export PNG</button>
        <span id="status" style="opacity:.85"></span>
      </div>

      <div style="${row(16)}">
        <label>Name <input id="name" style="margin-left:6px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF;width:180px"></label>
        <label>Seed <input id="seed" style="margin-left:6px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF;width:170px"></label>
        <label>Palette
          <select id="palette" style="margin-left:6px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF">
            ${Object.keys(PACK.palettes).map(p=>`<option value="${p}">${p}</option>`).join('')}
          </select>
        </label>
        <label>Hue
          <input id="hue" type="range" min="-180" max="180" step="1" value="0" style="vertical-align:middle;width:180px;margin-left:6px">
        </label>
        <label>Eye Y <input id="eyeY" type="range" min="-12" max="12" value="0" style="width:140px;margin-left:6px"></label>
        <label>Mouth Y <input id="mouthY" type="range" min="-12" max="12" value="0" style="width:140px;margin-left:6px"></label>
      </div>

      <div style="${row(14)}">
        ${Object.entries(PACK.shapes).map(([k,vals]) => `
          <label>${cap(k)}
            <select data-trait="${k}" style="margin-left:6px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF">
              ${vals.map(v=>`<option value="${v}">${v}</option>`).join('')}
            </select>
          </label>
        `).join('')}
        <label>Background
          <select id="bgStyle" style="margin-left:6px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF">
            <option value="gradient">Gradient</option>
            <option value="solid">Solid</option>
            <option value="none">Transparent</option>
          </select>
        </label>
      </div>

      <div style="${row(10)}">
        <input id="photo" type="file" accept="image/*" style="display:none">
        <button id="upload" style="${cssBtn}">Photo Overlay</button>
        <button id="clearPhoto" style="${cssBtn}">Clear Photo</button>
        <label>Opacity <input id="photoOp" type="range" min="0" max="100" value="70" style="width:160px;margin-left:6px"></label>
        <label>Zoom <input id="photoZm" type="range" min="50" max="200" value="100" style="width:160px;margin-left:6px"></label>
        <label>X <input id="photoX" type="range" min="-100" max="100" value="0" style="width:160px;margin-left:6px"></label>
        <label>Y <input id="photoY" type="range" min="-100" max="100" value="0" style="width:160px;margin-left:6px"></label>
      </div>

      <details>
        <summary style="cursor:pointer;opacity:.9">Import PFP (NFT/ENS/URL)</summary>
        <div style="margin-top:8px;${row(8)}">
          <input id="nftAddr" placeholder="Contract 0x..." style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF;width:240px">
          <input id="nftId" placeholder="Token ID" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF;width:120px">
          <button id="pullNft" style="${cssBtn}">Pull NFT</button>
          <input id="ens" placeholder="ENS (name.eth)" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF;width:200px">
          <button id="pullEns" style="${cssBtn}">Pull ENS</button>
          <input id="imgUrl" placeholder="Direct Image URL" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF;flex:1;min-width:220px">
          <button id="pullUrl" style="${cssBtn}">Load URL</button>
        </div>
      </details>

      <div style="${row(18)};align-items:flex-start">
        <div id="preview" style="width:240px;height:240px;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03)"></div>
        <textarea id="json" spellcheck="false" style="flex:1;min-height:220px;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#EAF2FF;font-family:ui-monospace,monospace"></textarea>
        <div style="display:grid;gap:8px;min-width:210px">
          <button id="importJson" style="${cssBtn}">Import JSON</button>
          <button id="copyJson" style="${cssBtn}">Copy JSON</button>
          <small style="opacity:.8">Tip: avatar config is also saved to HUD kv: <code>avatar:profile</code> and <code>hud_avatar_svg</code>.</small>
        </div>
      </div>
    </div>
  `;

  // Refs
  const $ = (s,el=root)=>el.querySelector(s);
  const elPreview = $('#preview');
  const elName = $('#name'); const elSeed = $('#seed'); const elPalette = $('#palette');
  const elHue = $('#hue'); const elEyeY = $('#eyeY'); const elMouthY = $('#mouthY');
  const elBg = $('#bgStyle'); const elStatus = $('#status');
  const elRand = $('#rand'); const elSave = $('#save'); const exSVG = $('#exportSvg'); const exPNG = $('#exportPng');
  const elImport = $('#importJson'); const elCopy = $('#copyJson'); const elJSON = $('#json');
  const elUpload = $('#upload'); const elPhoto = $('#photo'); const elClearPhoto = $('#clearPhoto');
  const elPhotoOp = $('#photoOp'); const elPhotoZm = $('#photoZm'); const elPhotoX = $('#photoX'); const elPhotoY = $('#photoY');
  const elNFT = $('#pullNft'); const elENS = $('#pullEns'); const elURL = $('#pullUrl');
  const elAddr = $('#nftAddr'); const elTok = $('#nftId'); const elEns = $('#ens'); const elImgUrl = $('#imgUrl');

  // Wire selects for traits
  root.querySelectorAll('[data-trait]').forEach(sel=>{
    sel.value = state.traits[sel.dataset.trait] || sel.value;
    sel.addEventListener('change', ()=>{ state.traits[sel.dataset.trait] = sel.value; render(); syncJSON(); });
  });

  // Init inputs
  elName.value = state.name;
  elSeed.value = state.seed;
  elPalette.value = state.palette;
  elHue.value = state.hueShift;
  elEyeY.value = state.eyeY;
  elMouthY.value = state.mouthY;
  elBg.value = state.bgStyle;

  // Photo overlay state
  let photoBlob = null; // raw file
  let photoURL = null;  // object URL or remote
  function clearPhoto(){ photoBlob=null; if (photoURL) URL.revokeObjectURL(photoURL); photoURL=null; render(); }

  // Bindings
  [elName, elSeed].forEach(i=>i.addEventListener('input', ()=>{ state[i===elName?'name':'seed']=i.value; render(); syncJSON(); }));
  [elPalette, elBg].forEach(i=>i.addEventListener('change', ()=>{ state[i===elPalette?'palette':'bgStyle']=i.value; render(); syncJSON(); }));
  elHue.addEventListener('input', ()=>{ state.hueShift = +elHue.value; render(); syncJSON(); });
  elEyeY.addEventListener('input', ()=>{ state.eyeY = +elEyeY.value; render(); syncJSON(); });
  elMouthY.addEventListener('input', ()=>{ state.mouthY = +elMouthY.value; render(); syncJSON(); });
  elUpload.addEventListener('click', ()=> elPhoto.click());
  elPhoto.addEventListener('change', ()=>{
    const f = elPhoto.files?.[0]; if (!f) return;
    photoBlob = f; photoURL = URL.createObjectURL(f); render(); syncJSON();
  });
  elClearPhoto.addEventListener('click', ()=>{ clearPhoto(); syncJSON(); });
  [elPhotoOp, elPhotoZm, elPhotoX, elPhotoY].forEach(i=> i.addEventListener('input', ()=> render()));

  elRand.addEventListener('click', ()=>{
    randomize(state); render(); syncJSON(); toast('Randomized');
  });
  elSave.addEventListener('click', async ()=>{
    await Promise.all([
      db.put('kv','avatar:profile', JSON.stringify(serialize())),
      writeBadgeToHUD(),
      photoBlob ? adb.put('files','photo',photoBlob) : adb.put('files','photo',null)
    ]);
    toast('Saved');
  });
  exSVG.addEventListener('click', ()=> downloadText(svgMarkup(240), `avatar-${state.seed}.svg`, 'image/svg+xml'));
  exPNG.addEventListener('click', async ()=>{
    const png = await svgToPng(svgMarkup(1024), 1024);
    downloadBlob(png, `avatar-${state.seed}.png`);
  });

  elImport.addEventListener('click', ()=>{
    try { const o = JSON.parse(elJSON.value); apply(o); render(); syncJSON(); toast('Imported'); }
    catch { toast('Invalid JSON'); }
  });
  elCopy.addEventListener('click', ()=>{
    navigator.clipboard.writeText(elJSON.value); toast('Copied JSON');
  });

  // Optional NFT/ENS/URL loaders (best-effort; needs ethers for NFT)
  elURL.addEventListener('click', ()=>{ if (!elImgUrl.value.trim()) return; photoURL = elImgUrl.value.trim(); photoBlob=null; render(); });
  elENS.addEventListener('click', async ()=>{
    try{
      const ensName = elEns.value.trim(); if (!ensName) return;
      const ethers = await ensureEthers();
      const provider = new ethers.JsonRpcProvider('https://cloudflare-eth.com');
      const r = await provider.getAvatar(ensName);
      if (r) { photoURL=r; photoBlob=null; render(); toast('ENS avatar loaded'); }
      else toast('No ENS avatar');
    } catch { toast('ENS lookup failed'); }
  });
  elNFT.addEventListener('click', async ()=>{
    try{
      const addr = elAddr.value.trim(), id = elTok.value.trim();
      if (!addr || !id) return;
      const ethers = await ensureEthers();
      const provider = new ethers.JsonRpcProvider('https://cloudflare-eth.com');
      const abi = [{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"tokenURI","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}];
      const c = new ethers.Contract(addr, abi, provider);
      let uri = await c.tokenURI(id);
      if (uri.startsWith('ipfs://')) uri = `https://ipfs.io/ipfs/${uri.replace('ipfs://','')}`;
      const meta = await fetch(uri).then(r=>r.json());
      let img = meta.image || meta.image_url;
      if (img?.startsWith('ipfs://')) img = `https://ipfs.io/ipfs/${img.replace('ipfs://','')}`;
      if (img) { photoURL=img; photoBlob=null; render(); toast('NFT image loaded'); }
      else toast('NFT missing image');
    } catch { toast('NFT fetch failed'); }
  });

  // Try to load saved config
  try {
    const saved = await db.get('kv','avatar:profile');
    if (saved) { apply(JSON.parse(saved)); }
    const savedPhoto = await adb.get('files','photo');
    if (savedPhoto) { photoBlob = savedPhoto; photoURL = URL.createObjectURL(savedPhoto); }
  } catch {}
  render(); syncJSON();

  // ——— helpers ———

  function serialize(){
    return {
      name: state.name, seed: state.seed, palette: state.palette, bgStyle: state.bgStyle,
      traits: {...state.traits}, hueShift: state.hueShift, eyeY: state.eyeY, mouthY: state.mouthY,
      photo: !!photoBlob || !!photoURL,
      photoControls: { op:+elPhotoOp.value, zm:+elPhotoZm.value, x:+elPhotoX.value, y:+elPhotoY.value }
    };
  }
  function apply(o){
    Object.assign(state, {
      name: o.name ?? state.name,
      seed: o.seed ?? state.seed,
      palette: o.palette ?? state.palette,
      bgStyle: o.bgStyle ?? state.bgStyle,
      hueShift: +o.hueShift || 0,
      eyeY: +o.eyeY || 0,
      mouthY: +o.mouthY || 0,
      traits: {...state.traits, ...(o.traits||{})}
    });
    elName.value = state.name; elSeed.value = state.seed; elPalette.value = state.palette;
    elHue.value = state.hueShift; elEyeY.value = state.eyeY; elMouthY.value = state.mouthY; elBg.value = state.bgStyle;
    root.querySelectorAll('[data-trait]').forEach(sel=> sel.value = state.traits[sel.dataset.trait]);
    const pc = o.photoControls || {};
    elPhotoOp.value = pc.op ?? 70; elPhotoZm.value = pc.zm ?? 100; elPhotoX.value = pc.x ?? 0; elPhotoY.value = pc.y ?? 0;
  }
  function syncJSON(){ elJSON.value = JSON.stringify(serialize(), null, 2); }

  function toast(s){ elStatus.textContent = s; setTimeout(()=>elStatus.textContent='', 1500); }
  function cap(s){ return s[0].toUpperCase()+s.slice(1); }
  function genSeed(){ return (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0).toString(16); }
  function rng(seed){
    // xorshift32-ish
    let x = parseInt(seed,16) || 123456789;
    return ()=>{ x ^= x<<13; x ^= x>>>17; x ^= x<<5; return (x>>>0)/4294967296; };
  }
  function randomize(st){
    const r = rng(genSeed());
    st.seed = genSeed();
    st.palette = pick(Object.keys(PACK.palettes), r);
    for (const k of Object.keys(PACK.shapes)) st.traits[k] = pick(PACK.shapes[k], r);
    st.hueShift = Math.floor(r()*360)-180;
    st.eyeY = Math.floor(r()*24)-12;
    st.mouthY = Math.floor(r()*24)-12;
    elSeed.value = st.seed; elPalette.value = st.palette; elHue.value = st.hueShift; elEyeY.value = st.eyeY; elMouthY.value = st.mouthY;
    root.querySelectorAll('[data-trait]').forEach(sel=> sel.value = st.traits[sel.dataset.trait]);
  }
  function pick(arr, r=Math.random){ return arr[Math.floor(r()*arr.length)]; }

  function palette() {
    const base = PACK.palettes[state.palette] || PACK.palettes.aurora;
    if (!state.hueShift) return base;
    // apply hue shift in HSL space (approx via CSS filter matrix on the fly)
    return base.map(hex => hslShift(hexToHsl(hex), state.hueShift)).map(hslToHex);
  }

  // Geometry helpers (simple, stylized)
  const SZ = 240;
  function svgMarkup(size=SZ){
    const [c0,c1,c2,c3,c4] = palette();
    const r = rng(state.seed);
    const center = size/2;

    // Background
    let bg = '';
    if (state.bgStyle === 'gradient') {
      bg = `
        <defs>
          <linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${c0}"/><stop offset="100%" stop-color="${c1}"/>
          </linearGradient>
        </defs>
        <rect width="${size}" height="${size}" fill="url(#bgG)"/>
      `;
    } else if (state.bgStyle === 'solid') {
      bg = `<rect width="${size}" height="${size}" fill="${c0}"/>`;
    }

    // Body shape
    const body = state.traits.body;
    const face = state.traits.face;
    const eyes = state.traits.eyes;
    const mouth= state.traits.mouth;
    const acc  = state.traits.acc;

    const bodyPath = bodySVG(body, size);
    const facePath = faceSVG(face, size);
    const eyeEls   = eyesSVG(eyes, size, state.eyeY, c4);
    const mouthEl  = mouthSVG(mouth, size, state.mouthY, c3);
    const accEl    = accSVG(acc, size, c2);

    // Name plate (subtle)
    const nameEl = state.name ? `
      <g opacity=".9" font-family="system-ui,Segoe UI,Roboto" font-size="${size*0.08}">
        <text x="${center}" y="${size - 14}" fill="${c4}" text-anchor="middle">${escapeXml(state.name)}</text>
      </g>` : '';

    // Photo overlay (masked into body)
    let photoEl = '';
    if (photoURL) {
      const op = (+elPhotoOp.value||70) / 100;
      const zm = (+elPhotoZm.value||100)/100;
      const px = (+elPhotoX.value||0);
      const py = (+elPhotoY.value||0);
      photoEl = `
        <defs>
          <clipPath id="bodyClip"><path d="${bodyPath}"/></clipPath>
        </defs>
        <image href="${escapeXml(photoURL)}"
               x="${center - (size*zm/2) + px}"
               y="${center - (size*zm/2) + py}"
               width="${size*zm}" height="${size*zm}"
               preserveAspectRatio="xMidYMid slice"
               clip-path="url(#bodyClip)" opacity="${op}"/>
      `;
    }

    // Outer border
    const border = `<path d="${bodyPath}" fill="none" stroke="${c4}" stroke-opacity=".35" stroke-width="3"/>`;

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  <g>
    <path d="${bodyPath}" fill="${c2}" fill-opacity=".15"/>
    <path d="${facePath}" fill="${c3}" fill-opacity=".18"/>
    ${photoEl}
    ${eyeEls}
    ${mouthEl}
    ${accEl}
    ${border}
  </g>
  ${nameEl}
</svg>`.trim();
  }

  function bodySVG(kind, size){
    const r = size/2, c = r;
    switch(kind){
      case 'circle':   return `M ${c},${c} m -${r-8},0 a ${r-8},${r-8} 0 1,0 ${2*(r-8)},0 a ${r-8},${r-8} 0 1,0 -${2*(r-8)},0`;
      case 'hex':      return polygonPath(size, 6, size*0.44);
      case 'squircle': return roundedRectPath(size*0.86, size*0.86, size*0.07, c - size*0.43, c - size*0.43);
      case 'rounded':
      default:         return roundedRectPath(size*0.9,  size*0.9,  size*0.16, c - size*0.45, c - size*0.45);
    }
  }
  function faceSVG(kind, size){
    const c = size/2;
    const w = size*0.62, h = size*0.52, r = size*0.14;
    switch(kind){
      case 'round':  return `M ${c-w/2},${c-h/2} h ${w} a ${r},${r} 0 0 1 ${r},${r} v ${h-2*r} a ${r},${r} 0 0 1 -${r},${r} h -${w-2*r} a ${r},${r} 0 0 1 -${r},-${r} v -${h-2*r} a ${r},${r} 0 0 1 ${r},-${r} z`;
      case 'square': return roundedRectPath(w,h,size*0.06,c-w/2,c-h/2);
      case 'oval':
      default:       return `M ${c},${c-h/2} a ${w/2},${h/2} 0 1,0 0,${h} a ${w/2},${h/2} 0 1,0 0,-${h}`;
    }
  }
  function eyesSVG(kind, size, offY, color){
    const c = size/2, y = c - size*0.06 + offY;
    const dx = size*0.16;
    switch(kind){
      case 'sleepy': return `<g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round">
        <path d="M ${c-dx-10},${y} q 10,-6 20,0"/><path d="M ${c+dx-10},${y} q 10,-6 20,0"/></g>`;
      case 'wide':   return `<g fill="${color}"><circle cx="${c-dx}" cy="${y}" r="${size*0.02}"/><circle cx="${c+dx}" cy="${y}" r="${size*0.02}"/></g>`;
      case 'cyber':  return `<g fill="none" stroke="${color}" stroke-width="2">
        <rect x="${c-dx-8}" y="${y-6}" width="16" height="12" rx="3"/><rect x="${c+dx-8}" y="${y-6}" width="16" height="12" rx="3"/></g>`;
      case 'dots':
      default:       return `<g fill="${color}"><circle cx="${c-dx}" cy="${y}" r="${size*0.016}"/><circle cx="${c+dx}" cy="${y}" r="${size*0.016}"/></g>`;
    }
  }
  function mouthSVG(kind, size, offY, color){
    const c = size/2, y = c + size*0.11 + offY, w = size*0.2;
    switch(kind){
      case 'frown': return `<path d="M ${c-w},${y+6} q ${w},-16 ${w*2},0" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'robot': return `<rect x="${c-w/2}" y="${y-6}" width="${w}" height="12" rx="3" fill="${color}" fill-opacity=".6"/>`;
      case 'line':  return `<line x1="${c-w}" y1="${y}" x2="${c+w}" y2="${y}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
      case 'smile':
      default:      return `<path d="M ${c-w},${y-2} q ${w},16 ${w*2},0" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    }
  }
  function accSVG(kind, size, color){
    const c = size/2;
    switch(kind){
      case 'visor':   return `<rect x="${c-70}" y="${c-34}" width="140" height="24" rx="12" fill="${color}" fill-opacity=".35"/>`;
      case 'mask':    return `<rect x="${c-60}" y="${c+18}" width="120" height="36" rx="12" fill="${color}" fill-opacity=".35"/>`;
      case 'antenna': return `<g stroke="${color}" stroke-opacity=".6" stroke-width="3"><line x1="${c-50}" y1="${c-90}" x2="${c-20}" y2="${c-40}"/><circle cx="${c-50}" cy="${c-90}" r="6" fill="${color}"/></g>`;
      default:        return '';
    }
  }

  function escapeXml(s=''){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function polygonPath(size, n, r){ const cx=size/2, cy=size/2, a=2*Math.PI/n; let d='M '; for(let i=0;i<n;i++){ const x=cx + r*Math.cos(i*a - Math.PI/2), y=cy + r*Math.sin(i*a - Math.PI/2); d += (i? ' L ':'')+x.toFixed(2)+','+y.toFixed(2); } return d+' Z'; }
  function roundedRectPath(w,h,r,x,y){
    return `M ${x+r},${y} h ${w-2*r} a ${r},${r} 0 0 1 ${r},${r} v ${h-2*r} a ${r},${r} 0 0 1 -${r},${r} h -${w-2*r} a ${r},${r} 0 0 1 -${r},-${r} v -${h-2*r} a ${r},${r} 0 0 1 ${r},-${r} z`;
  }

  // Color helpers
  function hexToHsl(hex){
    const {r,g,b}=hexToRgb(hex);
    const r1=r/255,g1=g/255,b1=b/255;
    const max=Math.max(r1,g1,b1),min=Math.min(r1,g1,b1);
    let h,s,l=(max+min)/2;
    if (max===min){ h=s=0; } else {
      const d=max-min;
      s=l>0.5? d/(2-max-min) : d/(max+min);
      switch(max){
        case r1: h=(g1-b1)/d + (g1<b1?6:0); break;
        case g1: h=(b1-r1)/d + 2; break;
        case b1: h=(r1-g1)/d + 4; break;
      }
      h/=6;
    }
    return {h:h*360,s:s*100,l:l*100};
  }
  function hslToHex({h,s,l}){
    h/=360; s/=100; l/=100;
    const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
    const q=l<.5? l*(1+s) : l+s-l*s, p=2*l-q;
    const r=Math.round(hue2rgb(p,q,h+1/3)*255), g=Math.round(hue2rgb(p,q,h)*255), b=Math.round(hue2rgb(p,q,h-1/3)*255);
    return rgbToHex(r,g,b);
  }
  function hslShift(hsl,deg){ return {...hsl, h: ((hsl.h + deg)%360+360)%360}; }
  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16)} : {r:0,g:0,b:0};
  }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''); }

  // Render
  function render(){
    elPreview.innerHTML = svgMarkup(240);
    // persist badge svg for other tabs
    writeBadgeToHUD();
  }

  async function writeBadgeToHUD(){
    try { await db.put('kv','hud_avatar_svg', svgMarkup(96)); } catch {}
  }

  // Exporters
  function downloadText(text, name, type='text/plain'){
    const blob = new Blob([text], {type}); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function downloadBlob(blob, name){
    const a = document.createElement('a'); const url = URL.createObjectURL(blob);
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  async function svgToPng(svgTxt, sz=1024){
    const blob = new Blob([svgTxt], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    try{
      const img = new Image(); img.crossOrigin='anonymous';
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = sz; canvas.height = sz;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0,0, sz, sz);
      return await new Promise(res=> canvas.toBlob(b=>res(b), 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  }

  async function ensureEthers(){
    if (window.ethers) return window.ethers;
    return await new Promise((res, rej)=>{
      const s = document.createElement('script');
      s.src = '/hud/vendor/ethers.min.js';
      s.onload = ()=> res(window.ethers);
      s.onerror = ()=> rej(new Error('ethers load failed'));
      document.head.appendChild(s);
    });
  }
}