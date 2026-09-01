import https from 'node:https'
import http from 'node:http'
import { URL } from 'node:url'
import net from 'node:net'
import { Transform } from 'node:stream'
import dns from 'node:dns/promises'
import { execSync } from 'node:child_process'
import { loadSettings } from './store.js'

// 代理配置缓存（避免每次请求都读磁盘）
let _proxyCache = null
let _proxyCacheTime = 0
const PROXY_CACHE_TTL = 30000  // 30秒缓存

// 检测系统代理（Windows 注册表）
function detectSystemProxy() {
  try {
    // 优先检查环境变量
    const envProxy = process.env.HTTP_PROXY || process.env.http_proxy ||
                     process.env.HTTPS_PROXY || process.env.https_proxy ||
                     process.env.ALL_PROXY || process.env.all_proxy
    if (envProxy) {
      try {
        const u = new URL(envProxy)
        const type = u.protocol === 'socks5:' || u.protocol === 'socks:' ? 'socks5' : 'http'
        console.log('[http] 检测到环境变量代理:', type, u.hostname + ':' + u.port)
        return {
          host: u.hostname,
          port: parseInt(u.port) || (type === 'socks5' ? 1080 : 8080),
          type,
          username: decodeURIComponent(u.username || ''),
          password: decodeURIComponent(u.password || '')
        }
      } catch { /* ignore */ }
    }

    // Windows: 从注册表读取系统代理
    if (process.platform === 'win32') {
      const output = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
        { encoding: 'utf-8', timeout: 3000 }
      )
      const enableMatch = output.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/)
      if (enableMatch && parseInt(enableMatch[1], 16) === 1) {
        const serverOutput = execSync(
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
          { encoding: 'utf-8', timeout: 3000 }
        )
        const serverMatch = serverOutput.match(/ProxyServer\s+REG_SZ\s+(.+)/)
        if (serverMatch) {
          let proxyStr = serverMatch[1].trim()
          // ProxyServer 可能格式：
          //   "127.0.0.1:7890"  -- 所有协议共用
          //   "http=127.0.0.1:7890;https=127.0.0.1:7890"  -- 分协议
          let host = ''
          let port = 8080
          let type = 'http'

          if (proxyStr.includes('=')) {
            // 分协议格式，取 https 或 http
            const parts = proxyStr.split(';')
            const httpsPart = parts.find(p => p.startsWith('https='))
            const httpPart = parts.find(p => p.startsWith('http='))
            const socksPart = parts.find(p => p.startsWith('socks='))
            const chosen = socksPart || httpsPart || httpPart
            if (chosen) {
              proxyStr = chosen.split('=')[1]
              if (chosen.startsWith('socks')) type = 'socks5'
            }
          }

          const colonIdx = proxyStr.lastIndexOf(':')
          if (colonIdx > 0) {
            host = proxyStr.substring(0, colonIdx)
            port = parseInt(proxyStr.substring(colonIdx + 1)) || 8080
          } else {
            host = proxyStr
          }

          if (host) {
            console.log('[http] 检测到系统代理:', type, host + ':' + port)
            return { host, port, type, username: '', password: '' }
          }
        }
      }
    }
  } catch (e) {
    // 静默失败，不影响正常流程
  }
  return null
}

// 获取代理配置（带缓存）
// 优先级：用户手动配置 > 系统代理 > 无代理
function getProxyConfig() {
  const now = Date.now()
  if (_proxyCache !== undefined && _proxyCache !== null && (now - _proxyCacheTime) < PROXY_CACHE_TTL) {
    return _proxyCache
  }

  try {
    const s = loadSettings()
    const p = s.proxy
    if (p && p.enabled && p.host && p.port) {
      // 用户手动配置的代理，优先使用
      _proxyCache = {
        host: p.host,
        port: parseInt(p.port) || 8080,
        type: p.type || 'http',
        username: p.username || '',
        password: p.password || ''
      }
      _proxyCacheTime = now
      console.log('[http] 使用用户配置代理:', _proxyCache.type, _proxyCache.host + ':' + _proxyCache.port)
      return _proxyCache
    }

    // 用户未配置代理，尝试检测系统代理
    const sysProxy = detectSystemProxy()
    if (sysProxy) {
      _proxyCache = sysProxy
      _proxyCacheTime = now
      return _proxyCache
    }

    _proxyCache = null
    _proxyCacheTime = now
    return null
  } catch (e) {
    console.warn('[http] 获取代理配置失败:', e.message)
    return null
  }
}

