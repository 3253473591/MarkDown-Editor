/**
 * Function (功能): 
 *   - 应用启动器（Bootstrap）：初始化顺序控制、Skeleton 切换
 *   - 全局事件绑定：背景图上传、透明度调节、设置面板、存储清理对话框
 *   - 树/编辑器分割拖动逻辑（divider drag）
 *   - CleanupMgr 强制清理逻辑（存储超限处理）
 * Dependencies (依赖): 
 *   - 所有其他 JS 模块（storage, tree, editor, search, export, shortcuts, zoom, tutorial）
 *   - 所有 CSS 文件
 * Bug Fix Guide (Bug 修复提示):
 *   若应用无法启动、白屏、背景图不显示、分割线无法拖动、清理对话框异常，
 *   需上传：此文件 + 出错的特定功能模块（如 tree.js 或 editor.js）。
 *   若为启动顺序问题，需同时上传所有 JS 文件。
 */

'use strict';

/* ── Cleanup Manager ── */
const CleanupMgr = (() => {
  let _forced = false;

  async function open(forced = false) {
    _forced = forced;
    const modal = document.getElementById('modal-cleanup');
    const desc  = document.getElementById('cleanup-desc');
    const prev  = document.getElementById('cleanup-preview');

    const idbSz = await StorageMgr.idbSize();
    desc.textContent = forced
      ? `IndexedDB 已使用 ${(idbSz/1024/1024).toFixed(2)} MB，超过 10MB 阈值，必须清理后继续。`
      : `IndexedDB 当前使用 ${(idbSz/1024/1024).toFixed(2)} MB。`;

    const liveIds    = TreeMgr.allIds();
    const backups    = await StorageMgr.listBackups();
    const keepN      = parseInt(document.getElementById('cleanup-keep').value) || 5;
    const orphanEst  = await estimateOrphans(liveIds);
    const backupEst  = backups.slice(keepN).reduce((s,b) => s + StorageMgr.strBytes(JSON.stringify(b)), 0);

    prev.innerHTML = `
      <p>• 孤立节点数据: 约 ${(orphanEst/1024).toFixed(1)} KB</p>
      <p>• 旧备份 (${Math.max(0, backups.length - keepN)} 条): 约 ${(backupEst/1024).toFixed(1)} KB</p>
      <p><strong>预计释放: ${((orphanEst + backupEst)/1024/1024).toFixed(2)} MB</strong></p>
    `;
    modal.classList.remove('hidden');
  }

  async function estimateOrphans(liveIds) {
    // check IDB nodes not in liveIds
    const all = await (async () => {
      try { return await StorageMgr.idbGetAll ? StorageMgr.idbGetAll(STORE_NODES) : []; }
      catch { return []; }
    })();
    // fallback: iterate localStorage
    let sz = 0;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('nd_') && !liveIds.has(k.slice(3))) {
        sz += StorageMgr.strBytes(localStorage[k]);
      }
    }
    return sz;
  }

  async function execute() {
    const liveIds = TreeMgr.allIds();
    const keep    = parseInt(document.getElementById('cleanup-keep').value) || 5;
    const freed1  = await StorageMgr.cleanOrphanNodes(liveIds);
    const freed2  = await StorageMgr.cleanOldBackups(keep);
    const total   = freed1 + freed2;
    close();
    EditorMgr.showMsg(`✅ 已释放 ${(total/1024/1024).toFixed(2)} MB`);
    await EditorMgr.checkQuota();
  }

  function close() {
    if (_forced) {
      // Re-check if still critical
      StorageMgr.checkQuota().then(({critical}) => {
        if (!critical) document.getElementById('modal-cleanup').classList.add('hidden');
      });
    } else {
      document.getElementById('modal-cleanup').classList.add('hidden');
    }
  }

  function forceOpen(size) { open(true); }

  function init() {
    document.getElementById('cleanup-confirm').addEventListener('click', execute);
    document.getElementById('cleanup-cancel').addEventListener('click', () => {
      if (!_forced) close();
      // if forced, cancel just closes (user must re-open app or reduce storage elsewhere)
      document.getElementById('modal-cleanup').classList.add('hidden');
    });
    document.getElementById('cleanup-keep').addEventListener('change', () => open(_forced));
  }

  return { init, open, close, forceOpen };
})();

