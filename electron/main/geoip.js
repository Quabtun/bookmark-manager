import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { resolveHost, requestWithTimeout } from './http.js'
import { DATA_DIR, loadSettings } from './store.js'

let cityLookup = null
let asnLookup = null
let loadedPaths = { city: '', asn: '' }

// ============================================================
// 默认库管理 —— 从 GitHub 免费源下载 GeoLite2 数据库
// P3TERX/GeoLite.mmdb 是广为人知的免费自动更新 GeoLite2 仓库
// ============================================================
const DEFAULT_DB_NAMES = {
  city: 'GeoLite2-City.mmdb',
  asn: 'GeoLite2-ASN.mmdb'
}

const GEOLITE_DOWNLOAD_URLS = {
  city: 'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb',
  asn: 'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-ASN.mmdb'
}

const GEOLITE_API_URL = 'https://api.github.com/repos/P3TERX/GeoLite.mmdb/releases/latest'

function getGeoipDir() {
  return path.join(DATA_DIR, 'geoip')
}

function getDefaultDbPath(kind) {
  return path.join(getGeoipDir(), DEFAULT_DB_NAMES[kind] || DEFAULT_DB_NAMES.city)
}

// 获取有效的库路径：优先用户手动导入的，其次默认库
function getEffectiveDbPath(kind) {
  const settings = loadSettings()
  const userPath = kind === 'asn' ? settings.geoip.asnMmdbPath : settings.geoip.cityMmdbPath
  if (userPath && fs.existsSync(userPath)) return userPath
  const defaultPath = getDefaultDbPath(kind)
  if (fs.existsSync(defaultPath)) return defaultPath
  return null
}

// 懒加载 mmdb
async function getLookups() {
  const cityPath = getEffectiveDbPath('city')
  const asnPath = getEffectiveDbPath('asn')

  if (cityPath && loadedPaths.city !== cityPath) {
    try {
      const maxmind = await import('maxmind')
      cityLookup = await maxmind.open(cityPath)
      loadedPaths.city = cityPath
    } catch (e) { cityLookup = null; console.error('city mmdb load fail', e.message) }
  } else if (!cityPath) {
    cityLookup = null
    loadedPaths.city = ''
  }

  if (asnPath && loadedPaths.asn !== asnPath) {
    try {
      const maxmind = await import('maxmind')
      asnLookup = await maxmind.open(asnPath)
      loadedPaths.asn = asnPath
    } catch (e) { asnLookup = null; console.error('asn mmdb load fail', e.message) }
  } else if (!asnPath) {
    asnLookup = null
    loadedPaths.asn = ''
  }

  return { cityLookup, asnLookup }
}

export function isGeoipReady() {
  return !!getEffectiveDbPath('city')
}

// 获取数据库信息
export function getDbInfo(kind) {
  const effectivePath = getEffectiveDbPath(kind)
  if (!effectivePath) return { exists: false, isDefault: false, kind }

  const isDefault = effectivePath === getDefaultDbPath(kind)
  try {
    const stat = fs.statSync(effectivePath)
    return {
      exists: true,
      path: effectivePath,
      isDefault,
      kind,
      size: stat.size,
      sizeMB: +(stat.size / 1024 / 1024).toFixed(1),
      modifiedAt: stat.mtime.toISOString()
    }
  } catch {
    return { exists: false, isDefault: false, kind }
  }
}

// 获取所有数据库信息
export function getAllDbInfo() {
  return {
    city: getDbInfo('city'),
    asn: getDbInfo('asn')
  }
}

// 流式下载 mmdb 文件（支持大文件 + 进度回调 + 重定向）
export function downloadDb(kind, onProgress) {
  return new Promise((resolve, reject) => {
    const url = GEOLITE_DOWNLOAD_URLS[kind]
    if (!url) return reject(new Error('无效的数据库类型: ' + kind))

    // 确保目录存在
    const geoipDir = getGeoipDir()
    if (!fs.existsSync(geoipDir)) fs.mkdirSync(geoipDir, { recursive: true })

    const destPath = getDefaultDbPath(kind)
    const tmpPath = destPath + '.tmp-' + process.pid
    const file = fs.createWriteStream(tmpPath)

    let totalBytes = 0
    let receivedBytes = 0
    let redirectCount = 0
    const MAX_REDIRECT = 5

    const cleanup = () => {
      try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    }

    const doRequest = (reqUrl) => {
      let u
      try { u = new URL(reqUrl) } catch { return reject(new Error('无效的下载 URL')) }
      const lib = u.protocol === 'http:' ? http : https

      const req = lib.get(u, {
        headers: { 'User-Agent': 'BookmarkManager-GeoIP-Updater' },
        timeout: 30000
      }, (res) => {
        // 处理重定向
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < MAX_REDIRECT) {
          redirectCount++
          res.resume()
          const newUrl = new URL(res.headers.location, u).toString()
          return doRequest(newUrl)
        }

        if (res.statusCode !== 200) {
          file.close()
          cleanup()
          return reject(new Error(`下载失败: HTTP ${res.statusCode}`))
        }

        totalBytes = parseInt(res.headers['content-length'] || 0)

        res.on('data', (chunk) => {
          receivedBytes += chunk.length
          if (onProgress && totalBytes > 0) {
            onProgress({
              percent: Math.min(100, Math.round(receivedBytes / totalBytes * 100)),
              received: receivedBytes,
              total: totalBytes
            })
          }
        })

        res.pipe(file)

        file.on('finish', () => {
          file.close(() => {
            // 下载完成，重命名临时文件
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
              fs.renameSync(tmpPath, destPath)
            } catch {
              // Windows 上 rename 可能失败，回退为 copy + unlink
              try {
                fs.copyFileSync(tmpPath, destPath)
                fs.unlinkSync(tmpPath)
              } catch (e2) {
                cleanup()
                return reject(new Error('保存文件失败: ' + e2.message))
              }
            }
            // 下载了新的默认库后，清除旧的 lookup 缓存以便重新加载
            loadedPaths[kind] = ''
            resolve({ ok: true, path: destPath, size: receivedBytes })
          })
        })

        file.on('error', (e) => {
          cleanup()
          reject(e)
        })
      })

      req.on('timeout', () => {
        req.destroy(new Error('下载超时（30秒无响应）'))
      })

      req.on('error', (e) => {
        file.close()
        cleanup()
        reject(e)
      })
    }

    doRequest(url)
  })
}

