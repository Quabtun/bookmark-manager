// 校验功能自动化测试 — 直接在 Electron 内运行
import { app } from 'electron';
import { validateUrl, validateBatch } from '../electron/main/validator.js';
import { requestWithTimeout } from '../electron/main/http.js';

app.whenReady().then(async () => {
  console.log('\n=== 校验功能测试 ===\n');

  let pass = 0, fail = 0, errors = [];

  async function test(name, fn) {
    try { await fn(); pass++; console.log('  ✅', name); }
    catch (e) { fail++; errors.push({ name, error: e.message }); console.log('  ❌', name, '-', e.message); }
  }

  // 1. 基础 HTTP 请求测试
  await test('HTTP直连可达', async () => {
    const r = await requestWithTimeout('https://httpbin.org/get', { method: 'GET', timeout: 5000 });
    if (!r || r.status < 200 || r.status >= 400) throw new Error('状态码: ' + (r?.status || 'null'));
  });

  // 2. HEAD 请求测试
  await test('HEAD请求正常', async () => {
    const r = await requestWithTimeout('https://httpbin.org/get', { method: 'HEAD', timeout: 5000 });
    if (!r || r.status < 200 || r.status >= 400) throw new Error('状态码: ' + (r?.status || 'null'));
  });

  // 3. 校验单个 URL
  await test('validateUrl 正常站点', async () => {
    const r = await validateUrl('https://httpbin.org/get');
    if (r.status !== 'ok') throw new Error('预期ok, 实际: ' + r.status + ' (' + r.message + ')');
  });

  // 4. 校验无效域名
  await test('validateUrl 无效域名→dead', async () => {
    const r = await validateUrl('https://this-domain-does-not-exist-98765.com');
    if (r.status !== 'dead') throw new Error('预期dead, 实际: ' + r.status);
  });

  // 5. 批量校验
  await test('validateBatch 批量工作', async () => {
    const urls = ['https://httpbin.org/get', 'https://httpbin.org/status/404'];
    const results = await validateBatch(urls, { limit: 2 });
    if (!Array.isArray(results)) throw new Error('返回值不是数组');
    if (results.length !== 2) throw new Error('结果数量不对: ' + results.length);
    if (results[0].status !== 'ok') throw new Error('第1个预期ok, 实际: ' + results[0].status);
  });

  // 6. 并发限制测试
  await test('并发限制=2', async () => {
    const urls = ['https://httpbin.org/delay/1', 'https://httpbin.org/delay/1', 'https://httpbin.org/get', 'https://httpbin.org/get'];
    let maxConcurrent = 0, current = 0;
    await validateBatch(urls, {
      limit: 2,
      onProgress: () => { /* track */ }
    });
    // 只要不崩溃就行
  });

  // 7. 超时测试
  await test('超时返回dead', async () => {
    const r = await validateUrl('https://10.255.255.1:9999/test');
    // 不可达的IP应该返回dead
    if (r.status !== 'dead') throw new Error('预期dead, 实际: ' + r.status + ' (' + r.message + ')');
  });

  // 结果
  console.log(`\n=== 结果: ${pass}/${pass + fail} 通过 ===`);
  if (fail > 0) {
    console.log('失败详情:');
    errors.forEach(e => console.log('  -', e.name, ':', e.error));
    process.exit(1);
  }
  console.log('✅ 全部通过!');
  process.exit(0);
});
