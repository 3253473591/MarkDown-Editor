/**
 * Function (功能): 
 *   - 全文模糊搜索（标签 0.3 + 注释 0.2 + 内容 0.5 权重）
 *   - 搜索结果高亮展示、点击跳转定位节点
 * Dependencies (依赖): 
 *   - tree.js (TreeMgr, 获取节点列表与激活节点)
 *   - storage.js (StorageMgr, 加载节点内容)
 * Bug Fix Guide (Bug 修复提示):
 *   若搜索无结果、高亮失效、点击无法跳转、搜索框不弹出，
 *   需上传：此文件 + tree.js + storage.js + components.css 给 LLM。
 */

'use strict';

const SearchMgr = (() => {
  function open() {
    document.getElementById('modal-search').classList.remove('hidden');
    document.getElementById('search-input').focus();
    document.getElementById('search-results').innerHTML = '';
  }
  function close() {
    document.getElementById('modal-search').classList.add('hidden');
  }

  function highlight(str, kw) {
    if (!kw) return esc(str);
    const re = new RegExp('(' + escRe(kw) + ')', 'gi');
    return esc(str).replace(re, '<mark>$1</mark>');
  }
  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function doSearch(kw) {
    if (!kw.trim()) { document.getElementById('search-results').innerHTML = ''; return; }
    const kl = kw.toLowerCase();
    const nodes = TreeMgr.allNodes();

    // Load all contents (cached in LS/IDB)
    const results = [];
    for (const node of nodes) {
      const content = await StorageMgr.loadNodeContent(node.id);
      const labelHit   = (node.label   || '').toLowerCase().includes(kl);
      const commentHit = (node.comment || '').toLowerCase().includes(kl);
      const contentHit = (content      || '').toLowerCase().includes(kl);
      if (!labelHit && !commentHit && !contentHit) continue;

      let score = 0;
      if (contentHit) score += 0.5;
      if (labelHit)   score += 0.3;
      if (commentHit) score += 0.2;

      // excerpt: find first occurrence in content
      let excerpt = '';
      if (contentHit) {
        const idx = content.toLowerCase().indexOf(kl);
        const start = Math.max(0, idx - 40);
        excerpt = (start > 0 ? '…' : '') + content.substring(start, start + 120) + (start + 120 < content.length ? '…' : '');
      }
      results.push({ node, score, content, excerpt });
    }
    results.sort((a, b) => b.score - a.score);

    const container = document.getElementById('search-results');
    container.innerHTML = '';
    if (!results.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:8px">无匹配结果</p>';
      return;
    }
    for (const {node, excerpt} of results) {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `
        <div class="s-label">${highlight(node.label || '(无标签)', kw)}</div>
        ${node.comment ? `<div class="s-excerpt">${highlight(node.comment, kw)}</div>` : ''}
        ${excerpt ? `<div class="s-excerpt">${highlight(excerpt, kw)}</div>` : ''}
      `;
      item.addEventListener('click', () => {
        TreeMgr.setActive(node.id);
        close();
      });
      container.appendChild(item);
    }
  }

  function init() {
    document.getElementById('search-close').addEventListener('click', close);
    document.getElementById('btn-search').addEventListener('click', open);
    const inp = document.getElementById('search-input');
    let debT;
    inp.addEventListener('input', () => {
      clearTimeout(debT);
      debT = setTimeout(() => doSearch(inp.value), 200);
    });
    document.getElementById('modal-search').addEventListener('click', e => {
      if (e.target === e.currentTarget) close();
    });
  }

  return { init, open, close };
})();

window.SearchMgr = SearchMgr;
