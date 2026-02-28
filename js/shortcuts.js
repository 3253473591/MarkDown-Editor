/**
 * Function (功能): 
 *   - 全局键盘快捷键监听与分发：Ctrl+S/P/Z/1/2/3、方向键导航、Ins/Del/Esc
 *   - 协调各模块的 Undo 优先级（编辑器内容 Undo 优先于树结构 Undo）
 * Dependencies (依赖): 
 *   - tree.js (TreeMgr, 节点操作与导航)
 *   - editor.js (EditorMgr, 保存、添加兄弟节点、内容 Undo/Redo)
 *   - search.js (SearchMgr, 打开搜索)
 */

'use strict';

function initShortcuts() {
  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;
    const inEditor = document.activeElement === document.getElementById('editor');

    // Ctrl+Z → undo (content or tree)
    if (ctrl && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      // If focused in editor, try content undo first
      if (window.EditorMgr && EditorMgr.contentUndo()) return;
      window.TreeMgr && TreeMgr.undo();
      return;
    }
    // Ctrl+Shift+Z → redo (content or tree)
    if (ctrl && e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
      e.preventDefault();
      if (inEditor && window.EditorMgr && EditorMgr.contentRedo()) return;
      window.TreeMgr && TreeMgr.redo();
      return;
    }

    // Ctrl+S → immediate save
    if (ctrl && e.key === 's') {
      e.preventDefault();
      window.EditorMgr && EditorMgr.saveImmediately();
      return;
    }
    // Ctrl+P → search
    if (ctrl && e.key === 'p') {
      e.preventDefault();
      window.SearchMgr && SearchMgr.open();
      return;
    }
    // Ctrl+/ → shortcuts list
    if (ctrl && e.key === '/') {
      e.preventDefault();
      document.getElementById('modal-shortcuts').classList.remove('hidden');
      return;
    }
    // Ctrl+1 → 新建根节点
    if (ctrl && e.key === '1') {
      e.preventDefault();
      window.TreeMgr && TreeMgr.addNode(null);
      return;
    }
    // Ctrl+2 → 添加子节点
    if (ctrl && e.key === '2') {
      e.preventDefault();
      const id = window.TreeMgr && TreeMgr.activeId;
      if (id) window.TreeMgr.addNode(id);
      return;
    }
    // Ctrl+3 → 添加同级节点
    if (ctrl && e.key === '3') {
      e.preventDefault();
      window.EditorMgr && EditorMgr.addSiblingNode();
      return;
    }

    // Arrow keys → tree navigation (only if textarea/input NOT focused)
    if (!['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName)) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); window.TreeMgr && TreeMgr.navigateTree('up');   return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); window.TreeMgr && TreeMgr.navigateTree('down'); return; }
    }
    // Ins → new root node
    if (e.key === 'Insert') {
      e.preventDefault();
      window.TreeMgr && TreeMgr.addNode(null);
      return;
    }
    // Escape → close modals
    if (e.key === 'Escape') {
      ['modal-table', 'modal-search', 'modal-shortcuts', 'modal-cleanup', 'modal-settings']
        .forEach(id => document.getElementById(id).classList.add('hidden'));
    }
    // Delete → delete active node (only when not in textarea/input)
    if (e.key === 'Delete' && !['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      const activeId = window.TreeMgr && TreeMgr.activeId;
      if (activeId && confirm('确定删除此节点？')) {
        window.TreeMgr.deleteNode(activeId);
      }
      return;
    }
  });

  // Shortcuts modal close
  document.getElementById('shortcuts-close').addEventListener('click', () =>
    document.getElementById('modal-shortcuts').classList.add('hidden'));
  document.getElementById('btn-shortcuts').addEventListener('click', () =>
    document.getElementById('modal-shortcuts').classList.remove('hidden'));
}

window.ShortcutsMgr = { initShortcuts };