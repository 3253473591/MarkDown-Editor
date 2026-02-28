/**
 * Function (功能): 
 *   - 新手引导流程：步骤定义、高亮框定位、对话框导航（上一步/下一步/跳过）
 *   - 动态创建 Overlay 与行内样式，持久化完成状态到 localStorage
 *   - 支持重置与重新播放
 * Dependencies (依赖): 无（纯 JS 动态创建 DOM 与样式，不依赖外部 CSS 类）
 */

'use strict';

const TutorialMgr = (() => {
  const LS_KEY = 'md_tutorial_done';

  /* ── 教程步骤定义 ── */
  const STEPS = [
    {
      title: '欢迎使用 Markdown Editor！',
      text: '这是一个基于节点树的 Markdown 编辑器。<br>让我们花一分钟快速了解主要功能，点击「下一步」开始。',
      target: null,
      position: 'center'
    },
    {
      title: '节点树（左侧面板）',
      text: '所有内容以「节点」形式组织在左侧树状面板中。<br>点击节点即可切换编辑；拖拽节点可调整层级结构。',
      target: '#tree-panel',
      position: 'right'
    },
    {
      title: '新建与管理节点',
      text: '使用这三个按钮新建根节点、子节点、同级节点。<br>也可以通过 <kbd>Ctrl+1/2/3</kbd> 快速操作。',
      target: '#btn-new-node',
      targetGroup: ['#btn-new-node', '#btn-add-child', '#btn-add-sibling'],
      position: 'bottom'
    },
    {
      title: '编辑区（右侧）',
      text: '右侧为 Markdown 编辑区，旁边实时预览渲染效果。<br>中间的分割线可以左右拖动，调整编辑/预览比例。',
      target: '#editor',
      position: 'left'
    },
    {
      title: 'Markdown 工具栏',
      text: '工具栏提供常用格式快捷按钮：粗体、斜体、代码块、表格、链接等，点击即可插入。',
      target: '#md-toolbar',
      position: 'bottom'
    },
    {
      title: '节点标签与注释',
      text: '在上方输入框中设置节点的「标签名」和「注释」，注释会显示在树节点旁边，便于标注说明。',
      target: '#node-meta',
      position: 'bottom'
    },
    {
      title: '拖入代码文件自动建节点',
      text: '将 <strong>.js、.py、.java</strong> 等代码文件直接拖入编辑器窗口，每个文件会自动创建一个同名节点，文件内容以代码块形式填入，支持 20+ 种格式。无需复制粘贴，拖进来就能用！',
      target: '#editor',
      position: 'left'
    },
    {
      title: '导入 / 导出',
      text: '支持导入 JSON / Markdown 文件，导出为 JSON、Markdown、YAML、XML 或 Word（富文本复制）格式。',
      target: '#btn-export-toggle',
      targetGroup: ['#btn-import', '#btn-export-toggle'],
      position: 'bottom'
    },
    {
      title: '节点隐藏',
      text: '鼠标悬停在节点上，右侧会出现「👁」按钮，点击可隐藏该节点及其子树，隐藏的节点不会出现在导出内容中。',
      target: '#tree-panel',
      position: 'right'
    },
    {
      title: '全文搜索',
      text: '点击右上角的搜索按钮，或按 <kbd>Ctrl+P</kbd>，可在所有节点中搜索关键词，点击结果跳转。',
      target: '#btn-search',
      position: 'bottom'
    },
    {
      title: '状态栏',
      text: '底部状态栏实时显示字符数、Token 估算、节点数以及存储占用情况。',
      target: '.status-bar',
      position: 'top'
    },
    {
      title: '查看所有快捷键',
      text: '最后一步！点击「打开快捷键一览」查看全部键盘快捷键，熟悉后效率倍增！<br><br>教程结束，祝你使用愉快 🎉',
      target: '#btn-shortcuts',
      position: 'bottom',
      actionBtn: { label: '打开快捷键一览', action: 'shortcuts' }
    }
  ];

  /* ── 状态 ── */
  let _current = 0;
  let _overlay, _box, _highlight;

  /* ── 工具函数 ── */
  function isDone() { return localStorage.getItem(LS_KEY) === '1'; }
  function markDone() { localStorage.setItem(LS_KEY, '1'); }
  function resetDone() { localStorage.removeItem(LS_KEY); }

  /* ── DOM 创建 ── */
  function buildUI() {
    // 遮罩
    _overlay = document.createElement('div');
    _overlay.id = 'tutorial-overlay';
    Object.assign(_overlay.style, {
      position: 'fixed', inset: '0', zIndex: '9000',
      pointerEvents: 'none'
    });

    // 高亮框
    _highlight = document.createElement('div');
    _highlight.id = 'tutorial-highlight';
    Object.assign(_highlight.style, {
      position: 'fixed', zIndex: '9001',
      border: '2px solid #4f8ef7',
      borderRadius: '6px',
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
      transition: 'all 0.3s ease',
      pointerEvents: 'none',
      display: 'none'
    });

    // 对话框
    _box = document.createElement('div');
    _box.id = 'tutorial-box';
    Object.assign(_box.style, {
      position: 'fixed', zIndex: '9002',
      background: '#1e2028',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '10px',
      padding: '20px 22px',
      maxWidth: '320px',
      minWidth: '260px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      color: '#e0e2ea',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: '14px',
      lineHeight: '1.6',
      transition: 'all 0.25s ease'
    });

    _box.innerHTML = `
      <div id="tut-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <span id="tut-title" style="font-weight:700;font-size:15px;color:#4f8ef7;"></span>
        <span id="tut-counter" style="font-size:12px;color:#8a8fa8;"></span>
      </div>
      <div id="tut-text" style="margin-bottom:16px;color:#c8cad8;"></div>
      <div id="tut-action-row" style="display:none;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">
        <button id="tut-skip" style="cursor:pointer;padding:4px 10px;border:1px solid rgba(255,255,255,0.12);border-radius:6px;background:transparent;color:#8a8fa8;font-size:12px;">跳过教程</button>
        <button id="tut-prev" style="cursor:pointer;padding:5px 14px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:rgba(255,255,255,0.05);color:#e0e2ea;font-size:13px;">上一步</button>
        <button id="tut-next" style="cursor:pointer;padding:5px 16px;border:1px solid #4f8ef7;border-radius:6px;background:#4f8ef7;color:#fff;font-size:13px;font-weight:600;">下一步</button>
      </div>
      <div id="tut-dots" style="display:flex;gap:5px;justify-content:center;margin-top:12px;"></div>
    `;

    document.body.appendChild(_overlay);
    document.body.appendChild(_highlight);
    document.body.appendChild(_box);

    document.getElementById('tut-next').addEventListener('click', next);
    document.getElementById('tut-prev').addEventListener('click', prev);
    document.getElementById('tut-skip').addEventListener('click', finish);
  }

  /* ── 步骤渲染 ── */
  function showStep(idx) {
    const step = STEPS[idx];
    const total = STEPS.length;
    const isLast = idx === total - 1;
    const isFirst = idx === 0;

    // 文字内容
    document.getElementById('tut-title').innerHTML = step.title;
    document.getElementById('tut-text').innerHTML = step.text;
    document.getElementById('tut-counter').textContent = `${idx + 1} / ${total}`;

    // 导航按钮
    const prevBtn = document.getElementById('tut-prev');
    const nextBtn = document.getElementById('tut-next');
    prevBtn.style.display = isFirst ? 'none' : '';
    nextBtn.textContent = isLast ? '完成 🎉' : '下一步';

    // 特殊操作按钮
    const actionRow = document.getElementById('tut-action-row');
    actionRow.innerHTML = '';
    actionRow.style.display = 'none';
    if (step.actionBtn) {
      actionRow.style.display = '';
      const btn = document.createElement('button');
      btn.textContent = step.actionBtn.label;
      Object.assign(btn.style, {
        cursor: 'pointer', padding: '6px 14px',
        border: '1px solid #4f8ef7', borderRadius: '6px',
        background: 'rgba(79,142,247,0.15)', color: '#4f8ef7',
        fontSize: '13px', width: '100%'
      });
      btn.addEventListener('click', () => handleAction(step.actionBtn.action));
      actionRow.appendChild(btn);
    }

    // 进度点
    const dotsEl = document.getElementById('tut-dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div');
      Object.assign(d.style, {
        width: i === idx ? '18px' : '7px',
        height: '7px',
        borderRadius: '4px',
        background: i === idx ? '#4f8ef7' : 'rgba(255,255,255,0.2)',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      });
      const stepIdx = i;
      d.addEventListener('click', () => { _current = stepIdx; showStep(_current); });
      dotsEl.appendChild(d);
    }

    // 定位高亮和对话框
    positionStep(step);
  }

  function positionStep(step) {
    // 解析目标元素（优先取 target，没有则 center）
    let targetEl = step.target ? document.querySelector(step.target) : null;

    // 高亮组（多个元素合并包围盒）
    if (step.targetGroup) {
      const els = step.targetGroup.map(s => document.querySelector(s)).filter(Boolean);
      if (els.length) {
        const rects = els.map(el => el.getBoundingClientRect());
        const top    = Math.min(...rects.map(r => r.top));
        const left   = Math.min(...rects.map(r => r.left));
        const right  = Math.max(...rects.map(r => r.right));
        const bottom = Math.max(...rects.map(r => r.bottom));
        applyHighlight({ top, left, width: right - left, height: bottom - top });
        positionBox({ top, left, bottom, right, width: right - left, height: bottom - top }, step.position);
        return;
      }
    }

    if (!targetEl || step.position === 'center') {
      // 居中显示，无高亮
      _highlight.style.display = 'none';
      Object.assign(_box.style, {
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)'
      });
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    applyHighlight(rect);
    positionBox(rect, step.position);
  }

  function applyHighlight(rect) {
    const pad = 4;
    Object.assign(_highlight.style, {
      display: 'block',
      top:    (rect.top  - pad) + 'px',
      left:   (rect.left - pad) + 'px',
      width:  (rect.width  + pad * 2) + 'px',
      height: (rect.height + pad * 2) + 'px'
    });
  }

  function positionBox(rect, pos) {
    const boxW = 320, boxH = 200, margin = 14;
    const vw = window.innerWidth, vh = window.innerHeight;
    let top, left;

    switch (pos) {
      case 'right':
        top  = Math.min(rect.top, vh - boxH - margin);
        left = Math.min(rect.right + margin, vw - boxW - margin);
        break;
      case 'left':
        top  = Math.min(rect.top, vh - boxH - margin);
        left = Math.max(rect.left - boxW - margin, margin);
        break;
      case 'bottom':
        top  = Math.min(rect.bottom + margin, vh - boxH - margin);
        left = Math.max(margin, Math.min(rect.left, vw - boxW - margin));
        break;
      case 'top':
        top  = Math.max(rect.top - boxH - margin, margin);
        left = Math.max(margin, Math.min(rect.left, vw - boxW - margin));
        break;
      default:
        top = (vh - boxH) / 2; left = (vw - boxW) / 2;
    }

    top  = Math.max(margin, top);
    left = Math.max(margin, left);

    Object.assign(_box.style, {
      top: top + 'px',
      left: left + 'px',
      transform: 'none'
    });
  }

  /* ── 动作处理 ── */
  function handleAction(action) {
    if (action === 'shortcuts') {
      document.getElementById('modal-shortcuts').classList.remove('hidden');
    }
  }

  /* ── 流程控制 ── */
  function next() {
    if (_current < STEPS.length - 1) {
      _current++;
      showStep(_current);
    } else {
      finish();
    }
  }

  function prev() {
    if (_current > 0) {
      _current--;
      showStep(_current);
    }
  }

  function finish() {
    markDone();
    _highlight.style.display = 'none';
    _overlay.remove();
    _highlight.remove();
    _box.remove();
    _overlay = _box = _highlight = null;
  }

  /* ── 启动 ── */
  function start() {
    _current = 0;
    if (_overlay) { // 防止重复，先销毁旧实例
      _highlight.style.display = 'none';
      [_overlay, _highlight, _box].forEach(el => el && el.parentNode && el.parentNode.removeChild(el));
      _overlay = _box = _highlight = null;
    }
    buildUI();
    showStep(0);
  }

  /* ── 公共 init（在 bootstrap 末尾调用）── */
  function init() {
    // 绑定重置按钮 —— 用事件委托挂在 document 上，无需按钮已存在
    document.addEventListener('click', e => {
      if (e.target.closest('#btn-tutorial')) {
        resetDone();
        start();
      }
    });

    // 首次打开自动触发
    if (!isDone()) {
      setTimeout(start, 400);
    }
  }

  return { init, start, reset: () => { resetDone(); start(); } };
})();

window.TutorialMgr = TutorialMgr;