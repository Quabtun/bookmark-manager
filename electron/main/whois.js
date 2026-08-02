import net from 'node:net'
import { requestWithTimeout } from './http.js'
import { loadSettings } from './store.js'

// WHOIS 根服务器（常用 TLD 的 WHOIS 服务器）
const WHOIS_SERVERS = {
  // 通用 TLD
  'com': 'whois.verisign-grs.com',
  'net': 'whois.verisign-grs.com',
  'org': 'whois.pir.org',
  'info': 'whois.afilias.net',
  'biz': 'whois.biz',
  'name': 'whois.nic.name',
  // 国家/地区 TLD
  'cn': 'whois.cnnic.cn',
  'com.cn': 'whois.cnnic.cn',
  'net.cn': 'whois.cnnic.cn',
  'org.cn': 'whois.cnnic.cn',
  'jp': 'whois.jprs.jp',
  'uk': 'whois.nic.uk',
  'de': 'whois.denic.de',
  'fr': 'whois.afnic.fr',
  'au': 'whois.auda.org.au',
  'io': 'whois.nic.io',
  'me': 'whois.nic.me',
  'dev': 'whois.nic.dev',
  'app': 'whois.nic.google',
  'google': 'whois.nic.google',
  'github': 'whois.nic.io',  // GitHub Pages 自定义域
  // 默认
  'default': 'whois.iana.org'
}

// 从 WHOIS 原始文本中提取关键字段
function parseWhois(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%') && !l.startsWith('#') && !l.startsWith('>'))
  const result = {
    domain: '',
    registrar: '',
    registrant: '',
    creationDate: '',
    expirationDate: '',
    updatedDate: '',
    status: [],
    nameServers: [],
    dnssec: '',
    raw: raw.slice(0, 3000)  // 保留前 3000 字符供查看
  }

  const fieldPatterns = {
    domain: [/^Domain Name:\s*(.+)$/im, /^domain:\s*(.+)$/im],
    registrar: [/^Registrar:\s*(.+)$/im, /^registrar:\s*(.+)$/im],
    registrant: [/^Registrant\s*Name:\s*(.+)$/im, /^Registrant:\s*(.+)$/im, /^registrant\s*name:\s*(.+)$/im],
    creationDate: [/^Creation Date:\s*(.+)$/im, /^Created:\s*(.+)$/im, /^Creation Time:\s*(.+)$/im, /^registration time:\s*(.+)$/im],
    expirationDate: [/^Registry Expiry Date:\s*(.+)$/im, /^Expiry Date:\s*(.+)$/im, /^Expiration Time:\s*(.+)$/im, /^expires:\s*(.+)$/im],
    updatedDate: [/^Updated Date:\s*(.+)$/im, /^Last Modified:\s*(.+)$/im, /^Updated:\s*(.+)$/im],
    dnssec: [/^DNSSEC:\s*(.+)$/im]
  }

  for (const [key, patterns] of Object.entries(fieldPatterns)) {
    for (const line of lines) {
      for (const re of patterns) {
        const m = line.match(re)
        if (m) {
          if (key === 'status') {
            result.status.push(m[1].trim())
          } else if (key === 'nameServers') {
            result.nameServers.push(m[1].trim().toLowerCase())
          } else if (!result[key]) {
            result[key] = m[1].trim()
          }
          break
        }
      }
    }
  }

  // 名称服务器（可能多行）
  let inNameserver = false
  for (const line of lines) {
    if (/^Name Server:/i.test(line) || /^nameserver:/i.test(line)) {
      const m = line.match(/:\s*(.+)$/)
      if (m && !result.nameServers.includes(m[1].trim().toLowerCase())) {
        result.nameServers.push(m[1].trim().toLowerCase())
      }
    }
  }

  return result
}

