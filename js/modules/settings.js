/**
 * Function: 设置面板
 *   - 打开/关闭设置 Modal
 *   - 代理清除背景、打开存储清理
 * Dependencies: background.js, cleanup.js
 */
'use strict';

const SettingsMgr = (() => {
  function init() {
    document.getElementById('btn-settings').addEventListener('click', () =>
      document.getElementById('modal-settings').classList.remove('hidden'));

    document.getElementById('settings-close').addEventListener('click', () =>
      document.getElementById('modal-settings').classList.add('hidden'));

    document.getElementById('btn-storage-cleanup').addEventListener('click', () => {
      document.getElementById('modal-settings').classList.add('hidden');
      CleanupMgr.open(false);
    });

    document.getElementById('btn-clear-bg').addEventListener('click', () =>
      BackgroundMgr.clear());
  }

  return { init };
})();

window.SettingsMgr = SettingsMgr;