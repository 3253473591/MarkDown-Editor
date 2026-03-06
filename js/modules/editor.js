/**
 * Function: 编辑器核心
 *   - 节点加载/保存（防抖 300ms）、Meta 标签/注释同步
 *   - 内容 Undo/Redo（100步）
 *   - Tab 缩进/反缩进
 *   - 代码文件拖入自动建节点
 *   - 状态消息显示、配额检查
 *   - 光标呼吸动画、聚焦模式
 * Dependencies: core/utils.js, storage.js, tree.js,
 *               stats.js, preview.js, toolbar.js, divider.js
 */
'use strict';

const EditorMgr = (() => {
  const { debounce } = Utils;

  let _currentId = null;
  let _dirty     = false;
  let _textarea, _preview, _metaLabel, _metaComment;
  
  // 【新增】光标呼吸动画相关
  let _typingTimeout = null;
  let _isEditorFocused = false;

  /* ── Content Undo/Redo ── */
  const UNDO_MAX = 100;
  let _undoStack = [], _redoStack = [];
  let _undoInProgress = false;

  function pushContentUndo(id, value) {
    if (_undoInProgress) return;
    const top = _undoStack[_undoStack.length - 1];
    if (top && top.id === id && top.value === value) return;
    _undoStack.push({ id, value });
    if (_undoStack.length > UNDO_MAX) _undoStack.shift();
    _redoStack = [];
  }

  function contentUndo() {
    if (!_undoStack.length) return false;
    const top = _undoStack[_undoStack.length - 1];
    if (top.id !== _currentId) return false;
    _redoStack.push({ id: _currentId, value: _textarea.value });
    _undoStack.pop();
    _undoInProgress = true;
    _textarea.value = top.value;
    _undoInProgress = false;
    _dirty = true;
    debouncedSave();
    _onContentChange();
    return true;
  }

  function contentRedo() {
    if (!_contentRedoStack().length) return false;
    const top = _redoStack[_redoStack.length - 1];
    if (top.id !== _currentId) return false;
    _undoStack.push({ id: _currentId, value: _textarea.value });
    _redoStack.pop();
    _undoInProgress = true;
    _textarea.value = top.value;
    _undoInProgress = false;
    _dirty = true;
    debouncedSave();
    _onContentChange();
    return true;
  }
  function _contentRedoStack() { return _redoStack; }

  /* ── Debounced actions ── */
  const debouncedSave    = debounce(saveCurrentNode, 300);
  const debouncedPreview = debounce(() => PreviewMgr.render(), 150);

  function _onContentChange() {
    StatsMgr.update(_currentId, _textarea.value);
    debouncedPreview();
  }

  /* ── 【新增】光标呼吸动画 ── */
  function _initCursorBreathe() {
    // 输入时停止呼吸动画
    _textarea.addEventListener('input', () => {
      clearTimeout(_typingTimeout);
      _textarea.classList.remove('cursor-breathe');
      
      // 停止输入 2 秒后启动呼吸动画
      _typingTimeout = setTimeout(() => {
        if (_isEditorFocused && document.activeElement === _textarea) {
          _textarea.classList.add('cursor-breathe');
        }
      }, 2000);
    });
    
    // 聚焦/失焦状态
    _textarea.addEventListener('focus', () => {
      _isEditorFocused = true;
    });
    
    _textarea.addEventListener('blur', () => {
      _isEditorFocused = false;
      _textarea.classList.remove('cursor-breathe');
      clearTimeout(_typingTimeout);
    });
  }

  /* ── Init ── */
  function init() {
    _textarea    = document.getElementById('editor');
    _preview     = document.getElementById('preview');
    _metaLabel   = document.getElementById('meta-label');
    _metaComment = document.getElementById('meta-comment');

    PreviewMgr.init(_textarea, _preview);
    DividerMgr.initEditorPreviewDivider(_textarea, _preview);
    ToolbarMgr.init(_textarea, pushContentUndo, () => _currentId);
    
    // 【新增】光标呼吸动画
    _initCursorBreathe();

    /* 记录 undo 快照 */
    _textarea.addEventListener('keydown', e => {
      if (_undoInProgress) return;
      const isCut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x';
      if (isCut || (!e.ctrlKey && !e.metaKey && e.key.length === 1) || e.key === 'Backspace' || e.key === 'Delete') {
        pushContentUndo(_currentId, _textarea.value);
      }
    });

    /* 内容变更 */
    _textarea.addEventListener('input', () => {
      if (_undoInProgress) return;
      _dirty = true;
      debouncedSave();
      _onContentChange();
    });

    /* Tab 缩进 */
    _textarea.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end, value: v } = _textarea;
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      const line      = v.substring(lineStart, end);
      if (!e.shiftKey) {
        const indented = v.substring(lineStart, end).replace(/^/gm, '  ');
        _textarea.value = v.substring(0, lineStart) + indented + v.substring(end);
        _textarea.selectionStart = s + 2;
        _textarea.selectionEnd   = end + (indented.length - line.length);
      } else {
        const dedented = v.substring(lineStart, end).replace(/^ {1,2}/gm, '');
        _textarea.value = v.substring(0, lineStart) + dedented + v.substring(end);
        _textarea.selectionStart = Math.max(lineStart, s - 2);
        _textarea.selectionEnd   = lineStart + dedented.length;
      }
      _textarea.dispatchEvent(new Event('input'));
    });

    /* Meta 标签 */
    _metaLabel.addEventListener('input', () => {
      const n = TreeMgr.findNode(_currentId);
      if (!n) return;
      n.label = _metaLabel.value;
      const el = document.querySelector(`.tree-node[data-id="${_currentId}"] .tree-label`);
      if (el) el.textContent = n.label || '(无标签)';
      TreeMgr.persistMeta();
      StatsMgr.update(_currentId, _textarea.value);
    });

    /* Meta 注释 */
    _metaComment.addEventListener('input', () => {
      const n = TreeMgr.findNode(_currentId);
      if (!n) return;
      n.comment = _metaComment.value;
      const row = document.querySelector(`.tree-node[data-id="${_currentId}"] .tree-node-row`);
      if (row) {
        let cmtEl = row.querySelector('.tree-comment');
        if (n.comment) {
          if (!cmtEl) {
            cmtEl = document.createElement('span');
            cmtEl.className = 'tree-comment';
            row.insertBefore(cmtEl, row.querySelector('.tree-vis-btn'));
          }
          cmtEl.textContent = n.comment;
        } else if (cmtEl) { cmtEl.remove(); }
      }
      TreeMgr.persistMeta();
      StatsMgr.update(_currentId, _textarea.value);
    });

    /* 全篇预览 */
    document.getElementById('btn-full-preview').addEventListener('click', () =>
      PreviewMgr.openFull(_currentId, _textarea.value, _dirty, saveCurrentNode));

    /* 节点操作按钮 */
    document.getElementById('btn-delete-node').addEventListener('click', () => {
      if (!_currentId) return;
      if (confirm('确定删除此节点？')) TreeMgr.deleteNode(_currentId);
    });
    document.getElementById('btn-add-child').addEventListener('click', () => {
      if (_currentId) TreeMgr.addNode(_currentId);
    });
    document.getElementById('btn-add-sibling').addEventListener('click', addSiblingNode);

    /* 代码文件拖入 */
    _textarea.addEventListener('dragover', e => e.preventDefault());
    _textarea.addEventListener('drop', e => _handleCodeDrop(e));
  }

  /* ── Load ── */
  async function loadNode(id) {
    if (_currentId && _dirty) await saveCurrentNode();
    _currentId = id;
    _dirty = false;
    _undoStack = _undoStack.filter(e => e.id === id);
    _redoStack = [];
    const node = TreeMgr.findNode(id);
    if (!node) return;
    _metaLabel.value   = node.label   || '';
    _metaComment.value = node.comment || '';
    const content = await StorageMgr.loadNodeContent(id);
    _textarea.value = content;
    PreviewMgr.render();
    StatsMgr.update(_currentId, _textarea.value);
    
    // 【新增】停止光标呼吸动画
    clearTimeout(_typingTimeout);
    _textarea.classList.remove('cursor-breathe');
  }

  /* ── Save ── */
  async function saveCurrentNode() {
    if (!_currentId) return;
    const content = _textarea.value;
    if (!TreeMgr.findNode(_currentId)) return;
    try {
      await StorageMgr.saveNodeContent(_currentId, content);
      _dirty = false;
      showMsg('已保存');
    } catch (err) {
      showMsg('⚠ ' + err.message, true);
    }
    StatsMgr.update(_currentId, _textarea.value);
    await StatsMgr.checkQuota();
  }

  function saveImmediately() { debouncedSave.cancel(); saveCurrentNode(); }

  /* ── Sibling ── */
  function addSiblingNode() {
    if (!_currentId) { TreeMgr.addNode(null); return; }
    const parent = TreeMgr.findParent(_currentId);
    TreeMgr.addNode(parent ? parent.id : null);
  }

  /* ── updateCharStats（供 TreeMgr 调用） ── */
  function updateCharStats() {
    StatsMgr.update(_currentId, _textarea ? _textarea.value : '');
  }

  /* ── Code drop ── */
  const CODE_EXTS = new Set(['java','py','js','ts','cpp','c','h','cs','go','rs','rb','php',
    'swift','kt','scala','html','css','sh','bash','sql','json','yaml','yml','xml','md']);

  async function _handleCodeDrop(e) {
    e.preventDefault();
    const files = [...e.dataTransfer.files].slice(0, 20);
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!CODE_EXTS.has(ext)) continue;
      const text    = await file.text();
      const content = '```' + ext + '\n' + text + '\n```';
      const node    = TreeMgr.addNode(null, file.name);
      await StorageMgr.saveNodeContent(node.id, content);
    }
    TreeMgr.renderTree();
  }

  /* ── Message ── */
  function showMsg(msg, isError = false) {
    const el = document.getElementById('stat-msg');
    el.textContent = msg;
    el.style.color = isError ? 'var(--error)' : 'var(--success)';
    el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = 'fadeout 4s ease forwards'; });
  }

  return {
    init, loadNode, saveCurrentNode, saveImmediately,
    showMsg,
    updateCharStats,
    contentUndo, contentRedo, addSiblingNode,
    insertTable: (r, c) => ToolbarMgr.insertTable(r, c),
    checkQuota: () => StatsMgr.checkQuota(),
    get currentId() { return _currentId; }
  };
})();

window.EditorMgr = EditorMgr;