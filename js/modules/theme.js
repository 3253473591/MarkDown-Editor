/**
 * Function: 主题系统与视觉增强管理器
 *   - 三套主题切换
 *   - 面包屑导航（通过轮询 activeId 实现实时更新，无需拦截 setActive）
 *   - 保存粒子效果
 */
'use strict';

const ThemeMgr = (() => {
  const LS_KEY = 'md_theme';
  
  const THEMES = {
    cyber: {
      name: '赛博手稿',
      vars: {
        '--bg-base': '#0a0c10',
        '--bg-panel': 'rgba(8,10,14,0.85)',
        '--bg-toolbar': 'rgba(6,8,12,0.90)',
        '--bg-editor': 'rgba(4,6,10,0.80)',
        '--text': '#e0e2ea',
        '--text-dim': '#6a6f8a',
        '--border': 'rgba(255,255,255,0.08)',
        '--accent': '#00f0ff',
        '--accent-hover': '#00d4e0',
        '--accent-gradient': 'linear-gradient(135deg, #00f0ff 0%, #ff2d95 100%)',
        '--danger': '#ff4757',
        '--success': '#00f0ff',
        '--warning': '#ff9f43',
        '--tree-hover': 'rgba(0,240,255,0.15)',
        '--tree-active': 'rgba(0,240,255,0.25)',
        '--shadow-panel': '0 12px 40px rgba(0,0,0,0.5), 0 0 60px rgba(0,240,255,0.03)',
        '--shadow-float': '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,240,255,0.1)'
      },
      className: 'theme-cyber'
    },
    paper: {
      name: '纸艺档案',
      vars: {
        '--bg-base': '#f5f2e9',
        '--bg-panel': 'rgba(232,228,217,0.95)',
        '--bg-toolbar': 'rgba(242,239,230,0.98)',
        '--bg-editor': 'rgba(250,247,238,0.98)',
        '--text': '#2d2a24',
        '--text-dim': '#6b6560',
        '--border': 'rgba(45,42,36,0.15)',
        '--accent': '#c17f59',
        '--accent-hover': '#a86b4b',
        '--accent-gradient': 'linear-gradient(135deg, #c17f59 0%, #d4b896 100%)',
        '--danger': '#c44536',
        '--success': '#5a7a6d',
        '--warning': '#c4a35a',
        '--tree-hover': 'rgba(193,127,89,0.1)',
        '--tree-active': 'rgba(193,127,89,0.2)',
        '--shadow-panel': '0 2px 8px rgba(45,42,36,0.08), 0 8px 32px rgba(45,42,36,0.12)',
        '--shadow-float': '0 4px 16px rgba(45,42,36,0.1), 0 1px 3px rgba(45,42,36,0.15)'
      },
      className: 'theme-paper'
    },
    aurora: {
      name: '液态极光',
      vars: {
        '--bg-base': '#0f0a1a',
        '--bg-panel': 'rgba(15,10,26,0.75)',
        '--bg-toolbar': 'rgba(20,15,30,0.80)',
        '--bg-editor': 'rgba(12,8,22,0.70)',
        '--text': '#f0f0f5',
        '--text-dim': '#8a85a0',
        '--border': 'rgba(255,255,255,0.08)',
        '--accent': '#4f8ef7',
        '--accent-hover': '#3b7ae0',
        '--accent-gradient': 'linear-gradient(135deg, #4f8ef7 0%, #a855f7 100%)',
        '--danger': '#ff4757',
        '--success': '#10b981',
        '--warning': '#f59e0b',
        '--tree-hover': 'rgba(79,142,247,0.15)',
        '--tree-active': 'rgba(79,142,247,0.25)',
        '--shadow-panel': '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        '--shadow-float': '0 12px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)'
      },
      className: 'theme-aurora'
    }
  };

  // 面包屑轮询：记录上一次渲染时的 activeId，有变化才重绘
  let _lastRenderedId = null;
  let _pollTimer = null;

  function init() {
    // 1. 加载保存的主题
    const saved = localStorage.getItem(LS_KEY) || 'aurora';
    setTheme(saved, false);

    // 2. 绑定主题切换按钮
    document.querySelectorAll('[data-theme]').forEach(btn => {
      btn.addEventListener('click', () => setTheme(btn.dataset.theme));
    });

    // 3. 初始化微观交互
    initMicroInteractions();
    
    // 4. 初始化面包屑（轮询驱动）
    initBreadcrumb();
    
    // 5. 扩展 EditorMgr
    extendShowMsg();
  }

  function setTheme(themeName, save = true) {
    const theme = THEMES[themeName];
    if (!theme) return;

    Object.values(THEMES).forEach(t => document.body.classList.remove(t.className));
    document.body.classList.add(theme.className);

    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.vars)) {
      root.style.setProperty(key, value);
    }

    if (save) localStorage.setItem(LS_KEY, themeName);
  }

  function initMicroInteractions() {
    const dividers = [document.getElementById('divider'), document.querySelector('.editor-preview-divider')];
    dividers.forEach(div => {
      if (!div) return;
      div.addEventListener('mousedown', () => div.classList.add('distorting'));
    });
    document.addEventListener('mouseup', () => {
      dividers.forEach(div => div && div.classList.remove('distorting'));
    });
  }

  function extendShowMsg() {
    const originalShowMsg = window.EditorMgr?.showMsg;
    if (!originalShowMsg) return;
    
    window.EditorMgr.showMsg = function(msg, isError) {
      originalShowMsg(msg, isError);
      if (!isError && msg.includes('保存')) {
        createSaveParticles(document.getElementById('stat-msg'));
      }
    };
  }

  function createSaveParticles(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
      const p = document.createElement('span');
      p.className = 'save-particle';
      Object.assign(p.style, {
        position: 'fixed',
        left: (rect.left + Math.random() * rect.width) + 'px',
        top: rect.top + 'px',
        pointerEvents: 'none',
        zIndex: 1000
      });
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1000);
    }
  }

  /* ── 面包屑导航（轮询驱动，100ms 检测一次 activeId 变化） ── */
  function initBreadcrumb() {
    renderBreadcrumb();

    // 用轮询替代拦截 setActive，避免初始化时序问题
    _pollTimer = setInterval(() => {
      const currentId = window.TreeMgr?.activeId ?? null;
      if (currentId !== _lastRenderedId) {
        _lastRenderedId = currentId;
        renderBreadcrumb();
      }
    }, 100);
  }

  function renderBreadcrumb() {
    const container = document.getElementById('breadcrumb');
    if (!container || !window.TreeMgr) return;

    const activeId = TreeMgr.activeId;
    if (!activeId) {
      container.innerHTML = '<span style="color:var(--text-dim);font-size:12px;">未选择节点</span>';
      return;
    }

    // 构建从根到当前节点的路径
    const path = [];
    function buildPath(id) {
      const node = TreeMgr.findNode(id);
      if (!node) return;
      const parent = TreeMgr.findParent(id);
      if (parent) buildPath(parent.id);
      path.push(node);
    }
    buildPath(activeId);

    container.innerHTML = path.map((node, idx) => {
      const isLast = idx === path.length - 1;
      return `
        <span class="breadcrumb-item${isLast ? ' active' : ''}" data-id="${node.id}">
          ${node.label || '(无标签)'}
        </span>
        ${!isLast ? '<span class="breadcrumb-separator">/</span>' : ''}
      `;
    }).join('');

    container.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (id) TreeMgr.setActive(id);
      });
    });
  }

  return { init, setTheme, THEMES };
})();

window.ThemeMgr = ThemeMgr;