// 检查数据库更新
export async function checkDbUpdate() {
  try {
    const r = await requestWithTimeout(GEOLITE_API_URL, {
      method: 'GET',
      timeout: 10000,
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'BookmarkManager-GeoIP-Updater'
      }
    })

    if (r.status !== 200 || !r.body) {
      return { hasUpdate: false, error: 'GitHub API 请求失败: HTTP ' + r.status }
    }

    const release = JSON.parse(r.body.toString())
    const remoteDate = release.published_at || ''

    const cityInfo = getDbInfo('city')
    const asnInfo = getDbInfo('asn')

    let hasUpdate = false
    const needCity = !cityInfo.exists
    const needAsn = !asnInfo.exists

    if (cityInfo.exists && remoteDate) {
      const localDate = new Date(cityInfo.modifiedAt).toISOString()
      if (remoteDate > localDate) hasUpdate = true
    }
    if (asnInfo.exists && remoteDate) {
      const localDate = new Date(asnInfo.modifiedAt).toISOString()
      if (remoteDate > localDate) hasUpdate = true
    }
    if (needCity || needAsn) hasUpdate = true

    return {
      hasUpdate,
      remoteDate,
      remoteVersion: release.tag_name || '',
      cityInfo,
      asnInfo,
      needCity,
      needAsn
    }
  } catch (e) {
    return { hasUpdate: false, error: e.message || '检查更新失败' }
  }
}

// 删除默认库
export function deleteDefaultDb(kind) {
  const dbPath = getDefaultDbPath(kind)
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    loadedPaths[kind] = ''
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function formatCity(c) {
  if (!c || !c.city) return ''
  const names = c.city.names
  return names && (names.zh_CN || names.en) || ''
}
function formatCountry(c) {
  if (!c || !c.country) return ''
  const names = c.country.names
  return names && (names.zh_CN || names.en) || ''
}
function formatSubdivision(c) {
  if (!c || !c.subdivisions || !c.subdivisions.length) return ''
  const names = c.subdivisions[0].names
  return names && (names.zh_CN || names.en) || ''
}

// 在线兜底：ip-api.com（单次查询，注意隐私）
async function queryOnline(ip) {
  const r = await requestWithTimeout(`http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,country,regionName,city,isp,org,as,query`, { method: 'GET', timeout: 6000 })
  if (r.status !== 200) return null
  try {
    const j = JSON.parse(r.body.toString('utf8'))
    if (j.status !== 'success') return null
    return {
      ip,
      country: j.country || '',
      region: j.regionName || '',
      city: j.city || '',
      isp: j.isp || j.org || '',
      asn: (j.as || '').replace(/^AS/, ''),
      source: 'online'
    }
  } catch { return null }
}

export async function lookupGeo(url) {
  let host
  let ip
  try {
    host = new URL(url).hostname
  } catch { return { error: 'invalid url' } }

  // 是否为 IP 直接
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
  if (isIp) {
    ip = host
  } else {
    const ips = await resolveHost(host)
    if (!ips.length) {
      return { host, error: 'dns 解析失败', source: 'none' }
    }
    ip = ips[0]
  }

  const settings = loadSettings()
  const { cityLookup: cl, asnLookup: al } = await getLookups()

  // 离线查询
  if (cl) {
    try {
      const c = cl.get(ip)
      if (c) {
        let asn = '', isp = ''
        if (al) {
          try {
            const a = al.get(ip)
            if (a && a.autonomous_system_number) asn = String(a.autonomous_system_number)
            if (a && a.autonomous_system_organization) isp = a.autonomous_system_organization
          } catch { /* ignore */ }
        }
        return {
          host, ip,
          country: formatCountry(c),
          region: formatSubdivision(c),
          city: formatCity(c),
          isp, asn,
          source: 'offline'
        }
      }
    } catch { /* fall through to online */ }
  }

  // 在线兜底
  if (settings.geoip.allowOnlineFallback) {
    const online = await queryOnline(ip)
    if (online) return online
  }

  return { host, ip, source: 'none', error: cl ? '离线库未命中且在线查询无结果' : '未配置离线库' }
}
