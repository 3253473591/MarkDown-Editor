/**
 * Function: DPI 缩放控制
 *   - 50%-200% 范围缩放，支持 Ctrl++/-/0 快捷键
 *   - 动态注入缩放控件和样式，持久化到 localStorage
 * Dependencies: 无
 */
'use strict';

const ZoomMgr = (() => {
  const LS_KEY = 'md_ui_zoom';
  const MIN = 50, MAX = 200, STEP = 10;
  let _zoom = 100;

  function _load() {
    const saved = parseInt(localStorage.getItem(LS_KEY));
    if (saved >= MIN && saved <= MAX) return saved;
    return (window.devicePixelRatio || 1) >= 2 ? 150 : 100;
  }

  function apply(z) {
    z = Math.max(MIN, Math.min(MAX, z));
    _zoom = z;
    const scale = z / 100;
    const app   = document.getElementById('app');
    if (!app) return;
    app.style.transformOrigin = 'top left';
    app.style.transform       = `scale(${scale})`;
    app.style.width           = `${(100 / scale).toFixed(4)}vw`;
    app.style.height          = `${(100 / scale).toFixed(4)}vh`;
    _updateUI();
    localStorage.setItem(LS_KEY, z);
  }

  function _updateUI() {
    const sel = document.getElementById('zoom-select');
    if (!sel) return;
    let opt = sel.querySelector(`option[value="${_zoom}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = _zoom;
      const after = [...sel.options].find(o => parseInt(o.value) > _zoom);
      after ? sel.insertBefore(opt, after) : sel.appendChild(opt);
    }
    opt.textContent = _zoom + '%';
    sel.value = _zoom;
  }

  function zoomIn()    { apply(_zoom + STEP); }
  function zoomOut()   { apply(_zoom - STEP); }
  function zoomReset() { apply(100); }
  function setZoom(z)  { apply(parseInt(z)); }
  function getZoom()   { return _zoom; }

  function init() {
    _zoom = _load();
    _buildControls();
    apply(_zoom);
    _bindKeys();
  }

  function _buildControls() {
    const right = document.querySelector('.toolbar-right');
    if (!right) return;
    const wrap = document.createElement('div');
    wrap.className = 'zoom-ctrl';
    wrap.innerHTML = `
      <button id="zoom-out"   title="缩小 (Ctrl+-)">－</button>
      <select id="zoom-select" title="缩放比例">
        ${[50,75,100,125,150,175,200].map(v => `<option value="${v}">${v}%</option>`).join('')}
      </select>
      <button id="zoom-in"    title="放大 (Ctrl+=)">＋</button>
      <button id="zoom-reset" title="重置 (Ctrl+0)" style="font-size:11px;padding:3px 7px;">⟳</button>
    `;
    right.insertBefore(wrap, right.firstChild);
    document.getElementById('zoom-out')   .addEventListener('click', zoomOut);
    document.getElementById('zoom-in')    .addEventListener('click', zoomIn);
    document.getElementById('zoom-reset') .addEventListener('click', zoomReset);
    document.getElementById('zoom-select').addEventListener('change', e => setZoom(e.target.value));
    _updateUI();

    const style = document.createElement('style');
    style.textContent = `
      .zoom-ctrl { display:flex; align-items:center; gap:3px; padding:0 6px;
        border-right:1px solid rgba(255,255,255,0.12); margin-right:4px; }
      .zoom-ctrl button { padding:3px 8px; font-size:14px; min-width:26px; }
      #zoom-select { padding:3px 4px; background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,0.12); border-radius:6px;
        color:var(--text); font-size:12px; cursor:pointer; width:62px; }
      #zoom-select:focus { outline:none; border-color:var(--accent); }
      #zoom-select option { background:#1e2028; color:#e0e2ea; }
    `;
    document.head.appendChild(style);
  }

  function _bindKeys() {
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn();    return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut();   return; }
      if (e.key === '0')                  { e.preventDefault(); zoomReset(); return; }
    }, true);
  }

  return { init, apply, zoomIn, zoomOut, zoomReset, setZoom, getZoom };
})();

window.ZoomMgr = ZoomMgr;