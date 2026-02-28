/**
 * Function (功能): 
 *   - 树形数据模型管理：节点 CRUD、层级关系、拖拽排序
 *   - 节点可见性控制（隐藏/显示子树）、折叠状态管理
 *   - Undo/Redo 栈（50 步快照）、键盘导航（上下箭头）
 *   - 树面板 DOM 渲染与事件委托
 * Dependencies (依赖): 
 *   - storage.js (StorageMgr)
 *   - editor.js (间接调用 updateCharStats)
 */

'use strict';

/* ── Data Model ── */
let _tree = [];
let _collapsed = new Set();
let _hidden    = new Set();   // V1: hidden node ids
let _activeId  = null;

/* node: { id, label, comment, children[] } */
let _idCtr = Date.now();
function newId() { return 'n' + (++_idCtr); }

function makeNode(label = '新节点', comment = '') {
  return { id: newId(), label, comment, children: [] };
}

/* ── Undo / Redo Stack (D1) ── */
const MAX_UNDO = 50;
let _undoStack = [];
let _redoStack = [];

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
  if (top && top.treeOp && top.after === null) {
    top.after = deepClone(_tree);
  }
}

function undo() {
  if (!_undoStack.length) return;
  const op = _undoStack.pop();
  _redoStack.push(op);
  if (op.treeOp) { _tree = deepClone(op.before); renderTree(); }
  else { const node = findNode(op.nodeId); if (node) Object.assign(node, op.before); renderTree(); }
}
function redo() {
  if (!_redoStack.length) return;
  const op = _redoStack.pop();
  _undoStack.push(op);
  if (op.treeOp) { _tree = deepClone(op.after); renderTree(); }
  else { const node = findNode(op.nodeId); if (node) Object.assign(node, op.after); renderTree(); }
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

/* ── CRUD ── */
function addNode(parentId = null, label = '新节点') {
  _snapshotTree('add');
  const node = makeNode(label);
  if (parentId) {
    const parent = findNode(parentId);
    if (parent) parent.children.push(node);
  } else {
    _tree.push(node);
  }
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
  // 删除节点后立即刷新总字符/Token统计
  window.EditorMgr && EditorMgr.updateCharStats();
}
function _removeNode(id, nodes) {
  const idx = nodes.findIndex(n => n.id === id);
  if (idx !== -1) { nodes.splice(idx, 1); return true; }
  for (const n of nodes) { if (_removeNode(id, n.children)) return true; }
  return false;
}

/* ── Visibility (V1) ── */
function _collectSubtreeIds(node, out = []) {
  out.push(node.id);
  for (const c of node.children) _collectSubtreeIds(c, out);
  return out;
}

function toggleHidden(id) {
  const node = findNode(id);
  if (!node) return;
  const ids = _collectSubtreeIds(node);
  const nowHiding = !_hidden.has(id);
  for (const nid of ids) {
    if (nowHiding) _hidden.add(nid);
    else           _hidden.delete(nid);
  }
  persistHidden();
  renderTree();
  // 隐藏/显示节点后立即刷新总字符/Token统计
  window.EditorMgr && EditorMgr.updateCharStats();
}

function persistHidden() {
  localStorage.setItem('md_hidden', JSON.stringify([..._hidden]));
}
function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem('md_hidden') || '[]')); }
  catch { return new Set(); }
}

/* ── Persist ── */
function persistMeta() {
  const meta = { tree: _tree, activeId: _activeId, idCtr: _idCtr };
  StorageMgr.saveMeta(meta);
}
async function loadMeta() {
  const meta = StorageMgr.loadMeta();
  if (meta) {
    _tree     = meta.tree     || [];
    _activeId = meta.activeId || null;
    _idCtr    = meta.idCtr    || Date.now();
  } else {
    const node = makeNode('欢迎使用', '这是第一个节点');
    _tree = [node];
    _activeId = node.id;
    persistMeta();
  }
  _collapsed = StorageMgr.loadCollapsed();
  _hidden    = loadHidden();
}

/* ── Rendering ── */
const treeContainer = () => document.getElementById('tree-container');

function renderTree() {
  const c = treeContainer();
  if (!c) return;
  c.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const n of _tree) frag.appendChild(_renderNode(n, 0));
  c.appendChild(frag);
  updateStats();
}

function _renderNode(node, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-node';
  wrap.dataset.id = node.id;

  const isHidden = _hidden.has(node.id);

  const row = document.createElement('div');
  row.className = 'tree-node-row' +
    (node.id === _activeId ? ' active' : '') +
    (isHidden ? ' node-hidden' : '');
  row.draggable = true;
  row.style.paddingLeft = (6 + depth * 18) + 'px';

  // toggle collapse
  const tog = document.createElement('span');
  tog.className = 'tree-toggle';
  tog.textContent = node.children.length ? (_collapsed.has(node.id) ? '▶' : '▼') : '';
  tog.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(node.id); });

  const lbl = document.createElement('span');
  lbl.className = 'tree-label';
  lbl.textContent = node.label || '(无标签)';

  // visibility toggle button
  const visBtn = document.createElement('span');
  visBtn.className = 'tree-vis-btn';
  visBtn.title = isHidden ? '显示节点' : '隐藏节点';
  visBtn.textContent = isHidden ? '👁️‍🗨️' : '👁';
  visBtn.addEventListener('click', e => { e.stopPropagation(); toggleHidden(node.id); });

  row.appendChild(tog);
  row.appendChild(lbl);

  if (node.comment) {
    const cmt = document.createElement('span');
    cmt.className = 'tree-comment';
    cmt.textContent = node.comment;
    row.appendChild(cmt);
  }

  row.appendChild(visBtn);

  row.addEventListener('click', () => setActive(node.id));

  // Drag-and-drop
  row.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
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

  const ch = document.createElement('div');
  ch.className = 'tree-children' + (_collapsed.has(node.id) ? ' collapsed' : '');
  for (const child of node.children) ch.appendChild(_renderNode(child, depth + 1));
  wrap.appendChild(ch);

  return wrap;
}

/* ── Drop Logic ── */
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
  if (_collapsed.has(id)) _collapsed.delete(id);
  else _collapsed.add(id);
  StorageMgr.saveCollapsed(_collapsed);
  renderTree();
}

/* ── Active node ── */
function setActive(id) {
  _activeId = id;
  document.querySelectorAll('.tree-node-row').forEach(r => {
    const nodeId = r.closest('.tree-node').dataset.id;
    r.classList.toggle('active', nodeId === id);
  });
  persistMeta();
  if (window.EditorMgr) window.EditorMgr.loadNode(id);
}

/* ── Arrow-key navigation ── */
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
function updateStats() {
  const el = document.getElementById('stat-nodes');
  if (el) {
    const total   = allNodes().length;
    const visible = allNodes().filter(n => !_hidden.has(n.id)).length;
    el.textContent = _hidden.size > 0
      ? `节点: ${visible}/${total}`
      : `节点: ${total}`;
  }
}

/* ── Expose ── */
window.TreeMgr = {
  get tree()      { return _tree; },
  get activeId()  { return _activeId; },
  get collapsed() { return _collapsed; },
  get hidden()    { return _hidden; },          // V1
  makeNode, addNode, deleteNode, findNode, findParent,
  allNodes, allIds,
  loadMeta, persistMeta, renderTree,
  setActive, navigateTree,
  toggleCollapse, toggleHidden,                 // V1
  undo, redo,
  _snapshot, _snapshotTree, _finalizeTreeSnapshot,
  setTree(t) { _tree = t; },
  setIdCtr(v) { _idCtr = v; }
};