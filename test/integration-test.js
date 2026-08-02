// 集成测试：在 Electron 运行时内执行，验证真实的数据读写
// 用法：./node_modules/electron/dist/electron.exe test/integration-test.js

import { app } from 'electron';
import {
  loadBookmarks, saveBookmarks,
  loadCategories, saveCategories,
  loadSettings, saveSettings,
  loadSnapshots, saveSnapshots,
  DATA_DIR, FILES
} from '../electron/main/store.js';
import { parseBookmarksHtml, parseBrowserBookmarks, exportBookmarksHtml } from '../electron/main/browserimport.js';
import { suggestCategory } from '../electron/main/classifier.js';
import { createSnapshot, restoreSnapshot, listSnapshots } from '../electron/main/snapshot.js';
import fs from 'node:fs';
import path from 'node:path';

const results = [];
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅', name);
  } catch (e) {
    failed++;
    console.log('  ❌', name);
    console.log('     Error:', e.message);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

app.whenReady().then(async () => {
  console.log('\n=== 集成测试开始 ===\n');
  console.log('DATA_DIR:', DATA_DIR);
  console.log('settings path:', FILES.settings);
  console.log('bookmarks path:', FILES.bookmarks);
  console.log('');

  // ---- 测试 1: 基础读写 ----
  test('写入空书签列表', () => {
    saveBookmarks([]);
    const r = loadBookmarks();
    assert(Array.isArray(r), '应为数组');
    assert(r.length === 0, '应为空数组');
    assert(fs.existsSync(FILES.bookmarks), '文件应存在');
  });

  // ---- 测试 2: 写入一条书签并读回 ----
  const bm = {
    id: 'test-bm-1',
    url: 'https://github.com',
    title: 'GitHub',
    description: 'Where the world builds software',
    categoryId: 'cat-dev',
    tags: ['开源', '编程', 'Git'],
    notes: '测试书签',
    status: 'ok',
    createdAt: Date.now()
  };
  
  test('写入一条书签', () => {
    saveBookmarks([bm]);
    const r = loadBookmarks();
    assert(r.length === 1, '应有1条');
    assert(r[0].url === 'https://github.com', 'URL不匹配');
    assert(r[0].title === 'GitHub', '标题不匹配');
  });

  test('书签文件内容正确', () => {
    const raw = JSON.parse(fs.readFileSync(FILES.bookmarks, 'utf8'));
    assert(raw.length === 1, '文件应有1条');
    assert(raw[0].id === 'test-bm-1', 'ID不匹配');
  });

  // ---- 测试 3: 破坏性输入 ----
  test('空URL', () => {
    const b = { ...bm, id: 'empty-url', url: '' };
    saveBookmarks([b]);
    const r = loadBookmarks();
    assert(r[0].url === '', '空URL应保留');
  });

  test('超长标题 (10000字符)', () => {
    const longTitle = 'A'.repeat(10000);
    const b = { ...bm, id: 'long-title', title: longTitle };
    saveBookmarks([b]);
    const r = loadBookmarks();
    assert(r[0].title.length === 10000, '超长标题长度错');
    assert(r[0].title === longTitle, '超长标题内容错');
  });

  test('特殊字符: <script>alert("XSS")</script>', () => {
    const xss = '<script>alert("XSS")</script>';
    const b = { ...bm, id: 'xss', title: xss, url: 'https://xss.com/' + xss };
    saveBookmarks([b]);
    const r = loadBookmarks();
    assert(r[0].title === xss, 'XSS标题丢失');
    assert(r[0].url.includes('<script>'), 'XSS URL被过滤');
  });

  test('Unicode + Emoji', () => {
    const emoji = '🚀 中文测试 💻 émoji café 日本語 한국어';
    const b = { ...bm, id: 'unicode', title: emoji, url: 'https://test.com/' + encodeURIComponent(emoji) };
    saveBookmarks([b]);
    const r = loadBookmarks();
    assert(r[0].title === emoji, 'Unicode标题损坏');
  });

  test('null/undefined 字段', () => {
    const b = { id: 'null-fields', url: 'https://test.com', title: null, description: undefined };
    saveBookmarks([b]);
    const r = loadBookmarks();
    assert(r[0].title === null, 'null被篡改');
    // undefined 在 JSON.stringify 时会被丢弃, 读回时不存在该字段
  });

  // ---- 测试 4: 分类读写 ----
  test('写入默认分类', () => {
    saveCategories(loadCategories());
    const r = loadCategories();
    assert(r.length >= 9, '至少9个分类');
  });

  // ---- 测试 5: 设置读写 ----
  test('设置读写', () => {
    saveSettings({ theme: 'dark', previewCacheLimitMB: 500 });
    const s = loadSettings();
    assert(s.theme === 'dark', '主题不对');
    assert(s.previewCacheLimitMB === 500, '缓存限制不对');
  });

  // ---- 测试 6: 快照读写 ----
  test('创建并恢复快照', () => {
    // 清理旧快照
    saveSnapshots([]);
    const bms = [
      { id: 'a', url: 'https://a.com', categoryId: 'cat-dev' },
      { id: 'b', url: 'https://b.com', categoryId: 'cat-tools' },
    ];
    const snap = createSnapshot(bms, { name: '测试快照', kind: 'manual' });
    assert(!!snap.id, '快照应有ID');
    assert(snap.count === 2, '快照应包含2条');

    const restored = restoreSnapshot(bms, snap.id);
    assert(restored.restored === 2, '应恢复2条');
    assert(restored.bookmarks[0].categoryId === 'cat-dev', '分类未恢复');
  });

  // ---- 测试 7: 解析器 ----
  test('HTML解析器', () => {
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8"><TITLE>B</TITLE><H1>B</H1><DL><p><DT><A HREF="https://github.com">GitHub</A></DL>';
    const r = parseBookmarksHtml(html);
    assert(r.length === 1, '应解析1条');
    assert(r[0].url === 'https://github.com', 'URL错');
  });

  // ---- 测试 8: 导出 ----
  test('导出 HTML 格式', () => {
    const html = exportBookmarksHtml(
      [{ id: '1', url: 'https://test.com', title: 'Test', categoryId: 'cat-other' }],
      [{ id: 'cat-other', name: '其他' }]
    );
    assert(html.includes('NETSCAPE-Bookmark-file-1'), '缺少DOCTYPE');
    assert(html.includes('https://test.com'), '缺少URL');
    assert(html.includes('Test'), '缺少标题');
    assert(html.includes('其他'), '缺少分类');
  });

  // ---- 测试 9: 分类器 ----
  test('自动分类建议', () => {
    const cat = suggestCategory({ url: 'https://github.com/facebook/react', title: 'React' });
    assert(cat === 'cat-dev', 'GitHub/React 应分类为开发, 实际: ' + cat);
  });

  test('自动分类未匹配时不强制归入其他', () => {
    const cat = suggestCategory({ url: 'https://unknown-example-xyz.com/page', title: 'Unknown Page' });
    assert(cat === null, '未匹配书签应返回 null，实际: ' + cat);
  });

  // ---- 测试 10: 数据完整性（读写一致性） ----
  test('大量书签读写一致性', () => {
    const many = [];
    for (let i = 0; i < 100; i++) {
      many.push({
        id: 'perf-' + i,
        url: 'https://test.com/' + i,
        title: 'Test Bookmark ' + i,
        categoryId: 'cat-other',
        tags: ['tag' + (i % 10)],
        status: 'unknown',
        createdAt: Date.now() + i
      });
    }
    saveBookmarks(many);
    const r = loadBookmarks();
    assert(r.length === 100, '应有100条, 实际: ' + r.length);
    assert(r[99].title === 'Test Bookmark 99', '最后一条标题错');
    assert(r[0].url === 'https://test.com/0', '第一条URL错');
  });

  // ---- 测试 11: 文件原子写入 ----
  test('原子写入不产生tmp文件', () => {
    saveBookmarks([bm]);
    const dir = path.dirname(FILES.bookmarks);
    const tmps = fs.readdirSync(dir).filter(f => f.endsWith('.tmp-'));
    assert(tmps.length === 0, '残留tmp文件: ' + tmps.join(', '));
  });

  // ---- 结果 ----
  console.log(`\n=== 结果: ${passed}/${passed + failed} 通过 ===`);
  if (failed > 0) {
    console.log('❌ 有失败用例!');
    process.exit(1);
  } else {
    console.log('✅ 全部通过!');
    process.exit(0);
  }
});
