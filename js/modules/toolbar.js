/**
 * Function: Markdown 工具栏动作处理
 *   - 各格式按钮点击 → 在光标处插入对应 markdown 语法
 *   - 表格插入对话框交互
 * Dependencies: (由 EditorMgr 调用，共享 textarea 引用和 pushContentUndo)
 */
'use strict';

const ToolbarMgr = (() => {
  let _textarea, _pushUndoFn, _currentIdFn;

  function init(textarea, pushUndoFn, currentIdFn) {
    _textarea    = textarea;
    _pushUndoFn  = pushUndoFn;
    _currentIdFn = currentIdFn;

    document.getElementById('md-toolbar').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      _handleAction(btn.dataset.action);
    });

    /* 表格 modal */
    document.getElementById('tbl-confirm').addEventListener('click', () => {
      const rows = parseInt(document.getElementById('tbl-rows').value) || 3;
      const cols = parseInt(document.getElementById('tbl-cols').value) || 3;
      insertTable(rows, cols);
      document.getElementById('modal-table').classList.add('hidden');
    });
    document.getElementById('tbl-cancel').addEventListener('click', () =>
      document.getElementById('modal-table').classList.add('hidden'));
  }

  function _handleAction(action) {
    if (action === 'table') {
      document.getElementById('modal-table').classList.remove('hidden');
      return;
    }
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
    _pushUndoFn(_currentIdFn(), _textarea.value);
    const insert = before + (sel || defaultSel) + after;
    ta.setRangeText(insert, s, e, 'select');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  function insertTable(rows, cols) {
    const header = '| ' + Array(cols).fill(0).map((_, i) => '列' + (i + 1)).join(' | ') + ' |';
    const sep    = '| ' + Array(cols).fill('---').join(' | ') + ' |';
    const row    = '| ' + Array(cols).fill('  ').join(' | ') + ' |';
    const table  = [header, sep, ...Array(rows).fill(row)].join('\n') + '\n';
    _pushUndoFn(_currentIdFn(), _textarea.value);
    const pos = _textarea.selectionStart;
    _textarea.setRangeText('\n' + table, pos, pos, 'end');
    _textarea.dispatchEvent(new Event('input'));
  }

  return { init, insertTable };
})();

window.ToolbarMgr = ToolbarMgr;