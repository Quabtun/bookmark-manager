// 锁屏模块 - 创建解锁窗口和密码验证
import { BrowserWindow } from 'electron'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 使用 PBKDF2 派生密钥并返回 SHA-256 十六进制哈希
function deriveHash(password, salt) {
  const iterations = 100000
  const keyLength = 32
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256')
  return derivedKey.toString('hex')
}

// 生成随机 salt（16 字节十六进制）
function generateSalt() {
  return crypto.randomBytes(16).toString('hex')
}

// 从存储的 lockPassword 字符串中提取 salt 和 hash
// 格式: "salt:hash"
function parseStored(stored) {
  if (!stored || !stored.includes(':')) return null
  const idx = stored.indexOf(':')
  return { salt: stored.slice(0, idx), hash: stored.slice(idx + 1) }
}

// 验证密码（恒定时间比较，防止时间侧信道攻击）
export function checkPassword(input, storedLockPassword) {
  const parsed = parseStored(storedLockPassword)
  if (!parsed) return false
  const inputHash = deriveHash(input, parsed.salt)
  const a = Buffer.from(inputHash, 'hex')
  const b = Buffer.from(parsed.hash, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// 设置密码（返回用于存储的字符串）
export function hashPassword(password) {
  const salt = generateSalt()
  const hash = deriveHash(password, salt)
  return salt + ':' + hash
}

// 创建解锁窗口
export function createLockWindow(onQuit) {
  const lockWin = new BrowserWindow({
    width: 400,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/lock-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 内联锁屏 HTML
  const lockHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 400px; height: 280px; display: flex; align-items: center; justify-content: center;
    font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
    background: transparent;
  }
  .card {
    width: 360px; padding: 28px 24px; border-radius: 18px;
    background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);
    box-shadow: 0 12px 40px -8px rgba(30,40,100,0.3);
    display: flex; flex-direction: column; align-items: center; gap: 16px;
  }
  .card h2 { font-size: 18px; font-weight: 600; color: #1e293b; }
  .card input {
    width: 100%; padding: 10px 14px; border: 2px solid #e2e8f0; border-radius: 10px;
    font-size: 14px; outline: none; transition: border-color 0.15s;
  }
  .card input:focus { border-color: #3563ff; }
  .card .btns { display: flex; gap: 8px; width: 100%; }
  .card button {
    flex: 1; padding: 10px 0; border: none; border-radius: 10px;
    font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity 0.15s;
  }
  .card button:hover { opacity: 0.85; }
  .btn-unlock { background: #3563ff; color: #fff; }
  .btn-quit { background: #f1f5f9; color: #64748b; }
  .msg { font-size: 12px; color: #ef4444; min-height: 16px; }
</style>
</head>
<body>
  <div class="card">
    <h2>书签管理器 - 解锁</h2>
    <input id="pw" type="password" placeholder="输入密码" autofocus />
    <div id="msg" class="msg"></div>
    <div class="btns">
      <button class="btn-unlock" id="btn-unlock">解锁</button>
      <button class="btn-quit" id="btn-quit">退出</button>
    </div>
  </div>
  <script>
    const pw = document.getElementById('pw');
    const msg = document.getElementById('msg');
    document.getElementById('btn-unlock').onclick = async () => {
      const val = pw.value;
      if (!val) { msg.textContent = '请输入密码'; return; }
      try {
        const r = await window.api.invoke('lock:check', val);
        if (r && r.ok) {
          window.close();
        } else {
          msg.textContent = '密码错误';
          pw.value = '';
          pw.focus();
        }
      } catch (e) {
        msg.textContent = '验证失败: ' + (e.message || '');
      }
    };
    document.getElementById('btn-quit').onclick = () => {
      window.close();
    };
    pw.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-unlock').click();
    });
  </script>
</body>
</html>`

  lockWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(lockHtml))

  lockWin.on('closed', () => {
    // 如果窗口关闭时未被解锁，则退出应用
    if (!lockWin._unlocked) {
      onQuit && onQuit()
    }
  })

  return lockWin
}