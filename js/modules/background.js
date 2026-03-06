/**
 * Function: 背景图管理
 * - 上传背景图、加载已保存背景图
 * - 【新增】图片裁剪功能（锁定16:9比例）
 * - 透明度滑块实时调节
 * - 清除背景图
 * - 使用独立的 CSS 变量 --custom-bg-image / --custom-bg-opacity
 * Dependencies: storage.js, editor.js (showMsg)
 */
'use strict';

const BackgroundMgr = (() => {
  let _cropImg = null;
  let _cropState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    startX: 0,
    startY: 0
  };

  /** 将 blob 应用到自定义背景层（body::after） */
  function applyBg(blob) {
    const url = URL.createObjectURL(blob);
    document.documentElement.style.setProperty('--custom-bg-image', `url("${url}")`);
    const slider = document.getElementById('bg-opacity');
    const opacity = slider ? parseFloat(slider.value) : 0.85;
    document.documentElement.style.setProperty('--custom-bg-opacity', opacity);
  }

  /** 清除自定义背景层 */
  function _clearBgVars() {
    document.documentElement.style.setProperty('--custom-bg-image', 'none');
    document.documentElement.style.setProperty('--custom-bg-opacity', '0');
  }

  /* ─────────────── 裁剪功能 ─────────────── */

  function init() {
    document.getElementById('btn-bg-upload').addEventListener('click', () => 
      document.getElementById('bg-file').click()
    );

    document.getElementById('bg-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;

      // 读取图片
      const img = new Image();
      img.onload = () => {
        _cropImg = img;
        openCropModal(img, async (croppedBlob) => {
          await StorageMgr.saveBg(croppedBlob);
          applyBg(croppedBlob);
          EditorMgr.showMsg('背景已更新');
        });
      };
      img.src = URL.createObjectURL(file);
      e.target.value = '';
    });

    // 透明度滑块
    document.getElementById('bg-opacity').addEventListener('input', e => {
      const opacity = e.target.value;
      const current = getComputedStyle(document.documentElement)
        .getPropertyValue('--custom-bg-image').trim();
      if (current && current !== 'none') {
        document.documentElement.style.setProperty('--custom-bg-opacity', opacity);
      }
    });

    // 裁剪确认/取消按钮
    document.getElementById('crop-confirm').addEventListener('click', confirmCrop);
    document.getElementById('crop-cancel').addEventListener('click', () => {
      document.getElementById('modal-crop-bg').classList.add('hidden');
    });

    // 点击遮罩关闭
    document.getElementById('modal-crop-bg').addEventListener('click', e => {
      if (e.target.id === 'modal-crop-bg') {
        document.getElementById('modal-crop-bg').classList.add('hidden');
      }
    });
  }

  /**
   * 打开裁剪对话框
   * @param {HTMLImageElement} img - 原图
   * @param {Function} onCrop - 裁剪完成回调(blob)
   */
  function openCropModal(img, onCrop) {
    const modal = document.getElementById('modal-crop-bg');
    const container = document.getElementById('crop-container');
    const canvas = document.getElementById('crop-canvas');
    const cropBox = document.getElementById('crop-box');
    const ctx = canvas.getContext('2d');

    // 重置状态
    _cropState = { scale: 1, offsetX: 0, offsetY: 0, isDragging: false, startX: 0, startY: 0 };

    // 计算容器尺寸（固定16:9）
    const containerW = Math.min(860, window.innerWidth * 0.85);
    const containerH = containerW * 9 / 16;
    container.style.width = containerW + 'px';
    container.style.height = containerH + 'px';

    canvas.width = containerW;
    canvas.height = containerH;

    // 计算图片适配尺寸
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const containerRatio = containerW / containerH;
    let drawW, drawH;

    if (imgRatio > containerRatio) {
      // 图片更宽，以高度为准
      drawH = containerH;
      drawW = containerH * imgRatio;
    } else {
      // 图片更高，以宽度为准
      drawW = containerW;
      drawH = containerW / imgRatio;
    }

    // 初始居中
    _cropState.offsetX = (containerW - drawW) / 2;
    _cropState.offsetY = (containerH - drawH) / 2;
    _cropState.scale = 1;

    // 绘制函数
    function render() {
      ctx.clearRect(0, 0, containerW, containerH);
      
      // 绘制暗色背景
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, containerW, containerH);

      // 绘制图片
      ctx.drawImage(
        img,
        0, 0, img.naturalWidth, img.naturalHeight,
        _cropState.offsetX, _cropState.offsetY,
        drawW * _cropState.scale, drawH * _cropState.scale
      );
    }

    render();
    modal.classList.remove('hidden');

    // 拖动逻辑
    canvas.addEventListener('mousedown', e => {
      _cropState.isDragging = true;
      _cropState.startX = e.clientX - _cropState.offsetX;
      _cropState.startY = e.clientY - _cropState.offsetY;
      canvas.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', e => {
      if (!_cropState.isDragging) return;
      _cropState.offsetX = e.clientX - _cropState.startX;
      _cropState.offsetY = e.clientY - _cropState.startY;
      render();
    });

    document.addEventListener('mouseup', () => {
      _cropState.isDragging = false;
      canvas.style.cursor = 'grab';
    });

    // 滚轮缩放
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      const newScale = Math.max(0.5, Math.min(3, _cropState.scale * delta));
      
      // 以鼠标位置为中心缩放
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      _cropState.offsetX = mouseX - (mouseX - _cropState.offsetX) * (newScale / _cropState.scale);
      _cropState.offsetY = mouseY - (mouseY - _cropState.offsetY) * (newScale / _cropState.scale);
      _cropState.scale = newScale;
      
      render();
    });

    // 双击重置
    canvas.addEventListener('dblclick', () => {
      _cropState.scale = 1;
      _cropState.offsetX = (containerW - drawW) / 2;
      _cropState.offsetY = (containerH - drawH) / 2;
      render();
    });

    canvas.style.cursor = 'grab';

    // 确认裁剪
    window._confirmCrop = () => {
      // 创建离屏 canvas，按原始图片尺寸裁剪
      const outputCanvas = document.createElement('canvas');
      const outputCtx = outputCanvas.getContext('2d');

      // 计算裁剪区域在原图上的对应位置
      const scaleX = img.naturalWidth / (drawW * _cropState.scale);
      const scaleY = img.naturalHeight / (drawH * _cropState.scale);
      
      const cropX = -_cropState.offsetX * scaleX;
      const cropY = -_cropState.offsetY * scaleY;
      const cropW = containerW * scaleX;
      const cropH = containerH * scaleY;

      // 输出16:9比例的图片
      outputCanvas.width = 1920;
      outputCanvas.height = 1080;

      outputCtx.drawImage(
        img,
        cropX, cropY, cropW, cropH,
        0, 0, 1920, 1080
      );

      outputCanvas.toBlob(blob => {
        modal.classList.add('hidden');
        onCrop(blob);
      }, 'image/jpeg', 0.92);
    };
  }

  function confirmCrop() {
    if (window._confirmCrop) window._confirmCrop();
  }

  async function loadSaved() {
    const bg = await StorageMgr.loadBg();
    if (bg) {
      applyBg(bg);
      const opacity = parseFloat(document.getElementById('bg-opacity').value);
      document.documentElement.style.setProperty('--custom-bg-opacity', opacity);
    } else {
      _clearBgVars();
    }
  }

  async function clear() {
    await StorageMgr.clearBg();
    _clearBgVars();
    EditorMgr.showMsg('背景已清除');
  }

  return { init, loadSaved, applyBg, clear, openCropModal };
})();

window.BackgroundMgr = BackgroundMgr;