/**
 * Function: 全局键盘快捷键
 *   - Ctrl+S/P/Z/1/2/3、方向键、Ins/Del/Esc
 *   - Ctrl+↑/↓ 同级节点上下移动
 *   - 编辑器内容 Undo 优先于树结构 Undo
 * Dependencies: tree.js, editor.js, search.js
 */
'use strict';

function initShortcuts() {
  document.addEventListener('keydown', e => {
    const ctrl     = e.ctrlKey || e.metaKey;
    const inEditor = document.activeElement === document.getElementById('editor');
    const inInput  = ['TEXTAREA','INPUT'].includes(document.activeElement.tagName);

    if (ctrl && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      if (window.EditorMgr && EditorMgr.contentUndo()) return;
      window.TreeMgr && TreeMgr.undo();
      return;
    }
    if (ctrl && e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
      e.preventDefault();
      if (inEditor && window.EditorMgr && EditorMgr.contentRedo()) return;
      window.TreeMgr && TreeMgr.redo();
      return;
    }

    if (ctrl && e.key === 'ArrowUp') {
      e.preventDefault();
      const id = window.TreeMgr?.activeId;
      if (id) TreeMgr.moveNodeUp(id);
      return;
    }
    if (ctrl && e.key === 'ArrowDown') {
      e.preventDefault();
      const id = window.TreeMgr?.activeId;
      if (id) TreeMgr.moveNodeDown(id);
      return;
    }

    if (ctrl && e.key === 's') { e.preventDefault(); window.EditorMgr && EditorMgr.saveImmediately(); return; }
    if (ctrl && e.key === 'p') { e.preventDefault(); window.SearchMgr && SearchMgr.open();           return; }
    if (ctrl && e.key === '/') {
      e.preventDefault();
      document.getElementById('modal-shortcuts').classList.remove('hidden');
      return;
    }
    if (ctrl && e.key === '1') { e.preventDefault(); window.TreeMgr && TreeMgr.addNode(null);          return; }
    if (ctrl && e.key === '2') { e.preventDefault(); const id = TreeMgr?.activeId; if (id) TreeMgr.addNode(id); return; }
    if (ctrl && e.key === '3') { e.preventDefault(); window.EditorMgr && EditorMgr.addSiblingNode();   return; }

    if (!inInput) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); window.TreeMgr && TreeMgr.navigateTree('up');   return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); window.TreeMgr && TreeMgr.navigateTree('down'); return; }
    }

    if (e.key === 'Insert') { e.preventDefault(); window.TreeMgr && TreeMgr.addNode(null); return; }

    if (e.key === 'Escape') {
      ['modal-table','modal-search','modal-shortcuts','modal-cleanup','modal-settings']
        .forEach(id => document.getElementById(id)?.classList.add('hidden'));
    }

    if (e.key === 'Delete' && !inInput) {
      e.preventDefault();
      const activeId = window.TreeMgr?.activeId;
      if (activeId && confirm('确定删除此节点？')) TreeMgr.deleteNode(activeId);
    }
  });

  document.getElementById('shortcuts-close').addEventListener('click', () =>
    document.getElementById('modal-shortcuts').classList.add('hidden'));
  document.getElementById('btn-shortcuts').addEventListener('click', () =>
    document.getElementById('modal-shortcuts').classList.remove('hidden'));
}

window.ShortcutsMgr = { initShortcuts };