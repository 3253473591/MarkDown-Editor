/**
 * Function: 树形数据模型管理
 *   - 节点 CRUD、层级关系、拖拽排序
 *   - 节点可见性控制（隐藏/显示子树）、折叠状态管理
 *   - Undo/Redo 栈（50步快照）、键盘导航
 *   - 树面板 DOM 渲染与事件委托
 *   - 同级节点上下移动
 *   - 层级色彩编码、SVG 图标系统、弹性动画
 * Dependencies: storage.js, editor.js (间接 updateCharStats)
 */
'use strict';

/* ── Data Model ── */
let _tree      = [];
let _collapsed = new Set();
let _hidden    = new Set();
let _activeId  = null;
let _idCtr     = Date.now();

function newId() { return 'n' + (++_idCtr); }
function makeNode(label = '新节点', comment = '') {
  return { id: newId(), label, comment, children: [] };
}

/* ── Undo / Redo ── */
const MAX_UNDO = 50;
let _undoStack = [], _redoStack = [];

function _snapshot(nodeId, before, after) {
  _undoStack.push({ nodeId, before: deepClone(before), after: deepClone(after) });
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
  _redoStack = [];
}
function _snapshotTree(label) {
  _undoStack.push({ treeOp: label, before: deepClone(_tree), after: null });
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
  _redoStack = [];
}
function _finalizeTreeSnapshot() {
  const top = _undoStack[_undoStack.length - 1];
  if (top && top.treeOp && top.after === null) top.after = deepClone(_tree);
}
function undo() {
  if (!_undoStack.length) return;
  const op = _undoStack.pop(); _redoStack.push(op);
  if (op.treeOp) { _tree = deepClone(op.before); renderTree(); }
  else { const n = findNode(op.nodeId); if (n) Object.assign(n, op.before); renderTree(); }
}
function redo() {
  if (!_redoStack.length) return;
  const op = _redoStack.pop(); _undoStack.push(op);
  if (op.treeOp) { _tree = deepClone(op.after); renderTree(); }
  else { const n = findNode(op.nodeId); if (n) Object.assign(n, op.after); renderTree(); }
}

/* ── Helpers ── */
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function findNode(id, nodes = _tree) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(id, n.children);
    if (found) return found;
  }
  return null;
}
function findParent(id, nodes = _tree, parent = null) {
  for (const n of nodes) {
    if (n.id === id) return parent;
    const found = findParent(id, n.children, n);
    if (found !== undefined) return found;
  }
}
function allNodes(nodes = _tree) {
  const out = [];
  function walk(ns) { for (const n of ns) { out.push(n); walk(n.children); } }
  walk(nodes);
  return out;
}
function allIds() { return new Set(allNodes().map(n => n.id)); }

/* ── Siblings Array ── */
function _siblingsOf(id) {
  const parent = findParent(id);
  return parent ? parent.children : _tree;
}

/* ── Move Up / Down（同级） ── */
function moveNodeUp(id) {
  const siblings = _siblingsOf(id);
  const idx = siblings.findIndex(n => n.id === id);
  if (idx <= 0) return;
  _snapshotTree('moveUp');
  [siblings[idx - 1], siblings[idx]] = [siblings[idx], siblings[idx - 1]];
  _finalizeTreeSnapshot();
  renderTree();
  persistMeta();
}

function moveNodeDown(id) {
  const siblings = _siblingsOf(id);
  const idx = siblings.findIndex(n => n.id === id);
  if (idx < 0 || idx >= siblings.length - 1) return;
  _snapshotTree('moveDown');
  [siblings[idx], siblings[idx + 1]] = [siblings[idx + 1], siblings[idx]];
  _finalizeTreeSnapshot();
  renderTree();
  persistMeta();
}

/* ── Clear All ── */
function clearAll() {
  _snapshotTree('clearAll');
  const ids = allIds();
  _tree     = [];
  _activeId = null;
  _collapsed.clear();
  _hidden.clear();
  _finalizeTreeSnapshot();
  ids.forEach(id => window.StorageMgr?.deleteNodeContent(id));
  persistHidden();
  StorageMgr.saveCollapsed(_collapsed);
  persistMeta();
  renderTree();
  window.EditorMgr && EditorMgr.updateCharStats();
}

