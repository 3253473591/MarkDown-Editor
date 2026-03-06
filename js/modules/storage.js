/**
 * Function: 统一数据持久化层
 *   - localStorage + IndexedDB 双层存储策略
 *   - 节点内容、背景图、备份、折叠/隐藏状态读写
 *   - 存储配额监控与清理（>5MB 转 IDB，>10MB 强制清理）
 * Dependencies: 无（底层基础设施）
 */
'use strict';

const DB_NAME  = 'md_editor_db';
const DB_VER   = 1;
const STORE_NODES   = 'nodes';
const STORE_BG      = 'bg';
const STORE_BACKUPS = 'backups';
const LS_META       = 'md_meta';
const LS_COLLAPSED  = 'md_collapsed';
const SIZE_THRESHOLD = 5 * 1024 * 1024;
const IDB_WARN      = 4 * 1024 * 1024;
const IDB_FORCE     = 10 * 1024 * 1024;
const NODE_MAX      = 100 * 1024;

let _db = null;

/* ── IndexedDB init ── */
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NODES))
        db.createObjectStore(STORE_NODES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_BG))
        db.createObjectStore(STORE_BG, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_BACKUPS))
        db.createObjectStore(STORE_BACKUPS, { keyPath: 'ts' });
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror   = () => rej(req.error);
  });
}

/* ── Generic IDB helpers ── */
function idbPut(store, obj) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj).onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}
function idbGet(store, key) {
  return openDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  }));
}
function idbGetAll(store) {
  return openDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  }));
}
function idbDelete(store, key) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  }));
}

/* ── Size helpers ── */
function strBytes(s) { return new Blob([s]).size; }
function lsSize() {
  let total = 0;
  for (let k in localStorage) {
    if (!Object.prototype.hasOwnProperty.call(localStorage, k)) continue;
    total += strBytes(k) + strBytes(localStorage[k]);
  }
  return total;
}
async function idbSize() {
  const [nodes, bg, backups] = await Promise.all([
    idbGetAll(STORE_NODES), idbGetAll(STORE_BG), idbGetAll(STORE_BACKUPS)
  ]);
  let total = 0;
  for (const n of nodes)   total += strBytes(JSON.stringify(n));
  for (const b of bg)      total += (b.blob ? b.blob.size : 0);
  for (const b of backups) total += strBytes(JSON.stringify(b));
  return total;
}

/* ── StorageMgr ── */
const StorageMgr = {
  /* Meta */
  saveMeta(meta)  { localStorage.setItem(LS_META, JSON.stringify(meta)); },
  loadMeta()      { try { return JSON.parse(localStorage.getItem(LS_META) || 'null'); } catch { return null; } },

  /* Node content */
  async saveNodeContent(id, content) {
    const bytes = strBytes(content);
    if (bytes > NODE_MAX) throw new Error(`节点内容超过 100KB 限制（当前 ${(bytes/1024).toFixed(1)} KB），请拆分节点。`);
    if (bytes > SIZE_THRESHOLD) {
      await idbPut(STORE_NODES, { id, content });
    } else {
      try { localStorage.setItem('nd_' + id, content); }
      catch { localStorage.removeItem('nd_' + id); await idbPut(STORE_NODES, { id, content }); }
    }
  },
  async loadNodeContent(id) {
    const ls = localStorage.getItem('nd_' + id);
    if (ls !== null) return ls;
    const idb = await idbGet(STORE_NODES, id);
    return idb ? idb.content : '';
  },
  async deleteNodeContent(id) {
    localStorage.removeItem('nd_' + id);
    await idbDelete(STORE_NODES, id);
  },

  /* Collapsed state */
  saveCollapsed(set) { localStorage.setItem(LS_COLLAPSED, JSON.stringify([...set])); },
  loadCollapsed()    { try { return new Set(JSON.parse(localStorage.getItem(LS_COLLAPSED) || '[]')); } catch { return new Set(); } },

  /* Background image */
  async saveBg(blob)  { await idbPut(STORE_BG, { key: 'bg', blob }); },
  async loadBg()      { const r = await idbGet(STORE_BG, 'bg'); return r ? r.blob : null; },
  async clearBg()     { await idbDelete(STORE_BG, 'bg'); },

  /* Backups */
  async saveBackup(metaSnapshot) { await idbPut(STORE_BACKUPS, { ts: Date.now(), meta: metaSnapshot }); },
  async listBackups() { const all = await idbGetAll(STORE_BACKUPS); return all.sort((a,b) => b.ts - a.ts); },

  /* Cleanup */
  async cleanOrphanNodes(liveIds) {
    const all = await idbGetAll(STORE_NODES);
    let freed = 0;
    for (const rec of all) {
      if (!liveIds.has(rec.id)) { freed += strBytes(JSON.stringify(rec)); await idbDelete(STORE_NODES, rec.id); }
    }
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('nd_') && !liveIds.has(k.slice(3))) { freed += strBytes(localStorage[k]); localStorage.removeItem(k); }
    }
    return freed;
  },
  async cleanOldBackups(keep) {
    const sorted = (await idbGetAll(STORE_BACKUPS)).sort((a,b) => b.ts - a.ts);
    let freed = 0;
    for (let i = keep; i < sorted.length; i++) { freed += strBytes(JSON.stringify(sorted[i])); await idbDelete(STORE_BACKUPS, sorted[i].ts); }
    return freed;
  },

  /* Quota */
  async checkQuota() { const size = await idbSize(); return { size, warn: size > IDB_WARN, critical: size > IDB_FORCE }; },

  /* Exposed helpers */
  idbSize, lsSize, strBytes
};

window.StorageMgr = StorageMgr;