// 外部可调用：清除代理缓存（设置变更时调用）
export function clearProxyCache() {
  _proxyCache = null
  _proxyCacheTime = 0
}

// 统一请求：自动直连或走代理
export function requestWithTimeout(url, opts = {}) {
  const proxy = getProxyConfig()
  if (proxy) {
    if (proxy.type === 'socks5') {
      return socks5Request(proxy, url, opts)
    }
    return httpProxyRequest(proxy, url, opts)
  }
  return directRequest(url, opts)
}

// 直接请求（原始稳定实现，带重定向跟踪和超时）
function directRequest(targetUrl, { method = 'GET', timeout = 8000, headers = {}, followRedirect = true, maxRedirect = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0
    let currentUrl = targetUrl
    let timer = null

    const doReq = (reqUrl) => {
      let u
      try { u = new URL(reqUrl) } catch { return reject(new Error('invalid url: ' + reqUrl)) }
      const lib = u.protocol === 'http:' ? http : https
      const reqHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...headers
      }

      const req = lib.request(u, { method, headers: reqHeaders, timeout }, (res) => {
        if (followRedirect && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < maxRedirect) {
          redirectCount++
          res.resume()
          currentUrl = new URL(res.headers.location, u).toString()
          // 重置全局超时
          clearTimeout(timer)
          timer = setTimeout(() => reject(new Error('timeout')), timeout + 3000)
          return doReq(currentUrl)
        }
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          clearTimeout(timer)
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), finalUrl: currentUrl })
        })
      })
      req.on('timeout', () => { req.destroy(new Error('timeout')) })
      req.on('error', (e) => { clearTimeout(timer); reject(e) })
      req.on('close', () => { clearTimeout(timer) })
      req.end()
    }

    // 全局超时兜底
    timer = setTimeout(() => reject(new Error('timeout')), timeout + 3000)
    doReq(currentUrl)
  })
}

// HTTP/HTTPS 代理请求
function httpProxyRequest(proxy, targetUrl, opts) {
  const u = new URL(targetUrl)
  const useHttps = u.protocol === 'https:'
  const proxyAuth = proxy.username
    ? 'Basic ' + Buffer.from(proxy.username + ':' + proxy.password).toString('base64')
    : ''
  const timeout = opts.timeout || 8000

  if (useHttps) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('proxy timeout')), timeout + 3000)
      const req = http.request({
        host: proxy.host, port: proxy.port, method: 'CONNECT',
        path: u.hostname + ':' + (u.port || 443),
        headers: proxyAuth ? { 'Proxy-Authorization': proxyAuth } : {},
        timeout
      })
      req.on('connect', (_res, socket) => {
        const req2 = https.request({
          host: u.hostname, port: u.port || 443,
          path: u.pathname + u.search, method: opts.method || 'GET',
          headers: { ...opts.headers, 'Host': u.hostname },
          socket, agent: false, timeout
        }, (res) => {
          const chunks = []
          res.on('data', c => chunks.push(c))
          res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), finalUrl: targetUrl }) })
        })
        req2.on('error', (e) => { clearTimeout(timer); reject(e) })
        req2.end()
      })
      req.on('timeout', () => { req.destroy(new Error('timeout')) })
      req.on('error', (e) => { clearTimeout(timer); reject(e) })
      req.end()
    })
  } else {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('proxy timeout')), timeout + 3000)
      const req = http.request({
        host: proxy.host, port: proxy.port, method: opts.method || 'GET',
        path: u.href,
        headers: { ...opts.headers, 'Host': u.hostname, ...(proxyAuth ? { 'Proxy-Authorization': proxyAuth } : {}) },
        timeout
      }, (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), finalUrl: targetUrl }) })
      })
      req.on('timeout', () => { req.destroy(new Error('timeout')) })
      req.on('error', (e) => { clearTimeout(timer); reject(e) })
      req.end()
    })
  }
}

