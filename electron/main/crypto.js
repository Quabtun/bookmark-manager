import { safeStorage } from 'electron'
import fs from 'node:fs'
import { writeFileAtomic, ensureDirs, FILES } from './store.js'

// safeStorage 在 Windows 上使用 DPAPI，密钥绑定当前 Windows 用户账户。
// 文件被拷贝到其他电脑/账户将无法解密。

export function isEncryptionAvailable() {
  return safeStorage.isEncryptionAvailable()
}

// 加密任意字符串 → Buffer；以 base64 存到 .enc 文件
function encrypt(plain) {
  if (!isEncryptionAvailable()) {
    // safeStorage 不可用时拒绝降级为 Base64，避免明文存储敏感数据
    throw new Error('safeStorage 不可用，无法安全加密数据。请确保运行环境支持操作系统级加密（Windows DPAPI / macOS Keychain / Linux libsecret）。')
  }
  const buf = safeStorage.encryptString(plain)
  return { enc: buf.toString('base64'), avail: true }
}

function decrypt(payload) {
  if (payload.avail === false) {
    return Buffer.from(payload.enc, 'base64').toString('utf8')
  }
  const buf = Buffer.from(payload.enc, 'base64')
  if (!isEncryptionAvailable()) throw new Error('当前环境无法解密（非原始 Windows 账户）')
  return safeStorage.decryptString(buf)
}

// 加密并保存整个对象
export function saveEncrypted(filePath, obj) {
  ensureDirs()
  const payload = encrypt(JSON.stringify(obj))
  writeFileAtomic(filePath, JSON.stringify(payload))
}

export function loadEncrypted(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.trim()) return fallback
    const payload = JSON.parse(raw)
    const json = decrypt(payload)
    return JSON.parse(json)
  } catch (e) {
    console.error('loadEncrypted error', e.message)
    return fallback
  }
}

export { FILES }
