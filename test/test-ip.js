import { app } from 'electron';
import { requestWithTimeout } from '../electron/main/http.js';

app.whenReady().then(async () => {
  try {
    const r = await requestWithTimeout('https://223.5.5.5', { method: 'GET', timeout: 5000 });
    console.log('223.5.5.5 status:', r.status);
    console.log('Headers:', JSON.stringify(r.headers).slice(0, 200));
  } catch (e) {
    console.log('223.5.5.5 error:', e.message);
  }
  app.quit();
});
