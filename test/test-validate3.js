import { app } from 'electron';
import { validateUrl } from '../electron/main/validator.js';

const testUrls = [
  ['https://www.baidu.com', 'ok'],
  ['https://github.com', 'ok'],
  ['https://www.zhihu.com', 'ok'],
  ['https://stackoverflow.com', 'ok'],
  ['https://developer.mozilla.org', 'ok'],
  ['https://www.google.com', 'ok'],
  ['https://invalid.xyz', 'dead'],
  ['https://223.5.5.5', 'warn'],  // 404 but reachable
  ['https://httpbin.org/status/200', 'ok'],  // may be down
];

app.whenReady().then(async () => {
  console.log('\n=== validateUrl accuracy test ===\n');
  let pass = 0, fail = 0;
  for (const [url, expected] of testUrls) {
    const r = await validateUrl(url);
    const ok = r.status === expected;
    if (ok) { pass++; console.log('  ✅', url.padEnd(40), '→', r.status.padEnd(8), '(expected:' + expected + ')'); }
    else { fail++; console.log('  ❌', url.padEnd(40), '→', r.status.padEnd(8), '(expected:' + expected + ', got:' + r.status + ')'); }
  }
  console.log('\n结果:', pass, '/', pass+fail, '通过');
  app.quit();
});
