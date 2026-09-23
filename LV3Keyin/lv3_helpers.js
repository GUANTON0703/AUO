'use strict';
/* ══════════════════════════════════════════════
   lv3_helpers.js — 共用工具函式（最先載入）
   依賴：無
══════════════════════════════════════════════ */

/* API 基底 URL（file:// 本地開啟時指向 localhost:5001）*/
const BASE_URL = location.protocol === 'file:' ? 'http://localhost:5001' : '';

/* HTTP 工具 */
async function get(url) {
  return (await fetch(BASE_URL + url)).json();
}
async function post(url, data) {
  return (await fetch(BASE_URL + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })).json();
}

/* HTML 跳脫 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 補零 */
function p2(n) { return String(n).padStart(2, '0'); }

/* 日期格式化：20240101 → 01/01 */
function fd(s) {
  return (!s || s.length < 8) ? (s || '—') : s.slice(4, 6) + '/' + s.slice(6, 8);
}

/* X/Y 範圍格式化（多筆 | 分隔）*/
function fc(s, e) {
  const f = v => v ? v.split('|').filter(Boolean).join('\n') : '';
  const sv = f(s), ev = f(e);
  if (!sv && !ev) return '—';
  if (sv && ev) {
    const sa = sv.split('\n'), ea = ev.split('\n');
    return Array.from(
      { length: Math.max(sa.length, ea.length) },
      (_, i) => `${sa[i] || ''}${ea[i] ? '~' + ea[i] : ''}`
    ).join('\n');
  }
  return sv || ev;
}

/* 錯誤訊息 HTML */
function em(m) {
  return `<div class="lmsg" style="color:#c0392b">❌ ${esc(m)}</div>`;
}

/* 圖片 Modal */
function openM(src) {
  document.getElementById('mimg').src = src;
  document.getElementById('modal').classList.add('show');
}
function closeM() {
  document.getElementById('modal').classList.remove('show');
}

/* 儲存標題到 localStorage（批次面板也會呼叫）*/
function saveTitleLocal(t) {
  if (!t) return;
  var sa = JSON.parse(localStorage.getItem('lv3_local_titles') || '[]');
  if (!sa.includes(t)) {
    sa.push(t);
    if (sa.length > 50) sa = sa.slice(-50);
    localStorage.setItem('lv3_local_titles', JSON.stringify(sa));
  }
}
