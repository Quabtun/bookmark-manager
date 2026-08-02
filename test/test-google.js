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
GEND'
cd "C:\Users\22145\ZCodeProject\bookmark-manager" && timeout 20 node_modules/electron/dist/electron.exe test/test-google.js 2>&1
__zcode_status=$?
if [ "$__zcode_status" -eq 0 ]; then pwd -P > '/c/Users/22145/AppData/Local/Temp/zcode-b5fd8157-c254-4a74-9152-76347bd5f7b9-cwd'; fi
exit "$__zcode_status"