// SOCKS5 代理请求（支持无认证与用户名/密码认证 RFC 1929，覆盖 HTTP/HTTPS）
function socks5Request(proxy, targetUrl, opts) {
  const u = new URL(targetUrl)
  const useHttps = u.protocol === 'https:'
  const timeout = opts.timeout || 8000
  const hasAuth = !!(proxy.username && proxy.password)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socks5 proxy timeout')), timeout + 3000)
    const socket = new net.Socket()
    let connected = false

    socket.setTimeout(timeout)

    socket.on('connect', () => {
      // SOCKS5 握手：若有凭证则提供用户名/密码(0x02)+无认证(0x00)，否则仅无认证
      socket.write(Buffer.from(hasAuth ? [0x05, 0x02, 0x02, 0x00] : [0x05, 0x01, 0x00]))
    })

    let handshakeState = 'init'
    const sendConnectRequest = () => {
      const host = u.hostname
      const port = u.port || (useHttps ? 443 : 80)
      const domainLen = Buffer.from(host).length
      const buf = Buffer.alloc(7 + domainLen)
      buf[0] = 0x05   // VER
      buf[1] = 0x01   // CMD CONNECT
      buf[2] = 0x00   // RSV
      buf[3] = 0x03   // ATYP domain
      buf[4] = domainLen
      Buffer.from(host).copy(buf, 5)
      buf.writeUInt16BE(port, 5 + domainLen)
      socket.write(buf)
    }
    const onData = (data) => {
      if (handshakeState === 'init' && data.length >= 2) {
        if (data[1] === 0x02) {
          // 服务器选择用户名/密码认证 (RFC 1929)
          handshakeState = 'auth'
          const user = Buffer.from(proxy.username)
          const pass = Buffer.from(proxy.password)
          const buf = Buffer.alloc(3 + user.length + pass.length)
          buf[0] = 0x01 // 版本
          buf[1] = user.length
          user.copy(buf, 2)
          buf[2 + user.length] = pass.length
          pass.copy(buf, 3 + user.length)
          socket.write(buf)
        } else if (data[1] === 0x00) {
          // 服务器选择了无认证
          handshakeState = 'request'
          sendConnectRequest()
        } else {
          clearTimeout(timer)
          socket.destroy()
          reject(new Error('socks5 proxy no acceptable auth method (code: ' + data[1] + ')'))
        }
      } else if (handshakeState === 'auth' && data.length >= 2) {
        if (data[1] === 0x00) {
          // 认证成功
          handshakeState = 'request'
          sendConnectRequest()
        } else {
          clearTimeout(timer)
          socket.destroy()
          reject(new Error('socks5 proxy authentication failed (code: ' + data[1] + ')'))
        }
      } else if (handshakeState === 'request' && data.length >= 4 && data[1] === 0x00) {
        // 连接成功
        handshakeState = 'connected'
        socket.removeListener('data', onData)
        connected = true

        const lib = useHttps ? https : http
        const req = lib.request({
          host: u.hostname,
          port: u.port || (useHttps ? 443 : 80),
          path: u.pathname + u.search,
          method: opts.method || 'GET',
          headers: { ...opts.headers, 'Host': u.hostname },
          socket, agent: false, timeout
        }, (res) => {
          const chunks = []
          res.on('data', c => chunks.push(c))
          res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), finalUrl: targetUrl }) })
        })
        req.on('error', (e) => { clearTimeout(timer); reject(e) })
        req.end()
      } else if (data[1] !== 0x00) {
        clearTimeout(timer)
        socket.destroy()
        reject(new Error('socks5 proxy refused connection (code: ' + data[1] + ')'))
      }
    }
    socket.on('data', onData)
    socket.on('timeout', () => { clearTimeout(timer); socket.destroy(); reject(new Error('socks5 timeout')) })
    socket.on('error', (e) => { clearTimeout(timer); reject(e) })

    socket.connect(proxy.port, proxy.host)
  })
}

// ============================================================
// 流式下载到可写流（支持 HTTP/SOCKS5 代理，适用于大文件如更新包）
// 避免 68MB 更新包加载到内存，直接写入文件流
// ============================================================
// HTTP CONNECT 隧道（HTTPS 目标经 HTTP 代理）
function httpTunnelConnect(proxy, targetUrl, timeout) {
  const u = new URL(targetUrl)
  const proxyAuth = proxy.username
    ? 'Basic ' + Buffer.from(proxy.username + ':' + proxy.password).toString('base64')
    : ''
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.host, port: proxy.port, method: 'CONNECT',
      path: u.hostname + ':' + (u.port || 443),
      headers: proxyAuth ? { 'Proxy-Authorization': proxyAuth } : {},
      timeout
    })
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        return reject(new Error('代理 CONNECT 失败: HTTP ' + res.statusCode))
      }
      resolve(socket)
    })
    req.on('timeout', () => { req.destroy(new Error('代理连接超时')) })
    req.on('error', reject)
    req.end()
  })
}

