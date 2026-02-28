/**
 * Function (功能): 
 *   - Markdown 编辑器核心：双向预览、内容 Undo/Redo、自动保存（防抖）
 *   - Token 与字符统计（含隐藏节点过滤）、全篇预览生成
 *   - Markdown 工具栏动作（加粗、表格、代码块等）
 *   - 编辑区/预览区分割线拖动、滚动同步
 *   - 代码文件拖入自动建节点（支持 20+ 种语言）
 * Dependencies (依赖): 
 *   - storage.js (StorageMgr)
 *   - tree.js (TreeMgr, 获取节点结构、深度、隐藏状态)
 *   - export.js (调用 insertTable)
 * Bug Fix Guide (Bug 修复提示):
 *   若编辑器无响应、预览不更新、统计数值错误、工具栏失效、拖入文件无反应，
 *   需上传：此文件 + tree.js + storage.js + editor.css 给 LLM。
 *   若 Markdown 渲染异常，重点检查 mdToHtml() 函数。
 */

'use strict';

/* ── Simple Markdown → HTML renderer (no deps) ── */
function mdToHtml(md) {
  if (!md) return '';

  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const getIndent = (line) => {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre><code class="lang-${lang}">${esc(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,6}) (.+)$/);
    if (hm) {
      const lvl = hm[1].length;
      out.push(`<h${lvl}>${inlinemd(hm[2])}</h${lvl}>`);
      i++; continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      out.push('<hr/>');
      i++; continue;
    }

    // Blockquote
    if (/^> /.test(line)) {
      const bqLines = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        bqLines.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote>${inlinemd(bqLines.join('<br>'))}</blockquote>`);
      continue;
    }

    // Table (Fixed: more robust detection for separator line)
    if (/^\s*\|/.test(line)) {
      const tblLines = [];
      // Collect all consecutive lines starting with |
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        tblLines.push(lines[i].trim());
        i++;
      }
      
      // Must have at least 2 lines (header + separator)
      if (tblLines.length >= 2) {
        const getCells = row => row.split('|').slice(1, -1).map(c => c.trim());
        
        // Check if second line is a valid separator: contains only |, -, :, spaces
        // Supports: |---|---|, | - | - |, |:---:|:---:|
        const sepLine = tblLines[1];
        const isSeparator = /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(sepLine) || 
                           /^\|[\s\-:|]+\|$/.test(sepLine);
        
        if (isSeparator) {
          const hdr = getCells(tblLines[0]).map(c => `<th>${inlinemd(c)}</th>`).join('');
          const body = tblLines.slice(2).map(r => {
            // Skip empty rows
            if (!r.replace(/\|/g, '').trim()) return '';
            return '<tr>' + getCells(r).map(c => `<td>${inlinemd(c)}</td>`).join('') + '</tr>';
          }).filter(tr => tr).join('');
          
          out.push(`<table><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table>`);
          continue;
        }
      }
      
      // Fallback: not a valid table, treat as plain text with line breaks
      out.push(`<p>${esc(tblLines.join('<br>'))}</p>`);
      continue;
    }

    // Unordered list
    if (/^\s*[*\-] /.test(line)) {
      const baseIndent = getIndent(line);
      const items = [];

      while (i < lines.length) {
        const curLine = lines[i];
        const curTrim = curLine.trim();

        if ((!/^\s*[*\-] /.test(curLine) && curTrim !== '') ||
            (curTrim !== '' && getIndent(curLine) < baseIndent)) {
          break;
        }

        if (curTrim === '') {
          let peek = i + 1, hasMore = false;
          while (peek < lines.length) {
            const pLine = lines[peek], pTrim = pLine.trim();
            if (pTrim === '') { peek++; continue; }
            if (/^\s*[*\-] /.test(pLine) && getIndent(pLine) >= baseIndent) { hasMore = true; break; }
            break;
          }
          if (!hasMore) break;
          i++; continue;
        }

        const indent = getIndent(curLine);
        if (indent !== baseIndent) break;

        const content = curTrim.replace(/^[*\-]\s*/, '');
        i++;

        const childLines = [];
        while (i < lines.length) {
          const nextLine = lines[i], nextTrim = nextLine.trim();

          if (nextTrim === '') {
            let peek = i + 1;
            while (peek < lines.length && lines[peek].trim() === '') peek++;
            if (peek < lines.length) {
              const afterEmpty = lines[peek], afterIndent = getIndent(afterEmpty);
              if ((/^\s*[*\-] /.test(afterEmpty) || /^\s*\d+\. /.test(afterEmpty)) && afterIndent <= baseIndent) break;
              if (!/^\s*[*\-] /.test(afterEmpty) && !/^\s*\d+\. /.test(afterEmpty) && afterIndent <= baseIndent) break;
            }
            childLines.push(''); i++; continue;
          }

          const nextIndent = getIndent(nextLine);
          if ((/^\s*[*\-] /.test(nextLine) || /^\s*\d+\. /.test(nextLine)) && nextIndent <= baseIndent) break;
          if (!/^\s*[*\-] /.test(nextLine) && !/^\s*\d+\. /.test(nextLine) && nextIndent <= baseIndent) break;
          childLines.push(nextLine); i++;
        }

        let childHtml = '';
        if (childLines.length > 0) {
          const nonEmptyIndents = childLines.filter(l => l.trim()).map(l => getIndent(l));
          if (nonEmptyIndents.length > 0) {
            const minChildIndent = Math.min(...nonEmptyIndents);
            const normalized = childLines.map(l => l ? l.slice(Math.min(minChildIndent, getIndent(l))) : '');
            childHtml = mdToHtml(normalized.join('\n'));
          }
        }
        items.push(`<li>${inlinemd(content)}${childHtml}</li>`);
      }

      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\s*\d+\. /.test(line)) {
      const baseIndent = getIndent(line);
      const items = [];

      while (i < lines.length) {
        const curLine = lines[i], curTrim = curLine.trim();

        if ((!/^\s*\d+\. /.test(curLine) && curTrim !== '') ||
            (curTrim !== '' && getIndent(curLine) < baseIndent)) {
          break;
        }

        if (curTrim === '') {
          let peek = i + 1, hasMore = false;
          while (peek < lines.length) {
            const pLine = lines[peek], pTrim = pLine.trim();
            if (pTrim === '') { peek++; continue; }
            if (/^\s*\d+\. /.test(pLine) && getIndent(pLine) >= baseIndent) { hasMore = true; break; }
            break;
          }
          if (!hasMore) break;
          i++; continue;
        }

        const indent = getIndent(curLine);
        if (indent !== baseIndent) break;

        const content = curTrim.replace(/^\d+\.\s*/, '');
        i++;

        const childLines = [];
        while (i < lines.length) {
          const nextLine = lines[i], nextTrim = nextLine.trim();

          if (nextTrim === '') {
            let peek = i + 1;
            while (peek < lines.length && lines[peek].trim() === '') peek++;
            if (peek < lines.length) {
              const afterEmpty = lines[peek], afterIndent = getIndent(afterEmpty);
              if ((/^\s*[*\-] /.test(afterEmpty) || /^\s*\d+\. /.test(afterEmpty)) && afterIndent <= baseIndent) break;
              if (!/^\s*[*\-] /.test(afterEmpty) && !/^\s*\d+\. /.test(afterEmpty) && afterIndent <= baseIndent) break;
            }
            childLines.push(''); i++; continue;
          }

          const nextIndent = getIndent(nextLine);
          if ((/^\s*[*\-] /.test(nextLine) || /^\s*\d+\. /.test(nextLine)) && nextIndent <= baseIndent) break;
          if (!/^\s*[*\-] /.test(nextLine) && !/^\s*\d+\. /.test(nextLine) && nextIndent <= baseIndent) break;
          childLines.push(nextLine); i++;
        }

        let childHtml = '';
        if (childLines.length > 0) {
          const nonEmptyIndents = childLines.filter(l => l.trim()).map(l => getIndent(l));
          if (nonEmptyIndents.length > 0) {
            const minChildIndent = Math.min(...nonEmptyIndents);
            const normalized = childLines.map(l => l ? l.slice(Math.min(minChildIndent, getIndent(l))) : '');
            childHtml = mdToHtml(normalized.join('\n'));
          }
        }
        items.push(`<li>${inlinemd(content)}${childHtml}</li>`);
      }

      out.push('<ol>' + items.join('') + '</ol>');
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      out.push('<br>');
      i++; continue;
    }

    // Paragraph
    out.push(`<p>${inlinemd(line)}</p>`);
    i++;
  }

  return out.join('\n');
}

function inlinemd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/~~(.+?)~~/g,     '<del>$1</del>')
    .replace(/`([^`]+)`/g,     '<code>$1</code>')
    .replace(/<sup>(.+?)<\/sup>/g, '<sup>$1</sup>')
    .replace(/<sub>(.+?)<\/sub>/g, '<sub>$1</sub>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Token estimation ── */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 0.9 * 1.3);
}

/* ── Debounce ── */
function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush  = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/* ── EditorMgr ── */
const EditorMgr = (() => {
  let _currentId = null;
  let _dirty = false;
  let _textarea, _preview, _metaLabel, _metaComment;

  const CONTENT_MAX_UNDO = 100;
  let _contentUndoStack = [];
  let _contentRedoStack = [];
  let _lastSavedValue   = '';
  let _undoInProgress   = false;

  const debouncedSave    = debounce(saveCurrentNode, 300);
  const debouncedPreview = debounce(renderPreview, 150);

  /* ── Content undo/redo ── */
  function pushContentUndo(id, value) {
    if (_undoInProgress) return;
    const top = _contentUndoStack[_contentUndoStack.length - 1];
    if (top && top.id === id && top.value === value) return;
    _contentUndoStack.push({ id, value });
    if (_contentUndoStack.length > CONTENT_MAX_UNDO) _contentUndoStack.shift();
    _contentRedoStack = [];
  }

  function contentUndo() {
    if (!_contentUndoStack.length) return false;
    const top = _contentUndoStack[_contentUndoStack.length - 1];
    if (top.id !== _currentId) return false;

    _contentRedoStack.push({ id: _currentId, value: _textarea.value });
    _contentUndoStack.pop();

    _undoInProgress = true;
    _textarea.value = top.value;
    _undoInProgress = false;

    _dirty = true;
    debouncedSave();
    updateCharStats();
    debouncedPreview();
    return true;
  }

  function contentRedo() {
    if (!_contentRedoStack.length) return false;
    const top = _contentRedoStack[_contentRedoStack.length - 1];
    if (top.id !== _currentId) return false;

    _contentUndoStack.push({ id: _currentId, value: _textarea.value });
    _contentRedoStack.pop();

    _undoInProgress = true;
    _textarea.value = top.value;
    _undoInProgress = false;

    _dirty = true;
    debouncedSave();
    updateCharStats();
    debouncedPreview();
    return true;
  }

  /* ── 滚动同步：编辑区 ↔ 预览区 ── */
  function initScrollSync() {
    let _lock = false;

    function onEditorScroll() {
      if (_lock) return;
      _lock = true;
      const ratio = _textarea.scrollTop / (_textarea.scrollHeight - _textarea.clientHeight || 1);
      _preview.scrollTop = ratio * (_preview.scrollHeight - _preview.clientHeight);
      requestAnimationFrame(() => { _lock = false; });
    }

    function onPreviewScroll() {
      if (_lock) return;
      _lock = true;
      const ratio = _preview.scrollTop / (_preview.scrollHeight - _preview.clientHeight || 1);
      _textarea.scrollTop = ratio * (_textarea.scrollHeight - _textarea.clientHeight);
      requestAnimationFrame(() => { _lock = false; });
    }

    _textarea.addEventListener('scroll', onEditorScroll);
    _preview.addEventListener('scroll', onPreviewScroll);
  }

  /* ── 编辑区/预览区 分割线左右拖动 ── */
  function initEditorPreviewDivider() {
    const divider = document.querySelector('.editor-preview-divider');
    const edWrap  = document.querySelector('.editor-wrap');
    let dragging = false, startX, startLeftW;

    divider.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging   = true;
      startX     = e.clientX;
      startLeftW = _textarea.getBoundingClientRect().width;
      divider.classList.add('dragging');
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const totalW = edWrap.offsetWidth - 5;
      let newW = startLeftW + (e.clientX - startX);
      newW = Math.max(totalW * 0.15, Math.min(totalW * 0.85, newW));
      _textarea.style.flex  = 'none';
      _textarea.style.width = newW + 'px';
      _preview.style.flex   = '1';
      _preview.style.width  = '';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      divider.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    });
  }

  /* ── Init ── */
  function init() {
    _textarea    = document.getElementById('editor');
    _preview     = document.getElementById('preview');
    _metaLabel   = document.getElementById('meta-label');
    _metaComment = document.getElementById('meta-comment');

    // ── 按键：记录 undo 快照 ──
    _textarea.addEventListener('keydown', e => {
      if (_undoInProgress) return;
      const isCut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x';
      if (isCut || (!e.ctrlKey && !e.metaKey && e.key.length === 1) || e.key === 'Backspace' || e.key === 'Delete') {
        pushContentUndo(_currentId, _textarea.value);
      }
    });

    // ── 内容变更 ──
    _textarea.addEventListener('input', () => {
      if (_undoInProgress) return;
      _dirty = true;
      debouncedSave();
      updateCharStats();
      debouncedPreview();
    });

    // ── Meta 标签 ──
    _metaLabel.addEventListener('input', () => {
      const n = TreeMgr.findNode(_currentId);
      if (!n) return;
      n.label = _metaLabel.value;
      const row = document.querySelector(`.tree-node[data-id="${_currentId}"] .tree-label`);
      if (row) row.textContent = n.label || '(无标签)';
      TreeMgr.persistMeta();
      updateCharStats();
    });
    _metaComment.addEventListener('input', () => {
      const n = TreeMgr.findNode(_currentId);
      if (!n) return;
      n.comment = n.comment = _metaComment.value;

      const row = document.querySelector(`.tree-node[data-id="${_currentId}"] .tree-node-row`);
      if (row) {
        let cmtEl = row.querySelector('.tree-comment');
        if (n.comment) {
          if (!cmtEl) {
            cmtEl = document.createElement('span');
            cmtEl.className = 'tree-comment';
            const visBtn = row.querySelector('.tree-vis-btn');
            row.insertBefore(cmtEl, visBtn);
          }
          cmtEl.textContent = n.comment;
        } else {
          if (cmtEl) cmtEl.remove();
        }
      }

      TreeMgr.persistMeta();
      updateCharStats();
    });

    // ── Tab 缩进 ──
    _textarea.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: end, value: v } = _textarea;
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const line = v.substring(lineStart, end);
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
      }
    });

    // ── MD Toolbar ──
    document.getElementById('md-toolbar').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      handleToolbarAction(btn.dataset.action);
    });

    // ── Full preview ──
    document.getElementById('btn-full-preview').addEventListener('click', openFullPreview);
    document.getElementById('full-preview-close').addEventListener('click', () =>
      document.getElementById('modal-full-preview').classList.add('hidden'));
    document.getElementById('modal-full-preview').addEventListener('click', e => {
      if (e.target === e.currentTarget)
        document.getElementById('modal-full-preview').classList.add('hidden');
    });

    // ── Node actions ──
    document.getElementById('btn-delete-node').addEventListener('click', () => {
      if (!_currentId) return;
      if (confirm('确定删除此节点？')) TreeMgr.deleteNode(_currentId);
    });
    document.getElementById('btn-add-child').addEventListener('click', () => {
      if (_currentId) TreeMgr.addNode(_currentId);
    });
    document.getElementById('btn-add-sibling').addEventListener('click', () => {
      addSiblingNode();
    });

    // ── Drag-drop code files ──
    _textarea.addEventListener('dragover', e => e.preventDefault());
    _textarea.addEventListener('drop', e => handleCodeDrop(e));

    // ── 分割线拖动 + 滚动同步 ──
    initEditorPreviewDivider();
    initScrollSync();
  }

  /* ── Load node ── */
  async function loadNode(id) {
    if (_currentId && _dirty) await saveCurrentNode();
    _currentId = id;
    _dirty = false;
    _contentUndoStack = _contentUndoStack.filter(e => e.id === id);
    _contentRedoStack = [];
    const node = TreeMgr.findNode(id);
    if (!node) return;
    _metaLabel.value   = node.label   || '';
    _metaComment.value = node.comment || '';
    const content = await StorageMgr.loadNodeContent(id);
    _lastSavedValue = content;
    _textarea.value = content;
    renderPreview();
    updateCharStats();
  }

  /* ── Save ── */
  async function saveCurrentNode() {
    if (!_currentId) return;
    const content = _textarea.value;
    const node = TreeMgr.findNode(_currentId);
    if (!node) return;
    try {
      await StorageMgr.saveNodeContent(_currentId, content);
      _lastSavedValue = content;
      _dirty = false;
      showMsg('已保存');
    } catch (err) {
      showMsg('⚠ ' + err.message, true);
    }
    updateCharStats();
    await checkQuota();
  }

  function saveImmediately() {
    debouncedSave.cancel();
    saveCurrentNode();
  }

  /* ── 获取节点深度（根节点为1）── */
  function getNodeDepth(targetId, nodes = TreeMgr.tree, depth = 1) {
    for (const n of nodes) {
      if (n.id === targetId) return depth;
      const found = getNodeDepth(targetId, n.children, depth + 1);
      if (found) return found;
    }
    return 0;
  }

  /* ── Stats ── */
  function updateCharStats() {
    const v = _textarea.value;

    // 当前节点：正文 + 标签行 + 注释行
    const curNode = TreeMgr.findNode(_currentId);
    let curTotal = v.length;
    if (curNode) {
      const depth = getNodeDepth(_currentId) || 1;
      const hashes = '#'.repeat(Math.min(depth, 6));
      if (curNode.label)   curTotal += (hashes + ' ' + curNode.label + '\n').length;
      if (curNode.comment) curTotal += ('> ' + curNode.comment + '\n').length;
    }

    document.getElementById('stat-chars-node').textContent  = '当前节点: ' + curTotal;
    document.getElementById('stat-tokens-node').textContent = '当前Token≈: ' + estimateTokens(' '.repeat(curTotal));

    // 立即触发全局统计（不用 requestIdleCallback，确保隐藏/删除后马上更新）
    _calcTotalStats(v);
  }

  /* ── 全局字符/Token统计（跳过隐藏节点） ── */
  async function _calcTotalStats(currentValue) {
    const hidden = TreeMgr.hidden;
    let totalChars = 0;

    async function walk(nodes, depth) {
      for (const n of nodes) {
        // 跳过隐藏节点及其整个子树
        if (hidden.has(n.id)) continue;

        const hashes = '#'.repeat(Math.min(depth, 6));
        totalChars += (hashes + ' ' + (n.label || '') + '\n').length;
        if (n.comment) totalChars += ('> ' + n.comment + '\n').length;

        const content = n.id === _currentId
          ? currentValue
          : await StorageMgr.loadNodeContent(n.id);
        if (content) totalChars += (content + '\n').length;

        if (n.children && n.children.length) await walk(n.children, depth + 1);
      }
    }

    await walk(TreeMgr.tree, 1);

    document.getElementById('stat-chars-total').textContent  = '总字符: ' + totalChars;
    document.getElementById('stat-tokens-total').textContent = '总Token≈: ' + estimateTokens(' '.repeat(totalChars));
  }

  /* ── Preview ── */
  function renderPreview() {
    _preview.innerHTML = mdToHtml(_textarea.value);
  }

  /* ── 全篇预览（跳过隐藏节点） ── */
  async function openFullPreview() {
    const modal     = document.getElementById('modal-full-preview');
    const container = document.getElementById('full-preview-content');
    container.innerHTML = '<p style="color:var(--text-dim)">加载中…</p>';
    modal.classList.remove('hidden');

    if (_dirty) await saveCurrentNode();

    const lines = [];
    async function walk(nodes, depth) {
      for (const n of nodes) {
        if (TreeMgr.hidden.has(n.id)) continue;
        const hashes = '#'.repeat(Math.min(depth, 6));
        lines.push(`${hashes} ${n.label || '(无标签)'}`);
        if (n.comment) lines.push(`> ${n.comment}`);
        const content = await StorageMgr.loadNodeContent(n.id);
        if (content) lines.push('', content, '');
        if (n.children && n.children.length) await walk(n.children, depth + 1);
      }
    }
    try {
      await walk(TreeMgr.tree, 1);
      container.innerHTML = mdToHtml(lines.join('\n')) || '<p style="color:var(--text-dim)">（暂无内容）</p>';
    } catch (err) {
      container.innerHTML = `<p style="color:#f87171">渲染失败: ${err.message}</p>`;
    }
  }

  /* ── Sibling node ── */
  function addSiblingNode() {
    if (!_currentId) { TreeMgr.addNode(null); return; }
    const parent = TreeMgr.findParent(_currentId);
    if (parent) TreeMgr.addNode(parent.id);
    else TreeMgr.addNode(null);
  }

  /* ── Toolbar actions ── */
  function handleToolbarAction(action) {
    if (action === 'table') { openTableModal(); return; }
    const ta = _textarea;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.substring(s, e);
    let before = '', after = '', defaultSel = '';

    switch (action) {
      case 'bold':       before = '**';      after = '**';       defaultSel = '粗体文字'; break;
      case 'italic':     before = '*';       after = '*';        defaultSel = '斜体文字'; break;
      case 'code':       before = '`';       after = '`';        defaultSel = 'code';     break;
      case 'codeblock':  before = '```\n';   after = '\n```';    defaultSel = '代码';     break;
      case 'ul':         before = '\n- ';    after = '';         defaultSel = '列表项';   break;
      case 'ol':         before = '\n1. ';   after = '';         defaultSel = '列表项';   break;
      case 'link':       before = '[';       after = '](url)';   defaultSel = '链接文本'; break;
      case 'image':      before = '![';      after = '](url)';   defaultSel = 'alt';      break;
      case 'blockquote': before = '\n> ';    after = '';         defaultSel = '引用内容'; break;
      case 'strike':     before = '~~';      after = '~~';       defaultSel = '删除文字'; break;
      case 'sup':        before = '<sup>';   after = '</sup>';   defaultSel = '上标';     break;
      case 'sub':        before = '<sub>';   after = '</sub>';   defaultSel = '下标';     break;
      case 'hr':         before = '\n---\n'; after = '';         defaultSel = '';         break;
    }
    pushContentUndo(_currentId, _textarea.value);
    const insert = before + (sel || defaultSel) + after;
    ta.setRangeText(insert, s, e, 'select');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  function openTableModal() {
    document.getElementById('modal-table').classList.remove('hidden');
  }

  function insertTable(rows, cols) {
    const header = '| ' + Array(cols).fill(0).map((_, i) => '列' + (i + 1)).join(' | ') + ' |';
    const sep    = '| ' + Array(cols).fill('---').join(' | ') + ' |';
    const row    = '| ' + Array(cols).fill('  ').join(' | ') + ' |';
    const table  = [header, sep, ...Array(rows).fill(row)].join('\n') + '\n';
    const ta = _textarea;
    pushContentUndo(_currentId, ta.value);
    const pos = ta.selectionStart;
    ta.setRangeText('\n' + table, pos, pos, 'end');
    ta.dispatchEvent(new Event('input'));
  }

  /* ── Code file drag-drop ── */
  const CODE_EXTS = new Set(['java','py','js','ts','cpp','c','h','cs','go','rs','rb','php',
    'swift','kt','scala','html','css','sh','bash','sql','json','yaml','yml','xml','md']);

  async function handleCodeDrop(e) {
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

  /* ── Quota check ── */
  async function checkQuota() {
    const { size, warn, critical } = await StorageMgr.checkQuota();
    const el = document.getElementById('stat-storage');
    const mb = (size / 1024 / 1024).toFixed(2);
    el.textContent = `IDB: ${mb} MB`;
    el.className = 'storage-info' + (critical ? ' critical' : warn ? ' warn' : '');
    if (critical) window.CleanupMgr && window.CleanupMgr.forceOpen(size);
  }

  /* ── Status message ── */
  function showMsg(msg, isError = false) {
    const el = document.getElementById('stat-msg');
    el.textContent = msg;
    el.style.color = isError ? '#f87171' : '#6ee7b7';
    el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = 'fadeout 3s ease forwards'; });
  }

  return {
    init, loadNode, saveCurrentNode, saveImmediately, insertTable,
    showMsg, checkQuota, openFullPreview, addSiblingNode,
    contentUndo, contentRedo,
    updateCharStats,   // 暴露给 TreeMgr 调用（隐藏/删除节点后触发）
    get currentId() { return _currentId; }
  };
})();

window.EditorMgr = EditorMgr;