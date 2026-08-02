import { app } from 'electron';
import { requestWithTimeout } from '../electron/main/http.js';

app.whenReady().then(async () => {
  console.log('Testing google.com...');
  try {
    const r = await requestWithTimeout('https://www.google.com', { method: 'GET', timeout: 15000 });
    console.log('Status:', r.status);
  } catch (e) {
    console.log('Error:', e.message);
    console.log('Error code:', e.code);
  }
  app.quit();
});