// SOCKS5 建立到目标的连接，返回 socket（流式版本）
function socks5Connect(proxy, targetUrl, timeout) {
  const u = new URL(targetUrl)
  const useHttps = u.protocol === 'https:'
  const hasAuth = !!(proxy.username && proxy.password)

  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('socks5 代理超时')) }, timeout + 3000)
    socket.setTimeout(timeout)

    socket.on('connect', () => {
      socket.write(Buffer.from(hasAuth ? [0x05, 0x02, 0x02, 0x00] : [0x05, 0x01, 0x00]))
    })

    let hs = 'init'
    const sendConnect = () => {
      const host = u.hostname
      const port = u.port || (useHttps ? 443 : 80)
      const dlen = Buffer.from(host).length
      const buf = Buffer.alloc(7 + dlen)
      buf[0] = 0x05; buf[1] = 0x01; buf[2] = 0x00; buf[3] = 0x03; buf[4] = dlen
      Buffer.from(host).copy(buf, 5)
      buf.writeUInt16BE(port, 5 + dlen)
      socket.write(buf)
    }
    const onData = (data) => {
      if (hs === 'init' && data.length >= 2) {
        if (data[1] === 0x02) {
          hs = 'auth'
          const user = Buffer.from(proxy.username)
          const pass = Buffer.from(proxy.password)
          const buf = Buffer.alloc(3 + user.length + pass.length)
          buf[0] = 0x01; buf[1] = user.length
          user.copy(buf, 2)
          buf[2 + user.length] = pass.length
          pass.copy(buf, 3 + user.length)
          socket.write(buf)
        } else if (data[1] === 0x00) {
          hs = 'request'; sendConnect()
        } else {
          clearTimeout(timer); socket.destroy()
          reject(new Error('socks5 代理不支持此认证方式 (code: ' + data[1] + ')'))
        }
      } else if (hs === 'auth' && data.length >= 2) {
        if (data[1] === 0x00) { hs = 'request'; sendConnect() }
        else { clearTimeout(timer); socket.destroy(); reject(new Error('socks5 认证失败 (code: ' + data[1] + ')')) }
      } else if (hs === 'request' && data.length >= 4 && data[1] === 0x00) {
        hs = 'connected'
        socket.removeListener('data', onData)
        clearTimeout(timer)
        resolve(socket)
      } else if (data[1] !== 0x00) {
        clearTimeout(timer); socket.destroy()
        reject(new Error('socks5 连接被拒绝 (code: ' + data[1] + ')'))
      }
    }
    socket.on('data', onData)
    socket.on('timeout', () => { clearTimeout(timer); socket.destroy(); reject(new Error('socks5 超时')) })
    socket.on('error', (e) => { clearTimeout(timer); reject(e) })
    socket.connect(proxy.port, proxy.host)
  })
}

/**
 * 流式下载到可写流，自动走配置的代理（HTTP/SOCKS5）
 * @param {string} url 下载地址
 * @param {import('stream').Writable} writable 目标可写流（如 fs.createWriteStream）
 * @param {object} opts { onProgress, timeout, headers, maxRedirect, onRequest }
 *   - onProgress({ receivedBytes, totalBytes }) 进度回调
 *   - onRequest(req) 每次创建请求时回调，可用于保存 req 引用以便取消
 */
