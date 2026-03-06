/**
 * Function: 存储清理管理器
 *   - 孤立节点检测与清理
 *   - 旧备份清理
 *   - 强制清理（超过 10MB 阈值时触发）
 * Dependencies: storage.js, tree.js, editor.js
 */
'use strict';

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

    const liveIds   = TreeMgr.allIds();
    const backups   = await StorageMgr.listBackups();
    const keepN     = parseInt(document.getElementById('cleanup-keep').value) || 5;
    const orphanEst = await _estimateOrphans(liveIds);
    const backupEst = backups.slice(keepN).reduce((s,b) => s + StorageMgr.strBytes(JSON.stringify(b)), 0);

    prev.innerHTML = `
      <p>• 孤立节点数据: 约 ${(orphanEst/1024).toFixed(1)} KB</p>
      <p>• 旧备份 (${Math.max(0, backups.length - keepN)} 条): 约 ${(backupEst/1024).toFixed(1)} KB</p>
      <p><strong>预计释放: ${((orphanEst + backupEst)/1024/1024).toFixed(2)} MB</strong></p>
    `;
    modal.classList.remove('hidden');
  }

  async function _estimateOrphans(liveIds) {
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
    close();
    EditorMgr.showMsg(`✅ 已释放 ${((freed1+freed2)/1024/1024).toFixed(2)} MB`);
    await EditorMgr.checkQuota();
  }

  function close() {
    if (_forced) {
      StorageMgr.checkQuota().then(({ critical }) => {
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
      document.getElementById('modal-cleanup').classList.add('hidden');
    });
    document.getElementById('cleanup-keep').addEventListener('change', () => open(_forced));
  }

  return { init, open, close, forceOpen };
})();

window.CleanupMgr = CleanupMgr;