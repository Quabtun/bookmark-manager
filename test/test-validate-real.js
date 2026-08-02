import { app } from 'electron';
import { validateUrl } from '../electron/main/validator.js';

const testUrls = [
  'https://www.baidu.com',
  'https://github.com',
  'https://www.zhihu.com',
  'https://httpbin.org/status/200',
  'https://httpbin.org/status/404',
  'https://invalid-domain-xyz.local',
];

app.whenReady().then(async () => {
  console.log('\n=== 真实 URL 校验准确性测试 ===\n');
  for (const url of testUrls) {
    try {
      const r = await validateUrl(url);
      console.log(url.padEnd(40), '→', r.status.padEnd(8), r.message, '(code:' + r.code + ')');
    } catch (e) {
      console.log(url.padEnd(40), '→ ERROR:', e.message);
    }
  }
  console.log('\nDone');
  app.quit();
});
