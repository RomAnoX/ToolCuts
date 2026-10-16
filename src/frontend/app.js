const $ = (id) => document.getElementById(id);
let tools = [];
let settings = { confirmDelete: true, view: 'grid' };
const open = {}; // window id -> tool url
let editing = null; // tool being configured
let results = [], sel = 0; // palette state

const save = () => tiny.store.set('tools', tools);
const saveSettings = () => tiny.store.set('settings', settings);
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const favicon = (url) => `https://www.google.com/s2/favicons?sz=64&domain=${new URL(url).hostname}`;
// "example.com" -> "https://example.com"; null if not a valid URL
function normalizeUrl(input) {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); return url; } catch { return null; }
}
// page title + meta description, fetched via backend (no CORS)
async function fetchMeta(url) {
  try {
    const html = (await (await tiny.fetch(url)).text()).slice(0, 100000);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
    const desc = doc.querySelector('meta[name="description" i], meta[property="og:description" i]')?.content;
    return { title: clean(doc.title).slice(0, 40), description: clean(desc).slice(0, 300) };
  } catch { return { title: '', description: '' }; }
}
const isOpen = (t) => Object.values(open).includes(t.url);

function iconHtml(t) {
  const i = t.icon;
  const inner = !i ? `<img src="${esc(favicon(t.url))}" alt="">`
    : /^https?:\/\//i.test(i) ? `<img src="${esc(i)}" alt="">` : esc(i);
  return `<div class="plate">${inner}</div>`;
}

const HERO = `<div class="hero"><img src="logo.png" alt="">
  <h2>Welcome to ToolCuts</h2>
  <p>Keep all your favorite web tools in one board. Save any website as a shortcut, then click its box to open it in its own window.</p>
  <button id="heroAdd">${icon('plus')}Add your first tool</button></div>`;

function render() {
  const list = settings.view === 'list';
  $('grid').className = list ? 'list' : '';
  $('vGrid').setAttribute('aria-pressed', !list);
  $('vList').setAttribute('aria-pressed', list);
  if (!tools.length) { $('grid').innerHTML = HERO; return; }
  $('grid').innerHTML = tools.map((t, i) =>
    `<div class="item${isOpen(t) ? ' open' : ''}" data-i="${i}" tabindex="0" role="button" draggable="true" title="${esc(t.description || t.url)}">` +
    `${iconHtml(t)}<span class="text"><span class="name">${esc(t.name)}</span>` +
    `<span class="tdesc">${esc(t.description || '')}</span></span>`+ `<span class="host">${esc(new URL(t.url).host)}</span>` +
    `<span class="badge">Open</span>` +
    `<div class="ctl"><button class="copy" data-copy="${i}" title="Copy URL" aria-label="Copy URL of ${esc(t.name)}">${icon('copy')}</button>` +
    `<button class="cfg" data-cfg="${i}" title="Configure" aria-label="Configure ${esc(t.name)}">${icon('settings')}</button>` +
    `<button class="del" data-del="${i}" title="Remove" aria-label="Remove ${esc(t.name)}">${icon('x')}</button></div></div>`).join('');
}

async function openTool(t) {
  const id = 'tool-' + Date.now();
  await tiny.store.set('open:' + id, t.url);
  tiny.win.open(id, { page: 'tool.html', title: t.name, size: '1200x800' });
  open[id] = t.url;
  render();
}

async function removeTool(i) {
  const t = tools[i];
  if (settings.confirmDelete && !(await tiny.dialog.confirm(`Delete "${t.name}"?`))) return;
  tools.splice(i, 1); save(); render();
}

$('grid').onclick = (e) => {
  if (e.target.closest('#heroAdd')) return openAdd();
  const { del, cfg, copy } = e.target.closest('[data-del],[data-cfg],[data-copy]')?.dataset ?? {}; // click may land on the svg inside
  if (copy != null) {
    tiny.clipboard.write({ text: tools[+copy].url });
    const b = e.target.closest('.copy');
    b.innerHTML = icon('check'); b.title = 'Copied';
    return setTimeout(() => { b.innerHTML = icon('copy'); b.title = 'Copy URL'; }, 1200);
  }
  if (del != null) return removeTool(+del);
  if (cfg != null) {
    editing = tools[+cfg];
    $('cfgName').value = editing.name;
    $('cfgIcon').value = editing.icon || '';
    $('cfgUrl').value = editing.url;
    $('cfgDesc').value = editing.description || '';
    $('cfgErr').textContent = '';
    return $('cfgDlg').showModal();
  }
  const item = e.target.closest('.item');
  if (item) openTool(tools[+item.dataset.i]);
};

// Enter/Space on a focused item opens it (inner buttons keep their own behavior)
$('grid').onkeydown = (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('item')) {
    e.preventDefault(); openTool(tools[+e.target.dataset.i]);
  }
};

