/**
 * Function: 轻量 Markdown → HTML 渲染器（无外部依赖）
 *   - mdToHtml：块级 + 内联完整渲染
 *   - inlinemd：内联标记处理
 * Dependencies: core/utils.js (esc)
 */
'use strict';

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

function mdToHtml(md) {
  if (!md) return '';
  const { esc } = Utils;

  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const getIndent = line => { const m = line.match(/^(\s*)/); return m ? m[1].length : 0; };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
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
    if (/^---+$/.test(line.trim())) { out.push('<hr/>'); i++; continue; }

    // Blockquote
    if (/^> /.test(line)) {
      const bqLines = [];
      while (i < lines.length && /^> /.test(lines[i])) { bqLines.push(lines[i].slice(2)); i++; }
      out.push(`<blockquote>${inlinemd(bqLines.join('<br>'))}</blockquote>`);
      continue;
    }

    // Table
    if (/^\s*\|/.test(line)) {
      const tblLines = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { tblLines.push(lines[i].trim()); i++; }
      if (tblLines.length >= 2) {
        const getCells = row => row.split('|').slice(1, -1).map(c => c.trim());
        const sepLine = tblLines[1];
        const isSep = /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(sepLine) || /^\|[\s\-:|]+\|$/.test(sepLine);
        if (isSep) {
          const hdr  = getCells(tblLines[0]).map(c => `<th>${inlinemd(c)}</th>`).join('');
          const body = tblLines.slice(2).map(r => {
            if (!r.replace(/\|/g, '').trim()) return '';
            return '<tr>' + getCells(r).map(c => `<td>${inlinemd(c)}</td>`).join('') + '</tr>';
          }).filter(Boolean).join('');
          out.push(`<table><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table>`);
          continue;
        }
      }
      out.push(`<p>${esc(tblLines.join('<br>'))}</p>`);
      continue;
    }

    // Unordered list
    if (/^\s*[*\-] /.test(line)) {
      const baseIndent = getIndent(line);
      const items = [];
      while (i < lines.length) {
        const cur = lines[i], curTrim = cur.trim();
        if ((!/^\s*[*\-] /.test(cur) && curTrim !== '') || (curTrim !== '' && getIndent(cur) < baseIndent)) break;
        if (curTrim === '') {
          let peek = i + 1, hasMore = false;
          while (peek < lines.length) {
            const pTrim = lines[peek].trim();
            if (pTrim === '') { peek++; continue; }
            if (/^\s*[*\-] /.test(lines[peek]) && getIndent(lines[peek]) >= baseIndent) { hasMore = true; break; }
            break;
          }
          if (!hasMore) break;
          i++; continue;
        }
        if (getIndent(cur) !== baseIndent) break;
        const content = curTrim.replace(/^[*\-]\s*/, '');
        i++;
        const childLines = _collectChildLines(lines, i, baseIndent);
        i += childLines._consumed;
        items.push(`<li>${inlinemd(content)}${_renderChildLines(childLines)}</li>`);
      }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\s*\d+\. /.test(line)) {
      const baseIndent = getIndent(line);
      const items = [];
      while (i < lines.length) {
        const cur = lines[i], curTrim = cur.trim();
        if ((!/^\s*\d+\. /.test(cur) && curTrim !== '') || (curTrim !== '' && getIndent(cur) < baseIndent)) break;
        if (curTrim === '') {
          let peek = i + 1, hasMore = false;
          while (peek < lines.length) {
            const pTrim = lines[peek].trim();
            if (pTrim === '') { peek++; continue; }
            if (/^\s*\d+\. /.test(lines[peek]) && getIndent(lines[peek]) >= baseIndent) { hasMore = true; break; }
            break;
          }
          if (!hasMore) break;
          i++; continue;
        }
        if (getIndent(cur) !== baseIndent) break;
        const content = curTrim.replace(/^\d+\.\s*/, '');
        i++;
        const childLines = _collectChildLines(lines, i, baseIndent);
        i += childLines._consumed;
        items.push(`<li>${inlinemd(content)}${_renderChildLines(childLines)}</li>`);
      }
      out.push('<ol>' + items.join('') + '</ol>');
      continue;
    }

    // Blank line
    if (line.trim() === '') { out.push('<br>'); i++; continue; }

    // Paragraph
    out.push(`<p>${inlinemd(line)}</p>`);
    i++;
  }
  return out.join('\n');
}

/** 收集子级行（list 嵌套用），返回行数组并携带 _consumed 计数 */
function _collectChildLines(lines, startI, baseIndent) {
  const getIndent = l => { const m = l.match(/^(\s*)/); return m ? m[1].length : 0; };
  const result = [];
  let consumed = 0;
  let idx = startI;
  while (idx < lines.length) {
    const nl = lines[idx], nTrim = nl.trim();
    if (nTrim === '') {
      let peek = idx + 1;
      while (peek < lines.length && lines[peek].trim() === '') peek++;
      if (peek < lines.length) {
        const after = lines[peek], afterIndent = getIndent(after);
        if ((/^\s*[*\-] /.test(after) || /^\s*\d+\. /.test(after)) && afterIndent <= baseIndent) break;
        if (!/^\s*[*\-] /.test(after) && !/^\s*\d+\. /.test(after) && afterIndent <= baseIndent) break;
      }
      result.push(''); idx++; consumed++; continue;
    }
    const nIndent = getIndent(nl);
    if ((/^\s*[*\-] /.test(nl) || /^\s*\d+\. /.test(nl)) && nIndent <= baseIndent) break;
    if (!/^\s*[*\-] /.test(nl) && !/^\s*\d+\. /.test(nl) && nIndent <= baseIndent) break;
    result.push(nl); idx++; consumed++;
  }
  result._consumed = consumed;
  return result;
}

function _renderChildLines(lines) {
  if (!lines.length) return '';
  const getIndent = l => { const m = l.match(/^(\s*)/); return m ? m[1].length : 0; };
  const nonEmpty = lines.filter(l => l.trim());
  if (!nonEmpty.length) return '';
  const min = Math.min(...nonEmpty.map(l => getIndent(l)));
  const normalized = lines.map(l => l ? l.slice(Math.min(min, getIndent(l))) : '');
  return mdToHtml(normalized.join('\n'));
}

window.MarkdownRenderer = { mdToHtml, inlinemd };