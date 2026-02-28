/**
 * Function (功能): 
 *   - 多格式导出：JSON（完整数据）、MD/YAML/XML（跳过隐藏节点）、TXT（纯文本/带符号）、Word（富文本）
 *   - 导入功能：JSON（保留隐藏状态）、Markdown（自动解析层级）
 *   - 导入模式选择（追加/覆盖）、TXT 导出模式选择对话框动态创建
 * Dependencies (依赖): 
 *   - tree.js (TreeMgr, 获取树结构与隐藏集合)
 *   - storage.js (StorageMgr, 加载节点内容)
 *   - editor.js (EditorMgr, 显示消息、插入表格回调)
 */

'use strict';

/* ── Timestamp (Beijing time) ── */
function bjTimestamp() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function filename(ext) { return `Prompt_${bjTimestamp()}.${ext}`; }

/* ── Download helper ── */
function download(content, fname, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ── JSON ── */
async function exportJSON() {
  const hidden = TreeMgr.hidden;
  async function attach(nodes) {
    const out = [];
    for (const n of nodes) {
      const content = await StorageMgr.loadNodeContent(n.id);
      out.push({
        ...n,
        content,
        hidden: hidden.has(n.id) || undefined,
        children: await attach(n.children)
      });
    }
    return out;
  }
  const withContent = await attach(TreeMgr.tree);
  download(JSON.stringify(withContent, null, 2), filename('json'), 'application/json');
}

/* ── Markdown (skip hidden) ── */
async function exportMD() {
  const hidden = TreeMgr.hidden;
  const lines = [];
  async function walk(nodes, depth) {
    for (const n of nodes) {
      if (hidden.has(n.id)) continue;
      const hashes = '#'.repeat(Math.min(depth, 6));
      lines.push(`${hashes} ${n.label}`);
      if (n.comment) lines.push(`> ${n.comment}`);
      const content = await StorageMgr.loadNodeContent(n.id);
      if (content) lines.push('', content, '');
      if (n.children.length) await walk(n.children, depth + 1);
    }
  }
  await walk(TreeMgr.tree, 1);
  download(lines.join('\n'), filename('md'));
}

/* ── TXT (skip hidden) ── */
/**
 * keepMd=true  → 保留 markdown 符号（与 .md 基本一致，仅后缀不同）
 * keepMd=false → 去除 markdown 符号，输出纯文本
 */
async function exportTXT(keepMd) {
  const hidden = TreeMgr.hidden;
  const lines = [];

  /** 将 markdown 内联标记替换为纯文本 */
  function stripInline(text) {
    return text
      // 去除 bold+italic ***...*** / ___...___
      .replace(/\*{3}(.+?)\*{3}/g, '$1')
      .replace(/_{3}(.+?)_{3}/g, '$1')
      // 去除 bold **...** / __...__
      .replace(/\*{2}(.+?)\*{2}/g, '$1')
      .replace(/_{2}(.+?)_{2}/g, '$1')
      // 去除 italic *...* / _..._
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // 去除 inline code `...`
      .replace(/`(.+?)`/g, '$1')
      // 去除 strikethrough ~~...~~
      .replace(/~~(.+?)~~/g, '$1')
      // 去除 links [text](url)
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      // 去除 blockquote 行前 >
      .replace(/^>\s?/gm, '');
  }

  /** 去除整段内容中的 markdown 符号（含块级元素） */
  function stripBlock(text) {
    return text
      .split('\n')
      .map(line => {
        // 去除标题 #
        line = line.replace(/^#{1,6}\s+/, '');
        // 去除无序列表符号
        line = line.replace(/^(\s*)[*\-+]\s+/, '$1');
        // 去除有序列表编号
        line = line.replace(/^(\s*)\d+\.\s+/, '$1');
        // 去除代码块围栏
        line = line.replace(/^```.*$/, '');
        // 去除水平线
        line = line.replace(/^[-*_]{3,}$/, '');
        return stripInline(line);
      })
      .join('\n');
  }

  async function walk(nodes, depth) {
    for (const n of nodes) {
      if (hidden.has(n.id)) continue;
      if (keepMd) {
        const hashes = '#'.repeat(Math.min(depth, 6));
        lines.push(`${hashes} ${n.label}`);
        if (n.comment) lines.push(`> ${n.comment}`);
      } else {
        const indent = '  '.repeat(depth - 1);
        lines.push(`${indent}${n.label}`);
        if (n.comment) lines.push(`${indent}  ${n.comment}`);
      }
      const content = await StorageMgr.loadNodeContent(n.id);
      if (content) {
        const out = keepMd ? content : stripBlock(content);
        lines.push('', out, '');
      }
      if (n.children.length) await walk(n.children, depth + 1);
    }
  }
  await walk(TreeMgr.tree, 1);
  download(lines.join('\n'), filename('txt'));
}

/* ── YAML (skip hidden) ── */
async function exportYAML() {
  const hidden = TreeMgr.hidden;
  const lines = [];
  async function walk(nodes, indent) {
    for (const n of nodes) {
      if (hidden.has(n.id)) continue;
      const content = (await StorageMgr.loadNodeContent(n.id) || '').replace(/\n/g, '\\n');
      lines.push(`${indent}- label: ${yamlStr(n.label)}`);
      if (n.comment) lines.push(`${indent}  comment: ${yamlStr(n.comment)}`);
      if (content)   lines.push(`${indent}  content: "${content}"`);
      if (n.children.length) {
        lines.push(`${indent}  children:`);
        await walk(n.children, indent + '    ');
      }
    }
  }
  await walk(TreeMgr.tree, '');
  download(lines.join('\n'), filename('yaml'));
}
function yamlStr(s) { return `"${(s||'').replace(/"/g,'\\"')}"`; }

/* ── XML (skip hidden) ── */
function safeTag(s) { return (s || 'node').replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/^[^a-zA-Z_]/, '_$&'); }
async function exportXML() {
  const hidden = TreeMgr.hidden;
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<document>'];
  async function walk(nodes, indent) {
    for (const n of nodes) {
      if (hidden.has(n.id)) continue;
      const tag = safeTag(n.label);
      const content = await StorageMgr.loadNodeContent(n.id);
      const comment = n.comment ? ` comment="${xmlEsc(n.comment)}"` : '';
      if (n.children.length) {
        lines.push(`${indent}<${tag}${comment}>`);
        if (content) lines.push(`${indent}  <content><![CDATA[${content}]]></content>`);
        await walk(n.children, indent + '  ');
        lines.push(`${indent}</${tag}>`);
      } else {
        lines.push(`${indent}<${tag}${comment}><![CDATA[${content || ''}]]></${tag}>`);
      }
    }
  }
  await walk(TreeMgr.tree, '  ');
  lines.push('</document>');
  download(lines.join('\n'), filename('xml'), 'application/xml');
}
function xmlEsc(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Markdown → HTML inline renderer (for Word export) ── */
/**
 * 将 markdown 内联/块标记转换为 HTML，使 Word 粘贴后能识别真实样式。
 * 处理范围：
 *   块级：# 标题1-6、> 引用、``` 代码块、--- 水平线、有序/无序列表
 *   内联：***粗斜体*** **粗体** *斜体* `code` ~~删除线~~ [link](url)
 * 
 * Renamed from mdToHtml to mdToHtmlForWord to avoid conflict with editor.js
 */
function mdToHtmlForWord(text, baseIndent = 0) {
  const indStyle = baseIndent ? `margin-left:${baseIndent}px;` : '';
  const lines = text.split('\n');
  const out = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines = [];
  let inBlockquote = false;
  let bqLines = [];

  function flushBQ() {
    if (!inBlockquote) return;
    inBlockquote = false;
    out.push(`<blockquote style="${indStyle}border-left:3px solid #4f8ef7;padding-left:8px;color:#555;margin:4px 0;">${bqLines.join('<br>')}</blockquote>`);
    bqLines = [];
  }
  function flushCode() {
    if (!inCodeBlock) return;
    inCodeBlock = false;
    const escaped = codeLines.join('\n').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // Fixed: 使用深色背景和高对比度文字，与 editor.js 预览保持一致
    out.push(`<pre style="${indStyle}background:#1e2028;padding:10px;border-radius:6px;font-family:Consolas,monospace;font-size:10pt;white-space:pre-wrap;color:#e0e7ff;border:1px solid rgba(255,255,255,0.1);">${escaped}</pre>`);
    codeLines = [];
  }

  /** 处理内联 markdown */
  function inline(s) {
    s = s
      // 转义 HTML 特殊字符（先转，避免后续标签被转义）
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // 粗斜体
      .replace(/\*{3}(.+?)\*{3}/g, '<b><i>$1</i></b>')
      .replace(/_{3}(.+?)_{3}/g,   '<b><i>$1</i></b>')
      // 粗体
      .replace(/\*{2}(.+?)\*{2}/g, '<b>$1</b>')
      .replace(/_{2}(.+?)_{2}/g,   '<b>$1</b>')
      // 斜体
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/_(.+?)_/g,   '<i>$1</i>')
      // 删除线
      .replace(/~~(.+?)~~/g, '<s>$1</s>')
      // 行内代码
      .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 3px;font-family:Consolas,monospace;color:#ffd760;">$1</code>')
      // 链接
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    return s;
  }

  for (const raw of lines) {
    // 代码块围栏
    if (raw.match(/^```/)) {
      if (!inCodeBlock) {
        flushBQ();
        inCodeBlock = true;
        codeLang = raw.slice(3).trim();
        codeLines = [];
      } else {
        flushCode();
      }
      continue;
    }
    if (inCodeBlock) { codeLines.push(raw); continue; }

    // 引用块
    const bqM = raw.match(/^>\s?(.*)/);
    if (bqM) {
      if (!inBlockquote) inBlockquote = true;
      bqLines.push(inline(bqM[1]));
      continue;
    } else {
      flushBQ();
    }

    // 标题
    const hm = raw.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      const level = hm[1].length;
      const hSize = [24, 20, 16, 14, 13, 12][level - 1];
      out.push(`<h${level} style="${indStyle}font-family:宋体;font-size:${hSize}pt;margin:6px 0 2px;">${inline(hm[2])}</h${level}>`);
      continue;
    }

    // 水平线
    if (raw.match(/^[-*_]{3,}$/)) {
      out.push(`<hr style="border:none;border-top:1px solid #ccc;margin:6px 0;">`);
      continue;
    }

    // 有序列表
    const olM = raw.match(/^(\s*)\d+\.\s+(.*)/);
    if (olM) {
      out.push(`<p style="${indStyle}margin:1px 0;margin-left:${baseIndent + olM[1].length * 10 + 16}px;text-indent:-16px;">${inline(olM[2])}</p>`);
      continue;
    }

    // 无序列表
    const ulM = raw.match(/^(\s*)[*\-+]\s+(.*)/);
    if (ulM) {
      out.push(`<p style="${indStyle}margin:1px 0;margin-left:${baseIndent + ulM[1].length * 10 + 14}px;text-indent:-14px;">• ${inline(ulM[2])}</p>`);
      continue;
    }

    // 普通行
    const trimmed = raw.trim();
    if (trimmed === '') {
      out.push(`<br>`);
    } else {
      out.push(`<p style="${indStyle}margin:1px 0;font-family:宋体;font-size:11pt;line-height:1.6;">${inline(raw)}</p>`);
    }
  }
  flushBQ();
  flushCode();
  return out.join('');
}

/* ── Word (skip hidden, rich markdown styles) ── */
async function exportWord() {
  const hidden = TreeMgr.hidden;
  const lines = [];

  async function walk(nodes, depth) {
    for (const n of nodes) {
      if (hidden.has(n.id)) continue;
      const level = Math.min(depth + 1, 6);
      const fs = Math.max(14, 22 - depth * 2);
      const indent = depth * 20;
      // 节点标题 → Word 标题样式（h1-h6）
      lines.push(`<h${level} style="font-family:宋体;font-size:${fs}pt;margin-left:${indent}px;margin-top:8px;margin-bottom:2px;">${xmlEsc(n.label)}</h${level}>`);
      if (n.comment) {
        lines.push(`<p style="color:#666;font-size:10pt;margin-left:${indent}px;font-style:italic;margin:2px 0;">${xmlEsc(n.comment)}</p>`);
      }
      const content = await StorageMgr.loadNodeContent(n.id);
      if (content) {
        // 将 markdown 转为带样式的 HTML (使用重命名后的函数)
        lines.push(`<div style="margin-left:${indent}px;">${mdToHtmlForWord(content, 0)}</div>`);
      }
      if (n.children.length) await walk(n.children, depth + 1);
    }
  }
  await walk(TreeMgr.tree, 0);

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:宋体;font-size:11pt;}
    h1,h2,h3,h4,h5,h6{font-family:宋体;}
    pre{white-space:pre-wrap;font-family:Consolas,monospace;}
  </style></head><body>${lines.join('')}</body></html>`;

  let copied = false;
  try {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
    copied = true;
  } catch {}

  if (!copied) {
    try {
      const div = document.createElement('div');
      div.contentEditable = 'true';
      div.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      div.innerHTML = htmlContent;
      document.body.appendChild(div);
      const range = document.createRange();
      range.selectNodeContents(div);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
      document.body.removeChild(div);
      copied = true;
    } catch {}
  }
  EditorMgr.showMsg(copied ? '已复制富文本，粘贴到 Word 即可' : '复制失败，请手动复制', !copied);
}

/* ── TXT mode dialog ── */
/**
 * 弹出"保留 / 不保留 markdown 符号"选择框，返回 Promise<'keep'|'strip'|null>
 */
function askTxtMode() {
  return new Promise(resolve => {
    let modal = document.getElementById('modal-txt-mode');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-txt-mode';
      modal.className = 'modal hidden';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:360px">
          <h3 style="margin:0 0 8px;font-size:15px;">导出 TXT</h3>
          <p style="margin:0 0 20px;color:var(--text-dim);font-size:13px;line-height:1.6;">
            <strong>保留符号</strong>：保留 <code>#</code> <code>**</code> 等 Markdown 标记。<br><br>
            <strong>纯文本</strong>：去除所有 Markdown 符号，输出干净的纯文本。
          </p>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button id="txt-mode-cancel" class="btn-secondary">取消</button>
            <button id="txt-mode-strip"  class="btn-secondary">纯文本</button>
            <button id="txt-mode-keep"   class="btn-primary"  >保留符号</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    function cleanup(result) {
      modal.classList.add('hidden');
      document.getElementById('txt-mode-cancel').onclick = null;
      document.getElementById('txt-mode-strip') .onclick = null;
      document.getElementById('txt-mode-keep')  .onclick = null;
      resolve(result);
    }
    document.getElementById('txt-mode-cancel').onclick = () => cleanup(null);
    document.getElementById('txt-mode-strip') .onclick = () => cleanup('strip');
    document.getElementById('txt-mode-keep')  .onclick = () => cleanup('keep');
  });
}

/* ── Import Mode Dialog ── */
function askImportMode(filename) {
  return new Promise(resolve => {
    let modal = document.getElementById('modal-import-mode');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-import-mode';
      modal.className = 'modal hidden';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:360px">
          <h3 id="import-mode-title" style="margin:0 0 8px;font-size:15px;"></h3>
          <p id="import-mode-desc" style="margin:0 0 20px;color:var(--text-dim);font-size:13px;line-height:1.6;"></p>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button id="import-mode-cancel"    class="btn-secondary">取消</button>
            <button id="import-mode-append"    class="btn-secondary">追加节点</button>
            <button id="import-mode-overwrite" class="btn-danger"   >覆盖全部</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('import-mode-title').textContent = `导入文件：${filename}`;
    document.getElementById('import-mode-desc').innerHTML =
      '<strong>追加节点</strong>：将导入内容作为新节点追加到现有树的末尾，原内容保留。<br><br>' +
      '<strong>覆盖全部</strong>：清空当前所有节点，用导入内容替换，<strong>原内容将丢失</strong>。';
    modal.classList.remove('hidden');
    function cleanup(result) {
      modal.classList.add('hidden');
      document.getElementById('import-mode-cancel')   .onclick = null;
      document.getElementById('import-mode-append')   .onclick = null;
      document.getElementById('import-mode-overwrite').onclick = null;
      resolve(result);
    }
    document.getElementById('import-mode-cancel')   .onclick = () => cleanup(null);
    document.getElementById('import-mode-append')   .onclick = () => cleanup('append');
    document.getElementById('import-mode-overwrite').onclick = () => cleanup('overwrite');
  });
}

/* ── Import JSON (restore hidden state) ── */
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
    TreeMgr.setTree([]);
    for (const id of oldIds) await StorageMgr.deleteNodeContent(id);
    TreeMgr.hidden.clear();
    TreeMgr.setTree(newNodes);
  } else {
    TreeMgr.tree.push(...newNodes);
  }

  for (const id of newHiddenIds) TreeMgr.hidden.add(id);
  localStorage.setItem('md_hidden', JSON.stringify([...TreeMgr.hidden]));

  TreeMgr._finalizeTreeSnapshot();
  TreeMgr.renderTree();
  TreeMgr.persistMeta();
  EditorMgr.showMsg(mode === 'overwrite' ? '已覆盖导入' : '已追加导入');
}

/* ── Import Markdown ── */
async function importMD(text, mode) {
  TreeMgr._snapshotTree('import-md');

  const lines = text.split('\n');
  const root = [];
  const stack = [{ children: root, depth: 0 }];
  let currentNode = null;
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
      const label = hm[2].trim();
      const node = TreeMgr.makeNode(label);
      currentNode = node;
      while (stack.length > 1 && stack[stack.length-1].depth >= depth) stack.pop();
      stack[stack.length-1].children.push(node);
      stack.push({ children: node.children, depth, node });
    } else if (currentNode) {
      const bq = line.match(/^> (.*)$/);
      if (bq && contentLines.every(l => l.trim() === '')) {
        currentNode.comment = bq[1].trim();
        contentLines = [];
      } else {
        contentLines.push(line);
      }
    }
  }
  await flushContent();

  if (mode === 'overwrite') {
    const oldIds = TreeMgr.allIds();
    TreeMgr.setTree([]);
    for (const id of oldIds) await StorageMgr.deleteNodeContent(id);
    TreeMgr.hidden.clear();
    localStorage.setItem('md_hidden', '[]');
    TreeMgr.setTree(root);
  } else {
    TreeMgr.tree.push(...root);
  }

  TreeMgr._finalizeTreeSnapshot();
  TreeMgr.renderTree();
  TreeMgr.persistMeta();
  EditorMgr.showMsg(mode === 'overwrite' ? '已覆盖导入' : '已追加导入');
}

/* ── Init ── */
function initExport() {
  const toggle = document.getElementById('btn-export-toggle');
  const menu   = document.getElementById('export-menu');
  toggle.addEventListener('click', () => menu.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('open');
  });

  menu.addEventListener('click', async e => {
    const fmt = e.target.dataset.fmt;
    if (!fmt) return;
    menu.classList.remove('open');
    switch (fmt) {
      case 'json':  await exportJSON(); break;
      case 'md':    await exportMD();   break;
      case 'txt': {
        const mode = await askTxtMode();
        if (mode) await exportTXT(mode === 'keep');
        break;
      }
      case 'yaml':  await exportYAML(); break;
      case 'xml':   await exportXML();  break;
      case 'word':  await exportWord(); break;
    }
  });

  document.getElementById('btn-import').addEventListener('click', () =>
    document.getElementById('import-file').click());

  document.getElementById('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const mode = await askImportMode(file.name);
    if (!mode) { e.target.value = ''; return; }
    const text = await file.text();
    if (file.name.endsWith('.json')) await importJSON(text, mode);
    else await importMD(text, mode);
    e.target.value = '';
  });

  document.getElementById('tbl-confirm').addEventListener('click', () => {
    const rows = parseInt(document.getElementById('tbl-rows').value) || 3;
    const cols = parseInt(document.getElementById('tbl-cols').value) || 3;
    EditorMgr.insertTable(rows, cols);
    document.getElementById('modal-table').classList.add('hidden');
  });
  document.getElementById('tbl-cancel').addEventListener('click', () =>
    document.getElementById('modal-table').classList.add('hidden'));
}

window.ExportMgr = { initExport, exportJSON, exportMD, exportTXT, exportYAML, exportXML, exportWord };