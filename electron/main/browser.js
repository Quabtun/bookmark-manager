import { shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { loadSettings } from './store.js'

// 浏览器预设的可执行路径（Windows）
const BROWSER_PATHS = {
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`
  ].filter(Boolean),
  edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`
  ].filter(Boolean),
  firefox: [
    'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Mozilla Firefox\\firefox.exe`
  ].filter(Boolean)
}

function findFirstExists(paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p
    } catch { /* ignore */ }
  }
  return null
}

// 用配置的默认浏览器打开 URL
export function openInBrowser(url) {
  const settings = loadSettings()
  const cfg = settings.defaultBrowser || { preset: 'system' }

  console.log('[browser] opening with preset:', cfg.preset, 'path:', cfg.path)

  let exePath = ''
  if (cfg.preset === 'system' || !cfg.preset) {
    console.log('[browser] using system default')
    return shell.openExternal(url)
  } else if (cfg.preset === 'custom') {
    exePath = cfg.path
  } else if (BROWSER_PATHS[cfg.preset]) {
    exePath = findFirstExists(BROWSER_PATHS[cfg.preset]) || cfg.path
  }

  if (!exePath) {
    console.log('[browser] preset', cfg.preset, 'not found, falling back to system')
    return shell.openExternal(url)
  }

  console.log('[browser] spawning:', exePath, url)
  try {
    spawn(exePath, [url], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch (e) {
    console.error('[browser] spawn error:', e.message)
    return shell.openExternal(url)
  }
}

// 探测已安装的浏览器（供设置页显示）
export function detectBrowsers() {
  const result = {}
  for (const key of Object.keys(BROWSER_PATHS)) {
    const found = findFirstExists(BROWSER_PATHS[key])
    result[key] = found ? { installed: true, path: found } : { installed: false, path: null }
  }
  result.system = { installed: true, path: '(系统默认)' }
  return result
}
