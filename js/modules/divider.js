/**
 * Function: 可拖动分割线管理
 *   - 树面板 ↔ 编辑器面板分割线（20%-80%限制）
 *   - 编辑区 ↔ 预览区分割线（15%-85%限制）
 * Dependencies: 无
 */
'use strict';

const DividerMgr = (() => {

  /** 树面板 ↔ 编辑器面板 */
  function initMainDivider() {
    const divider   = document.getElementById('divider');
    const treePanel = document.getElementById('tree-panel');
    const bodyWrap  = document.querySelector('.body-wrap');
    let dragging = false, startX, startW;

    divider.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startW = treePanel.offsetWidth;
      divider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const total = bodyWrap.offsetWidth;
      let newW = Math.max(total * 0.20, Math.min(total * 0.80, startW + (e.clientX - startX)));
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

  /** 编辑区 ↔ 预览区 */
  function initEditorPreviewDivider(textarea, preview) {
    const divider = document.querySelector('.editor-preview-divider');
    const edWrap  = document.querySelector('.editor-wrap');
    let dragging = false, startX, startLeftW;

    divider.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true; startX = e.clientX;
      startLeftW = textarea.getBoundingClientRect().width;
      divider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const totalW = edWrap.offsetWidth - 5;
      let newW = Math.max(totalW * 0.15, Math.min(totalW * 0.85, startLeftW + (e.clientX - startX)));
      textarea.style.flex  = 'none';
      textarea.style.width = newW + 'px';
      preview.style.flex   = '1';
      preview.style.width  = '';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      divider.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  return { initMainDivider, initEditorPreviewDivider };
})();

window.DividerMgr = DividerMgr;