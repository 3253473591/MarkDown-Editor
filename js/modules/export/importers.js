/**
 * Function: 数据导入
 *   - importJSON：JSON 导入（保留隐藏状态）
 *   - importMD：Markdown 导入（自动解析层级）
 *   - 支持追加 / 覆盖两种模式
 * Dependencies: tree.js, storage.js, editor.js
 */
'use strict';

const Importers = (() => {

  async function importJSON(jsonStr, mode) {
    let data;
    try { data = JSON.parse(jsonStr); } catch { alert('JSON 解析失败'); return; }
    if (!Array.isArray(data)) data = [data];

    TreeMgr._snapshotTree('import');
    const newHiddenIds = [];

    async function processNodes(nodes) {
      const res = [];
      for (const raw of nodes) {
        const node = TreeMgr.makeNode(raw.label || '导入节点', raw.comment || '');
        if (raw.content) await StorageMgr.saveNodeContent(node.id, raw.content);
        if (raw.hidden)  newHiddenIds.push(node.id);
        node.children = raw.children ? await processNodes(raw.children) : [];
        res.push(node);
      }
      return res;
    }

    const newNodes = await processNodes(data);

    if (mode === 'overwrite') {
      const oldIds = TreeMgr.allIds();
      TreeMgr.setTree([]); for (const id of oldIds) await StorageMgr.deleteNodeContent(id);
      TreeMgr.hidden.clear(); TreeMgr.setTree(newNodes);
    } else {
      TreeMgr.tree.push(...newNodes);
    }

    for (const id of newHiddenIds) TreeMgr.hidden.add(id);
    localStorage.setItem('md_hidden', JSON.stringify([...TreeMgr.hidden]));
    TreeMgr._finalizeTreeSnapshot();
    TreeMgr.renderTree(); TreeMgr.persistMeta();
    EditorMgr.showMsg(mode === 'overwrite' ? '已覆盖导入' : '已追加导入');
  }

  async function importMD(text, mode) {
    TreeMgr._snapshotTree('import-md');
    const lines   = text.split('\n');
    const root    = [];
    const stack   = [{ children: root, depth: 0 }];
    let currentNode  = null;
    let contentLines = [];

    async function flushContent() {
      if (currentNode && contentLines.length) {
        const trimmed = contentLines.join('\n').trim();
        if (trimmed) await StorageMgr.saveNodeContent(currentNode.id, trimmed);
      }
      contentLines = [];
    }

    for (const line of lines) {
      const hm = line.match(/^(#{1,6}) (.+)/);
      if (hm) {
        await flushContent();
        const depth = hm[1].length;
        const node  = TreeMgr.makeNode(hm[2].trim());
        currentNode = node;
        while (stack.length > 1 && stack[stack.length-1].depth >= depth) stack.pop();
        stack[stack.length-1].children.push(node);
        stack.push({ children: node.children, depth, node });
      } else if (currentNode) {
        const bq = line.match(/^> (.*)$/);
        if (bq && contentLines.every(l => l.trim() === '')) {
          currentNode.comment = bq[1].trim(); contentLines = [];
        } else { contentLines.push(line); }
      }
    }
    await flushContent();

    if (mode === 'overwrite') {
      const oldIds = TreeMgr.allIds();
      TreeMgr.setTree([]); for (const id of oldIds) await StorageMgr.deleteNodeContent(id);
      TreeMgr.hidden.clear(); localStorage.setItem('md_hidden','[]');
      TreeMgr.setTree(root);
    } else { TreeMgr.tree.push(...root); }

    TreeMgr._finalizeTreeSnapshot();
    TreeMgr.renderTree(); TreeMgr.persistMeta();
    EditorMgr.showMsg(mode === 'overwrite' ? '已覆盖导入' : '已追加导入');
  }

  return { importJSON, importMD };
})();

window.Importers = Importers;