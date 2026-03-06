/**
 * Function: 导出/导入相关对话框 UI
 *   - askTxtMode：TXT 导出模式选择（保留符号 / 纯文本）
 *   - askImportMode：导入模式选择（追加 / 覆盖）
 * Dependencies: 无
 */
'use strict';

const ExportDialogs = (() => {

  function _makeModal(id, html) {
    let m = document.getElementById(id);
    if (!m) {
      m = document.createElement('div');
      m.id = id;
      m.className = 'modal hidden';
      m.innerHTML = html;
      document.body.appendChild(m);
    }
    return m;
  }

  function askTxtMode() {
    return new Promise(resolve => {
      const modal = _makeModal('modal-txt-mode', `
        <div class="modal-box" style="max-width:360px">
          <h3 style="margin:0 0 8px;font-size:15px;">导出 TXT</h3>
          <p style="margin:0 0 20px;color:var(--text-dim);font-size:13px;line-height:1.6;">
            <strong>保留符号</strong>：保留 <code>#</code> <code>**</code> 等 Markdown 标记。<br><br>
            <strong>纯文本</strong>：去除所有 Markdown 符号，输出干净的纯文本。
          </p>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button id="txt-mode-cancel" class="btn-secondary">取消</button>
            <button id="txt-mode-strip"  class="btn-secondary">纯文本</button>
            <button id="txt-mode-keep"   class="btn-primary">保留符号</button>
          </div>
        </div>`);

      modal.classList.remove('hidden');
      function cleanup(result) {
        modal.classList.add('hidden');
        ['txt-mode-cancel','txt-mode-strip','txt-mode-keep'].forEach(id => {
          const el = document.getElementById(id); if (el) el.onclick = null;
        });
        resolve(result);
      }
      document.getElementById('txt-mode-cancel').onclick = () => cleanup(null);
      document.getElementById('txt-mode-strip') .onclick = () => cleanup('strip');
      document.getElementById('txt-mode-keep')  .onclick = () => cleanup('keep');
    });
  }

  function askImportMode(fname) {
    return new Promise(resolve => {
      const modal = _makeModal('modal-import-mode', `
        <div class="modal-box" style="max-width:360px">
          <h3 id="import-mode-title" style="margin:0 0 8px;font-size:15px;"></h3>
          <p  id="import-mode-desc"  style="margin:0 0 20px;color:var(--text-dim);font-size:13px;line-height:1.6;"></p>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button id="import-mode-cancel"    class="btn-secondary">取消</button>
            <button id="import-mode-append"    class="btn-secondary">追加节点</button>
            <button id="import-mode-overwrite" class="btn-danger">覆盖全部</button>
          </div>
        </div>`);

      document.getElementById('import-mode-title').textContent = `导入文件：${fname}`;
      document.getElementById('import-mode-desc').innerHTML =
        '<strong>追加节点</strong>：将导入内容作为新节点追加到现有树的末尾，原内容保留。<br><br>' +
        '<strong>覆盖全部</strong>：清空当前所有节点，用导入内容替换，<strong>原内容将丢失</strong>。';
      modal.classList.remove('hidden');

      function cleanup(result) {
        modal.classList.add('hidden');
        ['import-mode-cancel','import-mode-append','import-mode-overwrite'].forEach(id => {
          const el = document.getElementById(id); if (el) el.onclick = null;
        });
        resolve(result);
      }
      document.getElementById('import-mode-cancel')   .onclick = () => cleanup(null);
      document.getElementById('import-mode-append')   .onclick = () => cleanup('append');
      document.getElementById('import-mode-overwrite').onclick = () => cleanup('overwrite');
    });
  }

  return { askTxtMode, askImportMode };
})();

window.ExportDialogs = ExportDialogs;