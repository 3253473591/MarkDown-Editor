/**
 * Function: 导出/导入模块入口
 *   - 绑定导出下拉菜单、导入文件选择
 *   - 协调 Exporters、Importers、ExportDialogs
 * Dependencies: exporters.js, importers.js, dialogs.js, editor.js
 */
'use strict';

const ExportMgr = (() => {

  function initExport() {
    const toggle = document.getElementById('btn-export-toggle');
    const menu   = document.getElementById('export-menu');

    toggle.addEventListener('click', () => menu.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!toggle.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('open');
    });

    menu.addEventListener('click', async e => {
      const fmt = e.target.dataset.fmt;
      if (!fmt) return;
      menu.classList.remove('open');
      switch (fmt) {
        case 'json':  await Exporters.exportJSON();  break;
        case 'md':    await Exporters.exportMD();    break;
        case 'yaml':  await Exporters.exportYAML();  break;
        case 'xml':   await Exporters.exportXML();   break;
        case 'word':  await Exporters.exportWord();  break;
        case 'txt': {
          const mode = await ExportDialogs.askTxtMode();
          if (mode) await Exporters.exportTXT(mode === 'keep');
          break;
        }
      }
    });

    document.getElementById('btn-import').addEventListener('click', () =>
      document.getElementById('import-file').click());

    document.getElementById('import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const mode = await ExportDialogs.askImportMode(file.name);
      if (!mode) { e.target.value = ''; return; }
      const text = await file.text();
      if (file.name.endsWith('.json')) await Importers.importJSON(text, mode);
      else await Importers.importMD(text, mode);
      e.target.value = '';
    });
  }

  return { initExport };
})();

window.ExportMgr = ExportMgr;