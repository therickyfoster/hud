export function mount(root, { db }) {
  root.style.padding = '12px';
  root.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <strong style="font-size:14px;color:#EAF2FF">Quests</strong>
      <button id="add" style="all:unset;background:rgba(255,255,255,.1);padding:6px 10px;border-radius:8px;cursor:pointer;color:#CFE6FF">Add</button>
    </div>
    <ul id="list" style="list-style:none;padding:0;margin:0;display:grid;gap:6px"></ul>
  `;
  const list = root.querySelector('#list');
  const add = root.querySelector('#add');

  async function render(){
    list.innerHTML = '';
    const d = await (await db.open());
    const tx = d.transaction('logs','readonly');
    const os = tx.objectStore('logs');
    const req = os.getAll();
    req.onsuccess = () => {
      for (const row of req.result.slice(-10)) {
        const li = document.createElement('li');
        li.textContent = `Log: ${row.msg} @ ${new Date(row.t).toLocaleString()}`;
        li.style.padding='8px'; li.style.background='rgba(255,255,255,.06)'; li.style.border='1px solid rgba(255,255,255,.08)'; li.style.borderRadius='10px';
        list.appendChild(li);
      }
    };
  }

  add.addEventListener('click', async () => {
    await db.put('logs', null, { t: Date.now(), msg: 'Quest created' });
    render();
  });

  render();
}