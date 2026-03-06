/**
 * Function: 通用工具函数
 *   - debounce（含 flush/cancel）
 *   - estimateTokens：Token 数估算
 *   - esc：HTML 转义
 * Dependencies: 无
 */
'use strict';

function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush  = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 0.9 * 1.3);
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.Utils = { debounce, estimateTokens, esc };