// 通过 TCP 43 端口查询 WHOIS（核心方法）
function whoisTcp(domain, server, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let data = ''
    let timer = setTimeout(() => {
      client.destroy()
      reject(new Error('whois 查询超时'))
    }, timeout)

    client.connect(43, server, () => {
      // 部分服务器需要在域名后加 \r\n，部分需要裸域名
      client.write(domain + '\r\n')
    })

    client.on('data', (chunk) => {
      data += chunk.toString('utf8')
      // 防止响应过大
      if (data.length > 10000) {
        client.destroy()
        resolve(data)
      }
    })

    client.on('close', () => {
      clearTimeout(timer)
      resolve(data)
    })

    client.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

// 根据域名 TLD 查找对应 WHOIS 服务器
function findWhoisServer(domain) {
  const parts = domain.toLowerCase().split('.')
  // 先试 ccTLD+domain (如 com.cn)
  if (parts.length >= 3) {
    const key = parts[parts.length - 2] + '.' + parts[parts.length - 1]
    if (WHOIS_SERVERS[key]) return WHOIS_SERVERS[key]
  }
  // 再试 TLD
  const tld = parts[parts.length - 1]
  if (WHOIS_SERVERS[tld]) return WHOIS_SERVERS[tld]
  return WHOIS_SERVERS['default']
}

// 在线 API 兜底（whois free API）
async function whoisOnlineApi(domain) {
  // whoisjs.com 公开接口
  try {
    const r = await requestWithTimeout(
      `https://api.whoisjs.com/v1/${encodeURIComponent(domain)}`,
      { method: 'GET', timeout: 6000 }
    )
    if (r.status === 200) {
      const j = JSON.parse(r.body.toString('utf8'))
      if (j && j.domain) return { source: 'online-api', data: j }
    }
  } catch { /* ignore */ }

  return null
}

// 公开接口：查询域名 WHOIS
// 返回 { domain, registrar, registrant, creationDate, expirationDate, status, nameServers, source, raw? }
export async function lookupWhois(url) {
  let domain
  try {
    const u = new URL(url)
    domain = u.hostname.replace(/^www\./, '')
  } catch {
    return { error: '无效 URL', url }
  }

  const settings = loadSettings()
  const preferOnline = settings.whois?.onlineFallback !== false  // 默认允许在线

  // 方法 1：直接 TCP WHOIS
  const server = findWhoisServer(domain)
  try {
    const raw = await whoisTcp(domain, server, 8000)
    if (raw && raw.length > 10) {
      const parsed = parseWhois(raw)
      parsed.domain = domain
      parsed.source = 'tcp-whois'
      parsed.server = server
      return parsed
    }
  } catch (e) {
    console.warn('[whois] TCP WHOIS 失败:', domain, e.message)
  }

  // 方法 2：拼接 WHOIS 服务器（从反查获取）
  try {
    const referredServer = await followWhoisReferral(domain)
    if (referredServer) {
      const raw = await whoisTcp(domain, referredServer, 8000)
      if (raw && raw.length > 10) {
        const parsed = parseWhois(raw)
        parsed.domain = domain
        parsed.source = 'tcp-whois-referral'
        parsed.server = referredServer
        return parsed
      }
    }
  } catch (e) {
    console.warn('[whois] 推荐服务器 WHOIS 失败:', e.message)
  }

  // 方法 3：在线 API 兜底
  if (preferOnline) {
    const online = await whoisOnlineApi(domain)
    if (online) {
      if (online.data) {
        return {
          domain,
          registrar: online.data.registrar || '',
          registrant: online.data.registrant || '',
          creationDate: online.data.creationDate || online.data.created || '',
          expirationDate: online.data.expirationDate || online.data.expires || '',
          status: online.data.status || [],
          nameServers: online.data.nameServers || [],
          source: 'online-api'
        }
      }
      if (online.raw) {
        const parsed = parseWhois(online.raw)
        parsed.domain = domain
        return parsed
      }
    }
  }

  return { domain, error: '无法获取 WHOIS 信息（域名可能不支持或未联网）', source: 'none' }
}

// 跟随 WHOIS  referral（从 IANA 获取推荐服务器）
async function followWhoisReferral(domain) {
  try {
    const raw = await whoisTcp(domain, 'whois.iana.org', 5000)
    const m = raw.match(/whois:\s*(.+)/i)
    if (m && m[1]) return m[1].trim()
  } catch { /* ignore */ }
  return null
}

// 检查 WHOIS 功能是否可用
export function isWhoisReady() {
  return true  // TCP WHOIS 无需预装数据库，始终可用
}