/* ── CRUD ── */
function addNode(parentId = null, label = '新节点') {
  _snapshotTree('add');
  const node = makeNode(label);
  if (parentId) { const p = findNode(parentId); if (p) p.children.push(node); }
  else _tree.push(node);
  _finalizeTreeSnapshot();
  renderTree();
  setActive(node.id);
  persistMeta();
  return node;
}
function deleteNode(id) {
  _snapshotTree('delete');
  _removeNode(id, _tree);
  _finalizeTreeSnapshot();
  if (_activeId === id) _activeId = null;
  _hidden.delete(id);
  renderTree();
  persistMeta();
  window.StorageMgr.deleteNodeContent(id);
  window.EditorMgr && EditorMgr.updateCharStats();
}
function _removeNode(id, nodes) {
  const idx = nodes.findIndex(n => n.id === id);
  if (idx !== -1) { nodes.splice(idx, 1); return true; }
  for (const n of nodes) { if (_removeNode(id, n.children)) return true; }
  return false;
}

/* ── Visibility ── */
function _collectSubtreeIds(node, out = []) {
  out.push(node.id);
  for (const c of node.children) _collectSubtreeIds(c, out);
  return out;
}
function toggleHidden(id) {
  const node = findNode(id);
  if (!node) return;
  const ids = _collectSubtreeIds(node);
  const hiding = !_hidden.has(id);
  for (const nid of ids) { if (hiding) _hidden.add(nid); else _hidden.delete(nid); }
  persistHidden();
  renderTree();
  window.EditorMgr && EditorMgr.updateCharStats();
}
function persistHidden() { localStorage.setItem('md_hidden', JSON.stringify([..._hidden])); }
function loadHidden()    { try { return new Set(JSON.parse(localStorage.getItem('md_hidden') || '[]')); } catch { return new Set(); } }

/* ── Persist ── */
function persistMeta() {
  StorageMgr.saveMeta({ tree: _tree, activeId: _activeId, idCtr: _idCtr });
}
async function loadMeta() {
  const meta = StorageMgr.loadMeta();
  if (meta) {
    _tree     = meta.tree     || [];
    _activeId = meta.activeId || null;
    _idCtr    = meta.idCtr    || Date.now();
  } else {
    const node = makeNode('欢迎使用', '这是第一个节点');
    _tree = [node]; _activeId = node.id;
    persistMeta();
  }
  _collapsed = StorageMgr.loadCollapsed();
  _hidden    = loadHidden();
}

/* ── SVG Icons ── */
const SVG_ICONS = {
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"/>
    <polyline points="5 12 12 5 19 12"/>
  </svg>`,
  arrowDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <polyline points="19 12 12 19 5 12"/>
  </svg>`
};

/* ── Rendering ── */
const treeContainer = () => document.getElementById('tree-container');

function renderTree() {
  const c = treeContainer();
  if (!c) return;
  c.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const n of _tree) frag.appendChild(_renderNode(n, 0));
  c.appendChild(frag);
  _updateStats();
}

function _renderNode(node, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-node';
  wrap.dataset.id = node.id;
  wrap.dataset.depth = depth; // 【新增】层级深度，用于色彩编码

  const isHidden = _hidden.has(node.id);
  const isCollapsed = _collapsed.has(node.id);
  
  const row = document.createElement('div');
  row.className = 'tree-node-row' +
    (node.id === _activeId ? ' active' : '') +
    (isHidden ? ' node-hidden' : '');
  row.draggable = true;
  row.style.paddingLeft = (8 + depth * 20) + 'px'; // 调整为 8pt 网格

  // 展开折叠按钮
  const tog = document.createElement('span');
  tog.className = 'tree-toggle' + (node.children.length ? (isCollapsed ? '' : ' expanded') : '');
  if (node.children.length) {
    tog.innerHTML = SVG_ICONS.chevronRight;
    tog.title = isCollapsed ? '展开子节点' : '折叠子节点';
  }
  tog.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(node.id); });

  // 节点标签
  const lbl = document.createElement('span');
  lbl.className = 'tree-label';
  lbl.textContent = node.label || '(无标签)';

  // 注释
  const cmt = document.createElement('span');
  cmt.className = 'tree-comment';
  cmt.textContent = node.comment || '';

  // 上移按钮
  const upBtn = document.createElement('span');
  upBtn.className = 'tree-move-btn tree-move-up';
  upBtn.innerHTML = SVG_ICONS.arrowUp;
  upBtn.title = '上移节点';
  upBtn.addEventListener('click', e => { e.stopPropagation(); moveNodeUp(node.id); });

  // 下移按钮
  const downBtn = document.createElement('span');
  downBtn.className = 'tree-move-btn tree-move-down';
  downBtn.innerHTML = SVG_ICONS.arrowDown;
  downBtn.title = '下移节点';
  downBtn.addEventListener('click', e => { e.stopPropagation(); moveNodeDown(node.id); });

  // 可见性切换按钮
  const visBtn = document.createElement('span');
  visBtn.className = 'tree-vis-btn';
  visBtn.innerHTML = isHidden ? SVG_ICONS.eyeOff : SVG_ICONS.eye;
  visBtn.title = isHidden ? '显示节点' : '隐藏节点';
  visBtn.addEventListener('click', e => { e.stopPropagation(); toggleHidden(node.id); });

  // 组装节点行
  row.appendChild(tog);
  row.appendChild(lbl);
  row.appendChild(cmt);
  row.appendChild(upBtn);
  row.appendChild(downBtn);
  row.appendChild(visBtn);

  row.addEventListener('click', () => setActive(node.id));

  /* Drag-and-drop */
  row.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
  });
  row.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
  row.addEventListener('drop', e => {
    e.preventDefault();
    row.classList.remove('drag-over');
    const srcId = e.dataTransfer.getData('text/plain');
    if (srcId && srcId !== node.id) dropNode(srcId, node.id);
  });

  wrap.appendChild(row);
  
  // 子节点容器（支持弹性动画）
  const ch = document.createElement('div');
  ch.className = 'tree-children' + (isCollapsed ? ' collapsed' : '');
  ch.dataset.nodeId = node.id; // 用于动画
  
  for (const child of node.children) {
    ch.appendChild(_renderNode(child, depth + 1));
  }
  
  wrap.appendChild(ch);
  return wrap;
}

