/**
 * Function: 预览面板管理
 *   - 实时预览渲染（编辑区内容 → HTML）
 *   - 全篇预览（遍历所有非隐藏节点，Modal 展示）
 *   - 编辑区 ↔ 预览区滚动同步
 *   - 同步滚动脉冲指示器
 *   - 聚焦模式（编辑时预览变暗）
 * Dependencies: core/markdown.js, storage.js, tree.js
 */
'use strict';

const PreviewMgr = (() => {
  const { mdToHtml } = MarkdownRenderer;

  let _textarea, _preview;
  let _syncIndicators = []; // 同步指示器队列

  function init(textarea, preview) {
    _textarea = textarea;
    _preview  = preview;
    _initScrollSync();
    _initFocusMode();
    _bindFullPreview();
  }

  /* ── 实时预览 ── */
  function render() {
    _preview.innerHTML = mdToHtml(_textarea.value);
  }

  /* ── 滚动同步 + 脉冲指示器 ── */
  function _initScrollSync() {
    let locked = false;
    let lastSyncTime = 0;
    
    _textarea.addEventListener('scroll', () => {
      if (locked) return;
      locked = true;
      
      const r = _textarea.scrollTop / (_textarea.scrollHeight - _textarea.clientHeight || 1);
      _preview.scrollTop = r * (_preview.scrollHeight - _preview.clientHeight);
      
      // 【新增】显示同步指示器（节流）
      const now = Date.now();
      if (now - lastSyncTime > 500) {
        _showSyncIndicator(_preview);
        lastSyncTime = now;
      }
      
      requestAnimationFrame(() => { locked = false; });
    });
    
    _preview.addEventListener('scroll', () => {
      if (locked) return;
      locked = true;
      
      const r = _preview.scrollTop / (_preview.scrollHeight - _preview.clientHeight || 1);
      _textarea.scrollTop = r * (_textarea.scrollHeight - _textarea.clientHeight);
      
      // 【新增】显示同步指示器（节流）
      const now = Date.now();
      if (now - lastSyncTime > 500) {
        _showSyncIndicator(_textarea);
        lastSyncTime = now;
      }
      
      requestAnimationFrame(() => { locked = false; });
    });
  }

  /* ── 【新增】同步滚动脉冲指示器 ── */
  function _showSyncIndicator(container) {
    // 清除之前的指示器
    _clearSyncIndicators();
    
    // 计算位置（顶部中心）
    const rect = container.getBoundingClientRect();
    const indicator = document.createElement('div');
    indicator.className = 'sync-indicator';
    indicator.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width / 2 - 3}px;
      top: ${rect.top + 20}px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-primary);
      pointer-events: none;
      z-index: 1000;
      animation: sync-pulse 1s ease-out forwards;
    `;
    
    document.body.appendChild(indicator);
    _syncIndicators.push(indicator);
    
    // 自动移除
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
      const idx = _syncIndicators.indexOf(indicator);
      if (idx > -1) _syncIndicators.splice(idx, 1);
    }, 1000);
  }
  
  function _clearSyncIndicators() {
    _syncIndicators.forEach(indicator => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });
    _syncIndicators = [];
  }

  /* ── 【新增】聚焦模式 ── */
  function _initFocusMode() {
    const editorWrap = document.querySelector('.editor-wrap');
    if (!editorWrap) return;
    
    // 编辑器聚焦时，预览面板变暗
    _textarea.addEventListener('focus', () => {
      _preview.classList.add('dimmed');
    });
    
    _textarea.addEventListener('blur', () => {
      _preview.classList.remove('dimmed');
    });
    
    // 鼠标移入预览时恢复
    _preview.addEventListener('mouseenter', () => {
      _preview.classList.remove('dimmed');
    });
    
    _preview.addEventListener('mouseleave', () => {
      // 如果编辑器仍然聚焦，继续变暗
      if (document.activeElement === _textarea) {
        _preview.classList.add('dimmed');
      }
    });
  }

  /* ── 全篇预览 ── */
  function _bindFullPreview() {
    document.getElementById('btn-full-preview').addEventListener('click', openFull);
    document.getElementById('full-preview-close').addEventListener('click', closeFull);
    document.getElementById('modal-full-preview').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeFull();
    });
  }

  function closeFull() {
    document.getElementById('modal-full-preview').classList.add('hidden');
  }

  async function openFull(currentId, currentValue, isDirty, saveCurrentFn) {
    const modal     = document.getElementById('modal-full-preview');
    const container = document.getElementById('full-preview-content');
    container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px;">加载中…</p>';
    modal.classList.remove('hidden');

    if (isDirty) await saveCurrentFn();

    const lines = [];
    async function walk(nodes, depth) {
      for (const n of nodes) {
        if (TreeMgr.hidden.has(n.id)) continue;
        const hashes = '#'.repeat(Math.min(depth, 6));
        lines.push(`${hashes} ${n.label || '(无标签)'}`);
        if (n.comment) lines.push(`> ${n.comment}`);
        const content = await StorageMgr.loadNodeContent(n.id);
        if (content) lines.push('', content, '');
        if (n.children.length) await walk(n.children, depth + 1);
      }
    }
    try {
      await walk(TreeMgr.tree, 1);
      container.innerHTML = mdToHtml(lines.join('\n')) || '<p style="color:var(--text-tertiary);text-align:center;padding:40px;">（暂无内容）</p>';
    } catch (err) {
      container.innerHTML = `<p style="color:var(--error);padding:20px;">渲染失败: ${err.message}</p>`;
    }
  }

  return { init, render, openFull, closeFull };
})();

window.PreviewMgr = PreviewMgr;
