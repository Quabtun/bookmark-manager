import { app } from 'electron';
import { validateUrl } from '../electron/main/validator.js';

const testUrls = [
  ['https://www.baidu.com', 'ok'],
  ['https://github.com', 'ok'],
  ['https://223.5.5.5', 'ok'],  // IP address
  ['https://invalid.xyz', 'dead'],
  ['https://www.zhihu.com', 'ok'],
  ['https://stackoverflow.com', 'ok'],
];

app.whenReady().then(async () => {
  console.log('\n=== validateUrl 准确性 ===\n');
  let pass = 0, fail = 0;
  for (const [url, expected] of testUrls) {
    const r = await validateUrl(url);
    const ok = r.status === expected;
    if (ok) { pass++; console.log('  ✅', url, '→', r.status, '(expected:' + expected + ')'); }
    else { fail++; console.log('  ❌', url, '→', r.status, '(expected:' + expected + ', got:' + r.status + ')'); }
  }
  console.log('\n结果:', pass, '/', pass+fail);
  app.quit();
});
