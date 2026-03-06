/**
 * Function: 字符数 / Token 数统计
 *   - 当前节点统计（含标签行 + 注释行）
 *   - 全局统计（异步遍历，跳过隐藏节点）
 *   - 存储配额展示与强制清理触发
 * Dependencies: core/utils.js, storage.js, tree.js
 */
'use strict';

const StatsMgr = (() => {
  const { estimateTokens } = Utils;

  /* 节点深度（根=1） */
  function getNodeDepth(targetId, nodes = TreeMgr.tree, depth = 1) {
    for (const n of nodes) {
      if (n.id === targetId) return depth;
      const found = getNodeDepth(targetId, n.children, depth + 1);
      if (found) return found;
    }
    return 0;
  }

  /** 更新当前节点 + 触发全局统计 */
  function update(currentId, currentValue) {
    const curNode = TreeMgr.findNode(currentId);
    let curTotal = (currentValue || '').length;
    if (curNode) {
      const depth  = getNodeDepth(currentId) || 1;
      const hashes = '#'.repeat(Math.min(depth, 6));
      if (curNode.label)   curTotal += (hashes + ' ' + curNode.label + '\n').length;
      if (curNode.comment) curTotal += ('> ' + curNode.comment + '\n').length;
    }
    document.getElementById('stat-chars-node').textContent  = '当前节点: ' + curTotal;
    document.getElementById('stat-tokens-node').textContent = '当前Token≈: ' + estimateTokens(' '.repeat(curTotal));

    _calcTotal(currentId, currentValue);
  }

  async function _calcTotal(currentId, currentValue) {
    const hidden = TreeMgr.hidden;
    let totalChars = 0;

    async function walk(nodes, depth) {
      for (const n of nodes) {
        if (hidden.has(n.id)) continue;
        const hashes = '#'.repeat(Math.min(depth, 6));
        totalChars += (hashes + ' ' + (n.label || '') + '\n').length;
        if (n.comment) totalChars += ('> ' + n.comment + '\n').length;
        const content = n.id === currentId
          ? currentValue
          : await StorageMgr.loadNodeContent(n.id);
        if (content) totalChars += (content + '\n').length;
        if (n.children.length) await walk(n.children, depth + 1);
      }
    }
    await walk(TreeMgr.tree, 1);

    document.getElementById('stat-chars-total').textContent  = '总字符: ' + totalChars;
    document.getElementById('stat-tokens-total').textContent = '总Token≈: ' + estimateTokens(' '.repeat(totalChars));
  }

  async function checkQuota() {
    const { size, warn, critical } = await StorageMgr.checkQuota();
    const el = document.getElementById('stat-storage');
    const mb = (size / 1024 / 1024).toFixed(2);
    el.textContent = `IDB: ${mb} MB`;
    el.className = 'storage-info' + (critical ? ' critical' : warn ? ' warn' : '');
    if (critical) window.CleanupMgr && window.CleanupMgr.forceOpen(size);
  }

  return { update, checkQuota, getNodeDepth };
})();

window.StatsMgr = StatsMgr;