/* ── Settings ── */
function initSettings() {
  document.getElementById('btn-settings').addEventListener('click', () =>
    document.getElementById('modal-settings').classList.remove('hidden'));
  document.getElementById('settings-close').addEventListener('click', () =>
    document.getElementById('modal-settings').classList.add('hidden'));
  document.getElementById('btn-storage-cleanup').addEventListener('click', () => {
    document.getElementById('modal-settings').classList.add('hidden');
    CleanupMgr.open(false);
  });
  document.getElementById('btn-clear-bg').addEventListener('click', async () => {
    await StorageMgr.clearBg();
    document.body.style.setProperty('--bg-image', 'none');
    EditorMgr.showMsg('背景已清除');
  });
}

/* ── Background Upload ── */
function initBackground() {
  document.getElementById('btn-bg-upload').addEventListener('click', () =>
    document.getElementById('bg-file').click());

  document.getElementById('bg-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    await StorageMgr.saveBg(blob);
    applyBg(blob);
    e.target.value = '';
    EditorMgr.showMsg('背景已更新');
  });

  document.getElementById('bg-opacity').addEventListener('input', e => {
    document.documentElement.style.setProperty('--bg-opacity', e.target.value);
  });
}

function applyBg(blob) {
  const url = URL.createObjectURL(blob);
  document.body.style.setProperty('--bg-image', `url("${url}")`);
}

/* ── Divider Drag (E3) 20%-80% ── */
function initDivider() {
  const divider    = document.getElementById('divider');
  const treePanel  = document.getElementById('tree-panel');
  const bodyWrap   = document.querySelector('.body-wrap');
  let dragging = false, startX, startW;

  divider.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = treePanel.offsetWidth;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const total = bodyWrap.offsetWidth;
    let newW = startW + (e.clientX - startX);
    const minW = total * 0.20;
    const maxW = total * 0.80;
    newW = Math.max(minW, Math.min(maxW, newW));
    treePanel.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

/* ── Bootstrap ── */
async function bootstrap() {
  // Show skeleton, hide app
  const skeleton = document.getElementById('skeleton');
  const app      = document.getElementById('app');

  // Init storage & load data
  await TreeMgr.loadMeta();

  // Init subsystems
  EditorMgr.init();
  SearchMgr.init();
  ExportMgr.initExport();
  CleanupMgr.init();
  initSettings();
  initBackground();
  initDivider();
  ShortcutsMgr.initShortcuts();

  // Render tree
  TreeMgr.renderTree();

  // Load active node
  if (TreeMgr.activeId) {
    await EditorMgr.loadNode(TreeMgr.activeId);
  } else {
    const nodes = TreeMgr.allNodes();
    if (nodes.length) await EditorMgr.loadNode(nodes[0].id);
  }

  // Load saved background
  const bg = await StorageMgr.loadBg();
  if (bg) applyBg(bg);

  // Restore opacity
  const savedOpacity = parseFloat(document.getElementById('bg-opacity').value);
  document.documentElement.style.setProperty('--bg-opacity', savedOpacity);

  // Check quota on load
  await EditorMgr.checkQuota();

  // New root node button
  document.getElementById('btn-new-node').addEventListener('click', () => TreeMgr.addNode(null));

  // Hide skeleton → show app
  skeleton.style.display = 'none';
  app.classList.remove('hidden');

  ZoomMgr.init();
  TutorialMgr.init();
}

window.CleanupMgr = CleanupMgr;
document.addEventListener('DOMContentLoaded', bootstrap);