// drag to reorder
let dragFrom = null;
$('grid').ondragstart = (e) => { const it = e.target.closest('.item'); if (it) { dragFrom = +it.dataset.i; e.dataTransfer.effectAllowed = 'move'; } };
$('grid').ondragover = (e) => { if (dragFrom != null) { e.preventDefault(); } };
$('grid').ondrop = (e) => {
  const it = e.target.closest('.item');
  if (dragFrom == null || !it) return;
  e.preventDefault();
  tools.splice(+it.dataset.i, 0, tools.splice(dragFrom, 1)[0]);
  dragFrom = null; save(); render();
};
$('grid').ondragend = () => { dragFrom = null; };

// broken icon (offline / no favicon) -> default icon; error doesn't bubble, so capture
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG' && e.target.closest('.plate')) e.target.outerHTML = icon('link');
}, true);

// dialogs: Cancel closes without submitting
document.querySelectorAll('dialog .ghost').forEach((b) => b.onclick = () => b.closest('dialog').close());

// view toggle
$('vGrid').onclick = () => { settings.view = 'grid'; saveSettings(); render(); };
$('vList').onclick = () => { settings.view = 'list'; saveSettings(); render(); };

// settings
$('setBtn').onclick = () => { $('setConfirm').checked = settings.confirmDelete; $('setDlg').showModal(); };
$('setForm').onsubmit = () => { settings.confirmDelete = $('setConfirm').checked; saveSettings(); };

// add
const openAdd = () => { $('url').value = ''; $('addErr').textContent = ''; $('addDlg').showModal(); };
$('addBtn').onclick = openAdd;

$('addForm').onsubmit = async (e) => {
  e.preventDefault();
  const url = normalizeUrl($('url').value);
  if (!url) { $('addErr').textContent = 'Invalid URL'; return; }
  $('addOk').disabled = true; $('addOk').textContent = 'Adding…';
  const meta = await fetchMeta(url);
  $('addOk').disabled = false; $('addOk').textContent = 'Add';
  tools.push({ name: meta.title || new URL(url).hostname.replace(/^www\./, ''), url, description: meta.description });
  save(); render();
  $('addDlg').close();
};

// configure
$('cfgFetch').onclick = async () => {
  const url = normalizeUrl($('cfgUrl').value);
  if (!url) { $('cfgErr').textContent = 'Invalid URL'; return; }
  $('cfgFetch').disabled = true;
  const { description } = await fetchMeta(url);
  $('cfgFetch').disabled = false;
  $('cfgErr').textContent = description ? '' : 'No description found on that page.';
  if (description) $('cfgDesc').value = description;
};
$('cfgForm').onsubmit = (e) => {
  e.preventDefault();
  const url = normalizeUrl($('cfgUrl').value);
  if (!url) { $('cfgErr').textContent = 'Invalid URL'; return; }
  editing.name = $('cfgName').value.trim();
  editing.url = url;
  editing.description = $('cfgDesc').value.trim();
  editing.icon = $('cfgIcon').value.trim();
  save(); render();
  $('cfgDlg').close();
};

// search palette (⌘K / Ctrl+K)
function renderResults() {
  const q = $('q').value.trim().toLowerCase();
  results = tools.filter((t) => (t.name + ' ' + t.url).toLowerCase().includes(q));
  sel = Math.min(sel, Math.max(results.length - 1, 0));
  $('results').innerHTML = results.length
    ? results.map((t, i) => `<li data-r="${i}" class="${i === sel ? 'sel' : ''}">${iconHtml(t)}<span>${esc(t.name)}</span><small>${esc(new URL(t.url).host)}</small></li>`).join('')
    : `<li class="empty">No tools match "${esc($('q').value)}"</li>`;
}
function openPalette() { $('q').value = ''; sel = 0; renderResults(); $('palette').showModal(); }
function launchSelected() {
  const t = results[sel];
  if (!t) return;
  $('palette').close();
  openTool(t);
}
$('searchBtn').onclick = openPalette;
$('q').oninput = () => { sel = 0; renderResults(); };
$('q').onkeydown = (e) => {
  if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, results.length - 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); renderResults(); e.preventDefault(); }
  else if (e.key === 'Enter') { e.preventDefault(); launchSelected(); }
};
$('results').onclick = (e) => {
  const li = e.target.closest('li[data-r]');
  if (li) { sel = +li.dataset.r; launchSelected(); }
};

// shortcuts live in the native menu bar (⌘N / ⌘K): the webview never sees them as key events
tiny.menu.set([{ title: 'Tools', items: [
  { id: 'new', label: 'New tool…', key: 'n' },
  { id: 'search', label: 'Search tools…', key: 'k' },
] }]);
tiny.menu.on((id) => {
  if (document.querySelector('dialog[open]')) return; // don't stack dialogs
  if (id === 'new') openAdd();
  else if (id === 'search') openPalette();
});

tiny.api.on('tool-closed', (id) => { delete open[id]; tiny.store.delete('open:' + id); render(); });

(async () => {
  settings = { ...settings, ...(await tiny.store.get('settings')) };
  tools = (await tiny.store.get('tools')) || [];
  render();
})();

tiny.win.setTitle('ToolCuts'); // dev mode ignores tinyjs.json title; builds use it
