import fs from 'node:fs'
import { resolveHost, requestWithTimeout } from './http.js'
import { loadSettings } from './store.js'

let cityLookup = null
let asnLookup = null
let loadedPaths = { city: '', asn: '' }

// 懒加载 mmdb
async function getLookups() {
  const settings = loadSettings()
  const cityPath = settings.geoip.cityMmdbPath
  const asnPath = settings.geoip.asnMmdbPath

  if (cityPath && loadedPaths.city !== cityPath && fs.existsSync(cityPath)) {
    try {
      const maxmind = await import('maxmind')
      cityLookup = await maxmind.open(cityPath)
      loadedPaths.city = cityPath
    } catch (e) { cityLookup = null; console.error('city mmdb load fail', e.message) }
  }
  if (asnPath && loadedPaths.asn !== asnPath && fs.existsSync(asnPath)) {
    try {
      const maxmind = await import('maxmind')
      asnLookup = await maxmind.open(asnPath)
      loadedPaths.asn = asnPath
    } catch (e) { asnLookup = null; console.error('asn mmdb load fail', e.message) }
  }
  return { cityLookup, asnLookup }
}

export function isGeoipReady() {
  const settings = loadSettings()
  return !!(settings.geoip.cityMmdbPath && fs.existsSync(settings.geoip.cityMmdbPath))
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
