/**
 * Function: 应用启动器（Bootstrap）
 *   - 按正确顺序初始化所有子系统
 *   - Skeleton 切换
 * Dependencies: 所有其他模块（通过 window.* 全局访问）
 */
'use strict';

async function bootstrap() {
  const skeleton = document.getElementById('skeleton');
  const app      = document.getElementById('app');

  // 1. 数据层
  await TreeMgr.loadMeta();

  // 2. 核心编辑器（依赖 PreviewMgr / DividerMgr / ToolbarMgr / StatsMgr，均已在前面加载）
  EditorMgr.init();

  // 3. 功能模块
  SearchMgr.init();
  ExportMgr.initExport();
  CleanupMgr.init();
  SettingsMgr.init();
  BackgroundMgr.init();
  ThemeMgr.init();
  DividerMgr.initMainDivider();
  ShortcutsMgr.initShortcuts();

  // 4. 渲染树
  TreeMgr.renderTree();

  // 5. 加载活跃节点
  if (TreeMgr.activeId) {
    await EditorMgr.loadNode(TreeMgr.activeId);
  } else {
    const nodes = TreeMgr.allNodes();
    if (nodes.length) await EditorMgr.loadNode(nodes[0].id);
  }

  // 6. 背景 & 配额
  await BackgroundMgr.loadSaved();
  await EditorMgr.checkQuota();

  // 7. 按钮绑定
  document.getElementById('btn-new-node').addEventListener('click', () => TreeMgr.addNode(null));
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('清空所有节点及内容？此操作可通过 Ctrl+Z 撤销。')) TreeMgr.clearAll();
  });
  // 8. 显示界面
  skeleton.style.display = 'none';
  app.classList.remove('hidden');

  // 9. 缩放 & 教程（最后，避免影响布局计算）
  ZoomMgr.init();
  TutorialMgr.init();
}

document.addEventListener('DOMContentLoaded', bootstrap);