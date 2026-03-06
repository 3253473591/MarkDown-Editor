/**
 * Function: 多格式导出
 *   - JSON / Markdown / TXT / YAML / XML / Word（富文本复制）
 *   - 所有导出跳过隐藏节点（JSON 除外，JSON 保留全部含隐藏标记）
 * Dependencies: storage.js, tree.js, editor.js (showMsg)
 */
'use strict';

const Exporters = (() => {

  /* ── Timestamp ── */
  function _bjTimestamp() {
    const d   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }
  function _fname(ext) { return `Prompt_${_bjTimestamp()}.${ext}`; }

  /* ── Download ── */
  function _download(content, fname, mime = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = fname; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ── XML escape ── */
  function _xmlEsc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function _yamlStr(s) { return `"${(s||'').replace(/"/g,'\\"')}"`; }
  function _safeTag(s) { return (s||'node').replace(/[^a-zA-Z0-9_\-\.]/g,'_').replace(/^[^a-zA-Z_]/,'_$&'); }

  /* ──────────── JSON ──────────── */
  async function exportJSON() {
    const hidden = TreeMgr.hidden;
    async function attach(nodes) {
      const out = [];
      for (const n of nodes) {
        const content = await StorageMgr.loadNodeContent(n.id);
        out.push({ ...n, content, hidden: hidden.has(n.id) || undefined, children: await attach(n.children) });
      }
      return out;
    }
    _download(JSON.stringify(await attach(TreeMgr.tree), null, 2), _fname('json'), 'application/json');
  }

  /* ──────────── Markdown ──────────── */
  async function exportMD() {
    const hidden = TreeMgr.hidden;
    const lines  = [];
    async function walk(nodes, depth) {
      for (const n of nodes) {
        if (hidden.has(n.id)) continue;
        lines.push(`${'#'.repeat(Math.min(depth,6))} ${n.label}`);
        if (n.comment) lines.push(`> ${n.comment}`);
        const c = await StorageMgr.loadNodeContent(n.id);
        if (c) lines.push('', c, '');
        if (n.children.length) await walk(n.children, depth + 1);
      }
    }
    await walk(TreeMgr.tree, 1);
    _download(lines.join('\n'), _fname('md'));
  }

  /* ──────────── TXT ──────────── */
  async function exportTXT(keepMd) {
    const hidden = TreeMgr.hidden;
    const lines  = [];

    function stripInline(text) {
      return text
        .replace(/\*{3}(.+?)\*{3}/g,'$1').replace(/_{3}(.+?)_{3}/g,'$1')
        .replace(/\*{2}(.+?)\*{2}/g,'$1').replace(/_{2}(.+?)_{2}/g,'$1')
        .replace(/\*(.+?)\*/g,'$1').replace(/_(.+?)_/g,'$1')
        .replace(/`(.+?)`/g,'$1').replace(/~~(.+?)~~/g,'$1')
        .replace(/\[(.+?)\]\(.+?\)/g,'$1').replace(/^>\s?/gm,'');
    }
    function stripBlock(text) {
      return text.split('\n').map(line =>
        stripInline(line
          .replace(/^#{1,6}\s+/,'')
          .replace(/^(\s*)[*\-+]\s+/,'$1')
          .replace(/^(\s*)\d+\.\s+/,'$1')
          .replace(/^```.*$/,'')
          .replace(/^[-*_]{3,}$/,''))
      ).join('\n');
    }

    async function walk(nodes, depth) {
      for (const n of nodes) {
        if (hidden.has(n.id)) continue;
        if (keepMd) {
          lines.push(`${'#'.repeat(Math.min(depth,6))} ${n.label}`);
          if (n.comment) lines.push(`> ${n.comment}`);
        } else {
          const indent = '  '.repeat(depth - 1);
          lines.push(`${indent}${n.label}`);
          if (n.comment) lines.push(`${indent}  ${n.comment}`);
        }
        const c = await StorageMgr.loadNodeContent(n.id);
        if (c) { lines.push('', keepMd ? c : stripBlock(c), ''); }
        if (n.children.length) await walk(n.children, depth + 1);
      }
    }
    await walk(TreeMgr.tree, 1);
    _download(lines.join('\n'), _fname('txt'));
  }

  /* ──────────── YAML ──────────── */
  async function exportYAML() {
    const hidden = TreeMgr.hidden;
    const lines  = [];
    async function walk(nodes, indent) {
      for (const n of nodes) {
        if (hidden.has(n.id)) continue;
        const c = (await StorageMgr.loadNodeContent(n.id) || '').replace(/\n/g,'\\n');
        lines.push(`${indent}- label: ${_yamlStr(n.label)}`);
        if (n.comment) lines.push(`${indent}  comment: ${_yamlStr(n.comment)}`);
        if (c)         lines.push(`${indent}  content: "${c}"`);
        if (n.children.length) { lines.push(`${indent}  children:`); await walk(n.children, indent + '    '); }
      }
    }
    await walk(TreeMgr.tree, '');
    _download(lines.join('\n'), _fname('yaml'));
  }

  /* ──────────── XML ──────────── */
  async function exportXML() {
    const hidden = TreeMgr.hidden;
    const lines  = ['<?xml version="1.0" encoding="UTF-8"?>', '<document>'];
    async function walk(nodes, indent) {
      for (const n of nodes) {
        if (hidden.has(n.id)) continue;
        const tag     = _safeTag(n.label);
        const c       = await StorageMgr.loadNodeContent(n.id);
        const comment = n.comment ? ` comment="${_xmlEsc(n.comment)}"` : '';
        if (n.children.length) {
          lines.push(`${indent}<${tag}${comment}>`);
          if (c) lines.push(`${indent}  <content><![CDATA[${c}]]></content>`);
          await walk(n.children, indent + '  ');
          lines.push(`${indent}</${tag}>`);
        } else {
          lines.push(`${indent}<${tag}${comment}><![CDATA[${c||''}]]></${tag}>`);
        }
      }
    }
    await walk(TreeMgr.tree, '  ');
    lines.push('</document>');
    _download(lines.join('\n'), _fname('xml'), 'application/xml');
  }

  /* ──────────── Word ──────────── */
  function _mdToHtmlForWord(text, baseIndent = 0) {
    const indStyle = baseIndent ? `margin-left:${baseIndent}px;` : '';
    const lines = text.split('\n');
    const out   = [];
    let inCode = false, codeLang = '', codeLines = [];
    let inBQ   = false, bqLines = [];

    function flushBQ() {
      if (!inBQ) return; inBQ = false;
      out.push(`<blockquote style="${indStyle}border-left:3px solid #4f8ef7;padding-left:8px;color:#555;margin:4px 0;">${bqLines.join('<br>')}</blockquote>`);
      bqLines = [];
    }
    function flushCode() {
      if (!inCode) return; inCode = false;
      const escaped = codeLines.join('\n').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      out.push(`<pre style="${indStyle}background:#1e2028;padding:10px;border-radius:6px;font-family:Consolas,monospace;font-size:10pt;white-space:pre-wrap;color:#e0e7ff;border:1px solid rgba(255,255,255,0.1);">${escaped}</pre>`);
      codeLines = [];
    }
    function inline(s) {
      return s
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*{3}(.+?)\*{3}/g,'<b><i>$1</i></b>').replace(/_{3}(.+?)_{3}/g,'<b><i>$1</i></b>')
        .replace(/\*{2}(.+?)\*{2}/g,'<b>$1</b>').replace(/_{2}(.+?)_{2}/g,'<b>$1</b>')
        .replace(/\*(.+?)\*/g,'<i>$1</i>').replace(/_(.+?)_/g,'<i>$1</i>')
        .replace(/~~(.+?)~~/g,'<s>$1</s>')
        .replace(/`(.+?)`/g,'<code style="background:rgba(255,255,255,0.1);padding:1px 3px;font-family:Consolas,monospace;color:#ffd760;">$1</code>')
        .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>');
    }

    for (const raw of lines) {
      if (raw.match(/^```/)) {
        if (!inCode) { flushBQ(); inCode = true; codeLang = raw.slice(3).trim(); codeLines = []; }
        else flushCode();
        continue;
      }
      if (inCode) { codeLines.push(raw); continue; }

      const bqM = raw.match(/^>\s?(.*)/);
      if (bqM) { if (!inBQ) inBQ = true; bqLines.push(inline(bqM[1])); continue; }
      else flushBQ();

      const hm = raw.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        const lvl = hm[1].length, fs = [24,20,16,14,13,12][lvl-1];
        out.push(`<h${lvl} style="${indStyle}font-family:宋体;font-size:${fs}pt;margin:6px 0 2px;">${inline(hm[2])}</h${lvl}>`);
        continue;
      }
      if (raw.match(/^[-*_]{3,}$/)) { out.push(`<hr style="border:none;border-top:1px solid #ccc;margin:6px 0;">`); continue; }

      const olM = raw.match(/^(\s*)\d+\.\s+(.*)/);
      if (olM) { out.push(`<p style="${indStyle}margin:1px 0;margin-left:${baseIndent+olM[1].length*10+16}px;text-indent:-16px;">${inline(olM[2])}</p>`); continue; }

      const ulM = raw.match(/^(\s*)[*\-+]\s+(.*)/);
      if (ulM) { out.push(`<p style="${indStyle}margin:1px 0;margin-left:${baseIndent+ulM[1].length*10+14}px;text-indent:-14px;">• ${inline(ulM[2])}</p>`); continue; }

      if (!raw.trim()) { out.push('<br>'); }
      else out.push(`<p style="${indStyle}margin:1px 0;font-family:宋体;font-size:11pt;line-height:1.6;">${inline(raw)}</p>`);
    }
    flushBQ(); flushCode();
    return out.join('');
  }

  async function exportWord() {
    const hidden = TreeMgr.hidden;
    const lines  = [];
    async function walk(nodes, depth) {
      for (const n of nodes) {
        if (hidden.has(n.id)) continue;
        const lvl    = Math.min(depth + 1, 6);
        const fs     = Math.max(14, 22 - depth * 2);
        const indent = depth * 20;
        lines.push(`<h${lvl} style="font-family:宋体;font-size:${fs}pt;margin-left:${indent}px;margin-top:8px;margin-bottom:2px;">${_xmlEsc(n.label)}</h${lvl}>`);
        if (n.comment) lines.push(`<p style="color:#666;font-size:10pt;margin-left:${indent}px;font-style:italic;margin:2px 0;">${_xmlEsc(n.comment)}</p>`);
        const c = await StorageMgr.loadNodeContent(n.id);
        if (c) lines.push(`<div style="margin-left:${indent}px;">${_mdToHtmlForWord(c, 0)}</div>`);
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
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([htmlContent], { type: 'text/html' }) })]);
      copied = true;
    } catch {}
    if (!copied) {
      try {
        const div = Object.assign(document.createElement('div'), {
          contentEditable: 'true',
          innerHTML: htmlContent
        });
        Object.assign(div.style, { position:'fixed', top:'-9999px', left:'-9999px', opacity:'0' });
        document.body.appendChild(div);
        const range = document.createRange(); range.selectNodeContents(div);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        document.execCommand('copy'); sel.removeAllRanges();
        document.body.removeChild(div); copied = true;
      } catch {}
    }
    EditorMgr.showMsg(copied ? '已复制富文本，粘贴到 Word 即可' : '复制失败，请手动复制', !copied);
  }

  return { exportJSON, exportMD, exportTXT, exportYAML, exportXML, exportWord };
})();

window.Exporters = Exporters;