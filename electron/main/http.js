import https from 'node:https'
import http from 'node:http'
import { URL } from 'node:url'
import net from 'node:net'
import dns from 'node:dns/promises'
import { loadSettings } from './store.js'

// 获取代理配置
function getProxyConfig() {
  try {
    const s = loadSettings()
    const p = s.proxy
    if (!p || !p.enabled || !p.host || !p.port) return null
    return {
      host: p.host,
      port: parseInt(p.port) || 8080,
      type: p.type || 'http',  // http | socks5
      username: p.username || '',
      password: p.password || ''
    }
  } catch { return null }
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
