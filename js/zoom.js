/**
 * Function (功能): 
 *   - 实现类似 Word 的 DPI 缩放功能（50%-200%），支持 Ctrl++/-/-/0 快捷键
 *   - 动态创建缩放控件并注入样式，持久化缩放比例到 localStorage
 * Dependencies (依赖): 无（独立模块，纯 DOM 操作）
 * Bug Fix Guide (Bug 修复提示):
 *   若缩放按钮不显示、快捷键失效、缩放后布局错乱，
 *   仅需上传此文件给 LLM（自包含样式，无外部 CSS/JS 依赖）。
 */

'use strict';

const ZoomMgr = (() => {
  const LS_KEY   = 'md_ui_zoom';
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 200;
  const STEP     = 10;

  let _zoom = 100; // percent

  /* ── 读取/保存 ── */
  function load() {
    const saved = parseInt(localStorage.getItem(LS_KEY));
    if (saved >= MIN_ZOOM && saved <= MAX_ZOOM) return saved;
    // 自动检测：高 DPI 屏默认 150%
    const dpr = window.devicePixelRatio || 1;
    return dpr >= 2 ? 150 : 100;
  }

  function save(z) {
    localStorage.setItem(LS_KEY, z);
  }

  /* ── 应用缩放 ── */
  function apply(z) {
    z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    _zoom = z;
    const scale = z / 100;
    const app   = document.getElementById('app');
    if (!app) return;

    // 使用 transform-origin top-left + scale 缩放整个 app
    // 同时调整容器尺寸，保证滚动和布局正确
    app.style.transformOrigin = 'top left';
    app.style.transform       = `scale(${scale})`;
    app.style.width           = `${(100 / scale).toFixed(4)}vw`;
    app.style.height          = `${(100 / scale).toFixed(4)}vh`;

    _updateUI();
    save(z);
  }

  /* ── 更新 UI 显示 ── */
  function _updateUI() {
    const sel = document.getElementById('zoom-select');
    if (!sel) return;
    // 若当前值不在预设列表中，动态插入（避免显示空白）
    let opt = sel.querySelector(`option[value="${_zoom}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = _zoom;
      // 按数值顺序插入
      const opts = [...sel.options];
      const after = opts.find(o => parseInt(o.value) > _zoom);
      after ? sel.insertBefore(opt, after) : sel.appendChild(opt);
    }
    opt.textContent = _zoom + '%';
    sel.value = _zoom;
  }

  /* ── 公共方法 ── */
  function zoomIn()    { apply(_zoom + STEP); }
  function zoomOut()   { apply(_zoom - STEP); }
  function zoomReset() { apply(100); }
  function setZoom(z)  { apply(parseInt(z)); }
  function getZoom()   { return _zoom; }

  /* ── 初始化 ── */
  function init() {
    _zoom = load();
    _buildControls();
    apply(_zoom);
    _bindKeys();
  }

  /* ── 构建工具栏控件 ── */
  function _buildControls() {
    // 插入到 toolbar-right 最左侧
    const right = document.querySelector('.toolbar-right');
    if (!right) return;

    const wrap = document.createElement('div');
    wrap.className = 'zoom-ctrl';
    wrap.innerHTML = `
      <button id="zoom-out"  title="缩小 (Ctrl+-)">－</button>
      <select id="zoom-select" title="缩放比例">
        ${[50,75,100,125,150,175,200].map(v =>
          `<option value="${v}">${v}%</option>`
        ).join('')}
      </select>
      <button id="zoom-in"    title="放大 (Ctrl+=)">＋</button>
      <button id="zoom-reset" title="重置 (Ctrl+0)" style="font-size:11px;padding:3px 7px;">⟳</button>
    `;

    // 插入到 toolbar-right 第一个子元素之前
    right.insertBefore(wrap, right.firstChild);

    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-reset').addEventListener('click', zoomReset);
    document.getElementById('zoom-select').addEventListener('change', e => setZoom(e.target.value));

    _updateUI();

    // 样式注入
    const style = document.createElement('style');
    style.textContent = `
      .zoom-ctrl {
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 0 6px;
        border-right: 1px solid rgba(255,255,255,0.12);
        margin-right: 4px;
      }
      .zoom-ctrl button {
        padding: 3px 8px;
        font-size: 14px;
        min-width: 26px;
      }
      #zoom-select {
        padding: 3px 4px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        color: var(--text);
        font-size: 12px;
        cursor: pointer;
        width: 62px;
      }
      #zoom-select:focus { outline: none; border-color: var(--accent); }
      #zoom-select option { background: #1e2028; color: #e0e2ea; }
    `;
    document.head.appendChild(style);
  }

  /* ── 键盘快捷键 ── */
  function _bindKeys() {
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn();    return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut();   return; }
      if (e.key === '0')                  { e.preventDefault(); zoomReset(); return; }
    }, true); // capture 阶段，优先于其他监听器
  }

  return { init, apply, zoomIn, zoomOut, zoomReset, setZoom, getZoom };
})();

window.ZoomMgr = ZoomMgr;