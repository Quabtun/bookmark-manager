// 自动化功能测试 — 模拟用户操作
import { app } from 'electron';
import { loadSettings, saveSettings, FILES } from '../electron/main/store.js';
import fs from 'node:fs';

app.whenReady().then(async () => {
  let pass = 0, fail = 0;

  function test(name, fn) {
    try { fn(); pass++; console.log('  ✅', name); }
    catch (e) { fail++; console.log('  ❌', name, '-', e.message); }
  }

  console.log('\n=== 设置功能测试 ===\n');

  // 1. 主题切换写入磁盘
  test('切换主题→dark写入settings.json', () => {
    saveSettings({ ...loadSettings(), theme: 'dark' });
    const s = loadSettings();
    if (s.theme !== 'dark') throw new Error('主题未保存: ' + s.theme);
  });

  test('切换主题→soft写入settings.json', () => {
    saveSettings({ ...loadSettings(), theme: 'soft' });
    const s = loadSettings();
    if (s.theme !== 'soft') throw new Error('主题未保存: ' + s.theme);
  });

  // 2. 浏览器切换
  test('切换浏览器→chrome', () => {
    const s = loadSettings();
    s.defaultBrowser = { preset: 'chrome', path: '' };
    saveSettings(s);
    const r = loadSettings();
    if (r.defaultBrowser.preset !== 'chrome') throw new Error('浏览器未保存');
  });

  test('切换浏览器→custom', () => {
    const s = loadSettings();
    s.defaultBrowser = { preset: 'custom', path: 'C:\\firefox.exe' };
    saveSettings(s);
    const r = loadSettings();
    if (r.defaultBrowser.preset !== 'custom') throw new Error('浏览器未保存');
  });

  // 3. 文件验证
  test('settings.json存在且包含theme', () => {
    const raw = JSON.parse(fs.readFileSync(FILES.settings, 'utf8'));
    if (!raw.theme) throw new Error('theme字段缺失');
    if (!raw.defaultBrowser) throw new Error('defaultBrowser字段缺失');
  });

  // 4. 恢复默认
  test('恢复默认设置', () => {
    saveSettings({ theme: 'system', defaultBrowser: { preset: 'system', path: '' }, previewCacheLimitMB: 200, geoip: { cityMmdbPath: '', asnMmdbPath: '', allowOnlineFallback: true }, autoValidate: { onStartup: false, intervalDays: 7 }, proxy: { enabled: false, host: '', port: '', type: 'http', username: '', password: '' }, dataDir: '' });
    const s = loadSettings();
    if (s.theme !== 'system') throw new Error('未恢复');
  });

  // 结果
  console.log(`\n=== ${pass}/${pass+fail} 通过 ===`);
  process.exit(fail > 0 ? 1 : 0);
});