export function downloadToStream(url, writable, { onProgress, timeout = 30000, headers = {}, maxRedirect = 5, onRequest = null } = {}) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0
    let settled = false
    const safeResolve = (v) => { if (!settled) { settled = true; resolve(v) } }
    const safeReject = (e) => { if (!settled) { settled = true; reject(e) } }

    // 只在第一次请求时读取代理配置，重定向时复用
    const proxy = getProxyConfig()
    console.log('[http] 下载开始 | 代理:', proxy ? proxy.type + '://' + proxy.host + ':' + proxy.port : '直连', '| URL:', url)

    const doDownload = (reqUrl) => {
      let u
      try { u = new URL(reqUrl) } catch { return safeReject(new Error('无效的下载 URL: ' + reqUrl)) }

      const useHttps = u.protocol === 'https:'
      const reqHeaders = { 'User-Agent': 'BookmarkManager-Updater', ...headers }

      // 优化 socket 性能
      const optimizeSocket = (socket) => {
        if (socket) {
          try { socket.setNoDelay(true) } catch { /* ignore */ }
          try { socket.setKeepAlive(true) } catch { /* ignore */ }
        }
      }

      const onResp = (res) => {
        // 重定向
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < maxRedirect) {
          redirectCount++
          res.resume()
          const newUrl = new URL(res.headers.location, u).toString()
          return doDownload(newUrl)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return safeReject(new Error('下载失败: HTTP ' + res.statusCode))
        }

        const totalBytes = parseInt(res.headers['content-length'] || 0)
        let receivedBytes = 0
        let lastNotify = 0

        // [FIX] 使用 Transform 流代替 res.on('data')，避免与 pipe 的背压冲突
        // 之前的 res.on('data') + res.pipe(writable) 同时使用会破坏流的背压机制
        // pipe 无法正确暂停源流，导致数据传输效率下降
        const counter = new Transform({
          transform(chunk, encoding, callback) {
            receivedBytes += chunk.length
            const now = Date.now()
            if (onProgress && (now - lastNotify > 200 || receivedBytes === totalBytes)) {
              lastNotify = now
              onProgress({ receivedBytes, totalBytes })
            }
            callback(null, chunk)
          }
        })

        // writable 被外部 destroy（取消下载）时，销毁所有流并 reject
        const onWritableClose = () => {
          try { res.destroy() } catch { /* ignore */ }
          try { counter.destroy() } catch { /* ignore */ }
          safeReject(new Error('下载已取消'))
        }
        writable.once('close', onWritableClose)

        // 使用 counter 作为中间流：res -> counter -> writable
        // 这样 pipe 会正确处理每一级的背压
        res.pipe(counter).pipe(writable)

        writable.on('finish', () => {
          writable.removeListener('close', onWritableClose)
          safeResolve({ ok: true, receivedBytes, totalBytes, finalUrl: reqUrl })
        })
        writable.on('error', (e) => {
          writable.removeListener('close', onWritableClose)
          try { res.destroy() } catch { /* ignore */ }
          try { counter.destroy() } catch { /* ignore */ }
          safeReject(e)
        })
      }

      const handleReqError = (e) => safeReject(e)
      const attachReq = (req) => {
        req.on('timeout', () => req.destroy(new Error('下载超时（' + timeout + 'ms 无响应）')))
        req.on('error', handleReqError)
        if (onRequest) onRequest(req)
      }

      if (!proxy) {
        // 直连
        const lib = useHttps ? https : http
        const req = lib.get(u, { headers: reqHeaders, timeout }, (res) => {
          optimizeSocket(res.socket)
          onResp(res)
        })
        attachReq(req)
      } else if (proxy.type === 'socks5') {
        // SOCKS5 代理
        socks5Connect(proxy, u, timeout).then((socket) => {
          optimizeSocket(socket)
          const lib = useHttps ? https : http
          const req = lib.request({
            host: u.hostname, port: u.port || (useHttps ? 443 : 80),
            path: u.pathname + u.search, method: 'GET',
            headers: { ...reqHeaders, Host: u.hostname },
            socket, agent: false, timeout
          }, onResp)
          attachReq(req)
          req.end()
        }).catch(handleReqError)
      } else {
        // HTTP 代理
        if (useHttps) {
          httpTunnelConnect(proxy, u, timeout).then((socket) => {
            optimizeSocket(socket)
            const req = https.request({
              host: u.hostname, port: u.port || 443,
              path: u.pathname + u.search, method: 'GET',
              headers: { ...reqHeaders, Host: u.hostname },
              socket, agent: false, timeout
            }, onResp)
            attachReq(req)
            req.end()
          }).catch(handleReqError)
        } else {
          const proxyAuth = proxy.username
            ? 'Basic ' + Buffer.from(proxy.username + ':' + proxy.password).toString('base64')
            : ''
          const req = http.request({
            host: proxy.host, port: proxy.port, method: 'GET',
            path: u.href,
            headers: { ...reqHeaders, Host: u.hostname, ...(proxyAuth ? { 'Proxy-Authorization': proxyAuth } : {}) },
            timeout
          }, onResp)
          attachReq(req)
          req.end()
        }
      }
    }

    doDownload(url)
  })
}

// 下载有限字节
export function downloadLimited(url, maxBytes = 1024 * 1024, timeout = 8000) {
  return requestWithTimeout(url, { method: 'GET', timeout, headers: { 'Range': 'bytes=0-' + (maxBytes - 1) } })
}

// DNS 解析
export async function resolveHost(hostname) {
  try {
    const r = await dns.lookup(hostname, { all: true, family: 0 })
    return r.map(x => x.address)
  } catch { return [] }
}

// 获取第一个成功的 URL
export async function fetchFirstOk(urls, timeout = 8000) {
  for (const u of urls) {
    try {
      const r = await downloadLimited(u, 2 * 1024 * 1024, timeout)
      if (r.status >= 200 && r.status < 400 && r.body && r.body.length > 0) {
        return { url: u, body: r.body, contentType: r.headers['content-type'] || '' }
      }
    } catch { /* next */ }
  }
  return null
}
