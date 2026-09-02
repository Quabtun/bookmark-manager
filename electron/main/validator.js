import { requestWithTimeout } from './http.js'
import dns from 'node:dns/promises'
import { mapValidationResults } from './validator-logic.js'

// Status: ok / redirect / warn / dead / unknown
// Concurrency: 3 (avoid rate limiting)
async function runPool(items, limit, fn) {
  const results = new Array(items.length)
  const queue = items.map((item, i) => ({ item, i }))
  let next = 0

  async function worker() {
    while (next < queue.length) {
      const idx = next++
      const { item, i } = queue[idx]
      try {
        const res = await fn(item)
        results[i] = res
      } catch (e) {
        results[i] = { status: 'dead', code: 0, message: e.message || 'unknown', finalUrl: item }
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function validateUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { status: 'dead', code: 0, message: 'invalid URL', finalUrl: url || '' }
  }
  // Step 0: quick DNS check (reject obviously invalid domains early)
  let host = ''
  try { host = new URL(url).hostname } catch { return { status: 'dead', code: 0, message: 'invalid URL', finalUrl: url } }
  try {
    await dns.lookup(host, { family: 0, hints: dns.ADDRCONFIG });
  } catch (dnsErr) {
    return { status: 'dead', code: 0, message: 'DNS: ' + dnsErr.message, finalUrl: url }
  }
  try {
    let r
    // Step 1: GET with browser User-Agent (some sites reject HEAD)
    try {
      r = await requestWithTimeout(url, {
        method: 'GET', timeout: 15000, followRedirect: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      })
    } catch (e) {
      // Step 2: HEAD fallback
      try {
        r = await requestWithTimeout(url, { method: 'HEAD', timeout: 12000, followRedirect: true })
      } catch (e2) {
        // Step 3: try HTTP (non-HTTPS) fallback
        try {
          const httpUrl = url.replace(new RegExp('^https?://', 'i'), 'http://')
          if (httpUrl !== url) {
            r = await requestWithTimeout(httpUrl, { method: 'GET', timeout: 12000, followRedirect: true })
          } else {
            return { status: 'dead', code: 0, message: e2.message || e.message || 'unreachable', finalUrl: url }
          }
        } catch (e3) {
          return { status: 'dead', code: 0, message: e3.message || e2.message || 'unreachable', finalUrl: url }
        }
      }
    }

    if (!r) return { status: 'dead', code: 0, message: 'no response', finalUrl: url }
    const code = r.status

    // 2xx/3xx: success or redirect (redirect = still reachable)
    if (code >= 200 && code < 400) {
      return { status: 'ok', code, message: 'ok', finalUrl: r.finalUrl }
    }
    // 401/403 = auth required but server reachable
    if (code === 401 || code === 403) {
      return { status: 'ok', code, message: 'auth (' + code + ')', finalUrl: r.finalUrl }
    }
    // 5xx = server problem, server reachable
    if (code >= 500 && code < 600) {
      return { status: 'warn', code, message: 'server error (' + code + ')', finalUrl: r.finalUrl }
    }
    // 4xx = client error, server reachable (e.g. 404 page not found but domain valid)
    if (code >= 400 && code < 500) {
      return { status: 'warn', code, message: 'HTTP ' + code, finalUrl: r.finalUrl }
    }
    return { status: 'warn', code, message: 'unexpected (' + code + ')', finalUrl: r.finalUrl }
  } catch (e) {
    return { status: 'dead', code: 0, message: e.message || 'unreachable', finalUrl: url }
  }
}

// Batch validate; onProgress(done, total, currentUrl, result)
export async function validateBatch(urls, { limit = 3, onProgress } = {}) {
  if (!Array.isArray(urls) || urls.length === 0) return []
  // Dedup: same URL validated once, result reused
  const unique = [...new Set(urls)]
  if (unique.length < urls.length) {
    console.log('[validateBatch] dedup:' + urls.length + ' -> ' + unique.length)
  }
  let doneCount = 0
  const total = unique.length
  const results = await runPool(unique, limit, async (url) => {
    const r = await validateUrl(url)
    doneCount++
    if (onProgress) onProgress(doneCount, total, url, r)
    return r
  })
  // Map back to original order
  return mapValidationResults(urls, unique, results)
}