/* ── Drop ── */
function dropNode(srcId, targetId) {
  _snapshotTree('move');
  const srcNode = deepClone(findNode(srcId));
  _removeNode(srcId, _tree);
  const target = findNode(targetId);
  if (target) target.children.push(srcNode);
  _finalizeTreeSnapshot();
  renderTree();
  persistMeta();
}

/* ── Collapse ── */
function toggleCollapse(id) {
  const isCurrentlyCollapsed = _collapsed.has(id);
  
  if (isCurrentlyCollapsed) {
    _collapsed.delete(id);
  } else {
    _collapsed.add(id);
  }
  
  StorageMgr.saveCollapsed(_collapsed);
  
  // 【新增】动画过渡
  const container = document.querySelector(`.tree-children[data-node-id="${id}"]`);
  if (container) {
    if (isCurrentlyCollapsed) {
      // 展开：先设置 max-height，然后移除 collapsed
      container.style.maxHeight = container.scrollHeight + 'px';
      container.classList.remove('collapsed');
      // 动画结束后移除 max-height
      setTimeout(() => {
        container.style.maxHeight = '';
      }, 300);
    } else {
      // 折叠：先设置 max-height，然后添加 collapsed
      container.style.maxHeight = container.scrollHeight + 'px';
      requestAnimationFrame(() => {
        container.classList.add('collapsed');
        container.style.maxHeight = '0';
      });
    }
  } else {
    renderTree();
  }
  
  // 更新展开图标旋转状态
  const toggleBtn = document.querySelector(`.tree-node[data-id="${id}"] .tree-toggle`);
  if (toggleBtn) {
    toggleBtn.classList.toggle('expanded', isCurrentlyCollapsed);
  }
}

/* ── Active ── */
function setActive(id) {
  _activeId = id;
  document.querySelectorAll('.tree-node-row').forEach(r => {
    r.classList.toggle('active', r.closest('.tree-node').dataset.id === id);
  });
  persistMeta();
  if (window.EditorMgr) window.EditorMgr.loadNode(id);
}

/* ── Navigation ── */
function navigateTree(dir) {
  const visible = _visibleIds();
  if (!visible.length) return;
  const idx = visible.indexOf(_activeId);
  if (dir === 'up'   && idx > 0)               setActive(visible[idx - 1]);
  if (dir === 'down' && idx < visible.length-1) setActive(visible[idx + 1]);
}
function _visibleIds(nodes = _tree, out = []) {
  for (const n of nodes) {
    out.push(n.id);
    if (!_collapsed.has(n.id)) _visibleIds(n.children, out);
  }
  return out;
}

/* ── Stats ── */
function _updateStats() {
  const el = document.getElementById('stat-nodes');
  if (!el) return;
  const total   = allNodes().length;
  const visible = allNodes().filter(n => !_hidden.has(n.id)).length;
  el.textContent = _hidden.size > 0 ? `节点: ${visible}/${total}` : `节点: ${total}`;
}

/* ── Expose ── */
window.TreeMgr = {
  get tree()      { return _tree; },
  get activeId()  { return _activeId; },
  get collapsed() { return _collapsed; },
  get hidden()    { return _hidden; },
  makeNode, addNode, deleteNode, findNode, findParent,
  allNodes, allIds,
  loadMeta, persistMeta, renderTree,
  setActive, navigateTree,
  toggleCollapse, toggleHidden,
  moveNodeUp, moveNodeDown, clearAll,
  undo, redo,
  _snapshot, _snapshotTree, _finalizeTreeSnapshot,
  setTree(t)  { _tree = t; },
  setIdCtr(v) { _idCtr = v; }
};
