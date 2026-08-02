// 本地 QR Code 生成器（Model 2, 字节模式, 纠错等级 L/M/Q/H）
// 纯 Node.js 实现，不依赖外部服务或 npm 包，避免书签 URL 泄露给第三方
// 基于 ISO/IEC 18004 标准实现

// ---- Galois Field GF(256) 算术 ----
const EXP = new Array(512)
const LOG = new Array(256)
;(function () {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

// ---- 多项式运算 ----
function gexp(n) { return EXP[n] }
function glog(n) { return LOG[n] }

class Polynomial {
  constructor(num, shift = 0) {
    let offset = 0
    while (offset < num.length && num[offset] === 0) offset++
    this.num = new Array(num.length - offset + shift).fill(0)
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset]
  }
  get(i) { return this.num[i] }
  get length() { return this.num.length }
  multiply(e) {
    const num = new Array(this.length + e.length - 1).fill(0)
    for (let i = 0; i < this.length; i++)
      for (let j = 0; j < e.length; j++)
        num[i + j] ^= gfMul(this.get(i), e.get(j))
    return new Polynomial(num)
  }
  mod(e) {
    let num = this.num.slice()
    while (num.length - e.length >= 0) {
      const coef = num[0]
      if (coef === 0) { num.shift(); continue }
      for (let i = 0; i < e.length; i++) num[i] ^= gfMul(e.get(i), coef)
      num.shift()
    }
    return new Polynomial(num)
  }
}

function getECPolynomial(ecLen) {
  let p = new Polynomial([1])
  for (let i = 0; i < ecLen; i++) p = p.multiply(new Polynomial([1, gexp(i)]))
  return p
}

// ---- RS 块信息表 [总数, 数据块, RS块] ----
// 每项: [count, dataCount, ecCount]
const RS_BLOCKS = {
  L: [[1,26,19],[1,44,34],[1,70,55],[1,100,80],[1,134,108],[2,86,68],[2,98,78],[2,121,97],[2,146,116],[2,86,68],[2,86,68],[4,101,81],[2,116,92],[2,117,98],[3,111,71],[4,87,67],[2,179,133],[2,97,73],[2,141,101],[4,137,87],[2,145,89],[2,165,99],[3,147,109],[4,131,87],[3,176,107],[4,170,104],[3,159,91],[3,177,107],[4,191,107],[4,175,93],[4,191,107],[3,190,111],[4,179,107],[4,199,115],[3,211,121],[4,219,119],[3,209,111],[4,215,111],[3,215,111],[4,221,115]],
  M: [[1,20,16],[1,36,28],[1,60,44],[2,46,32],[2,66,40],[4,40,24],[4,51,30],[2,36,22],[3,50,22],[4,46,24],[4,60,28],[5,58,28],[5,58,28],[5,62,26],[5,68,26],[5,62,24],[6,70,24],[6,66,26],[7,72,26],[7,76,26],[7,80,26],[7,80,26],[7,96,28],[9,92,28],[9,98,28],[10,98,28],[10,112,28],[11,110,28],[12,116,28],[13,116,28],[14,122,28],[15,122,28],[16,122,28],[17,122,28],[18,136,28],[19,140,28],[20,140,28],[21,142,28],[22,144,28],[23,144,28]],
  Q: [[1,18,13],[1,34,22],[1,52,26],[2,42,18],[2,66,24],[4,42,18],[4,52,24],[5,54,24],[5,62,26],[6,58,26],[6,66,28],[7,66,28],[7,70,26],[8,74,26],[9,74,26],[9,72,24],[10,86,28],[10,82,26],[11,86,26],[12,84,26],[12,88,26],[13,90,28],[14,92,28],[15,88,24],[16,96,28],[17,98,28],[18,100,28],[19,102,28],[20,104,28],[21,106,28],[22,108,28],[23,108,28],[24,112,28],[25,112,28],[26,120,28],[27,122,28],[28,124,28],[29,126,28],[30,128,28],[31,130,28],[32,132,28]],
  H: [[1,16,9],[1,28,16],[2,22,13],[2,34,22],[2,42,18],[4,20,10],[4,26,14],[4,26,14],[5,30,16],[6,30,16],[6,34,18],[7,34,18],[7,38,18],[8,38,18],[9,42,20],[9,42,20],[10,46,20],[10,46,20],[11,48,20],[12,50,20],[12,52,22],[13,52,22],[14,56,22],[16,58,22],[17,60,22],[18,62,22],[19,64,22],[20,66,22],[21,68,22],[22,70,22],[23,72,22],[24,74,22],[25,76,22],[26,80,24],[27,82,24],[28,84,24],[29,86,24],[30,90,24],[31,92,24],[32,94,24],[33,96,24]]
}

function getRSBlocks(version, ecLevel) {
  const table = RS_BLOCKS[ecLevel][version - 1]
  const list = []
  for (let i = 0; i < table.length; i += 3) {
    const count = table[i], dataCount = table[i + 1], ecCount = table[i + 2]
    for (let j = 0; j < count; j++) list.push({ dataCount, ecCount })
  }
  return list
}

// ---- 每版本数据容量（字节模式，仅取常用等级 M；用于选版本）----
// 容量表：version 1..40，按等级 [L,M,Q,H]
const CAPACITY = {
  L:[17,32,53,78,106,134,154,192,230,271,321,367,425,458,506,564,608,681,711,780,842,892,946,1006,1074,1124,1214,1274,1330,1396,1448,1514,1566,1632,1716,1786,1872,1940,2002,2086],
  M:[14,26,42,62,84,106,122,152,180,213,247,281,314,341,381,409,447,491,519,562,597,635,681,723,767,805,853,891,941,982,1024,1070,1114,1170,1228,1278,1342,1392,1446,1520],
  Q:[11,20,35,50,67,80,95,120,136,160,193,227,251,269,291,313,338,367,387,420,445,478,511,544,570,612,648,681,716,755,788,826,864,906,952,1004,1058,1122,1170,1236],
  H:[7,14,24,34,44,58,64,84,98,119,137,155,177,194,211,231,249,273,292,320,347,373,407,437,461,511,535,589,637,667,698,718,768,805,861,911,957,1007,1061,1105]
}

// ---- QRCode 编码器 ----
const PAD0 = 0xEC, PAD1 = 0x11

function selectVersion(dataLen, ecLevel) {
  const caps = CAPACITY[ecLevel]
  for (let v = 1; v <= 40; v++) if (dataLen <= caps[v - 1]) return v
  return -1
}

function lengthBits(version) {
  if (version < 10) return 8
  if (version < 27) return 16
  return 16
}

function buildMatrix(version, ecLevel, data) {
  const size = version * 4 + 17
  const matrix = Array.from({ length: size }, () => new Array(size).fill(null))
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false))

  // 定位图案
  const placeFinder = (r, c) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r + dr, cc = c + dc
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue
        const onEdge = (dr === -1 || dr === 7 || dc === -1 || dc === 7)
        const isBorder = (dr === 0 || dr === 6) && (dc >= 0 && dc <= 6)
        const isSide = (dc === 0 || dc === 6) && (dr >= 0 && dr <= 6)
        const isCenter = (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
        if (isBorder || isSide || isCenter) matrix[rr][cc] = true
        else if (onEdge) matrix[rr][cc] = false
      }
    }
  }
  placeFinder(0, 0); placeFinder(0, size - 7); placeFinder(size - 7, 0)

  // 定时图案
  for (let i = 8; i < size - 8; i++) { matrix[6][i] = (i % 2 === 0); matrix[i][6] = (i % 2 === 0) }

  // 对齐图案
  if (version > 1) {
    const centers = ALIGN_TABLE[version - 2]
    for (let i = 0; i < centers.length; i++) {
      for (let j = 0; j < centers.length; j++) {
        const r = centers[i], c = centers[j]
        if (matrix[r][c] !== null) continue
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const isB = (Math.abs(dr) === 2 || Math.abs(dc) === 2)
          const isC = (dr === 0 && dc === 0)
          matrix[r + dr][c + dc] = isB ? true : (isC ? true : false)
        }
      }
    }
  }

  // 预留格式信息区域
  for (let i = 0; i < 9; i++) { if (matrix[8][i] === null) { matrix[8][i] = false; reserved[8][i] = true } }
  for (let i = 0; i < 8; i++) { if (matrix[i][8] === null) { matrix[i][8] = false; reserved[i][8] = true } }
  for (let i = 0; i < 8; i++) { if (matrix[size - 1 - i][8] === null) { matrix[size - 1 - i][8] = false; reserved[size - 1 - i][8] = true } }
  for (let i = 0; i < 9; i++) { if (matrix[8][size - 1 - i] === null) { matrix[8][size - 1 - i] = false; reserved[8][size - 1 - i] = true } }
  matrix[size - 8][8] = true // 暗模块

  // 版本信息（v>=7）
  if (version >= 7) {
    const bits = versionBits(version)
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3), c = (i % 3) + size - 11
      const bit = ((bits >> i) & 1) === 1
      matrix[r][c] = bit; matrix[c][r] = bit
    }
  }

  // 填充数据（Z 字形）
  let bitIdx = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let v = 0; v < size; v++) {
      for (let col = 0; col < 2; col++) {
        const x = right - col
        const goingUp = ((right + 1) & 2) === 0
        const y = goingUp ? size - 1 - v : v
        if (matrix[y][x] === null) {
          const byteIdx = bitIdx >> 3, bitInByte = 7 - (bitIdx & 7)
          let bit = false
          if (byteIdx < data.length) bit = ((data[byteIdx] >> bitInByte) & 1) === 1
          matrix[y][x] = bit
          bitIdx++
        }
      }
    }
  }

  // 掩码选择
  const ecBits = { L: 1, M: 0, Q: 3, H: 2 }[ecLevel]
  let bestMask = -1, bestPenalty = Infinity, bestMatrix = null
  for (let mask = 0; mask < 8; mask++) {
    const test = matrix.map((row, r) => row.map((v, c) => (reserved[r][c] ? v : applyMask(v, r, c, mask))))
    writeFormatInfo(test, reserved, ecBits, mask, size)
    const penalty = calcPenalty(test, size)
    if (penalty < bestPenalty) { bestPenalty = penalty; bestMask = mask; bestMatrix = test }
  }
  return { matrix: bestMatrix, size }
}

function applyMask(v, r, c, mask) {
  if (v === null) return false
  let m = false
  switch (mask) {
    case 0: m = (r + c) % 2 === 0; break
    case 1: m = r % 2 === 0; break
    case 2: m = c % 3 === 0; break
    case 3: m = (r + c) % 3 === 0; break
    case 4: m = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break
    case 5: m = ((r * c) % 2 + (r * c) % 3) === 0; break
    case 6: m = (((r * c) % 2 + (r * c) % 3) % 2) === 0; break
    case 7: m = (((r + c) % 2 + (r * c) % 3) % 2) === 0; break
  }
  return m ? !v : v
}

function writeFormatInfo(matrix, reserved, ecBits, mask, size) {
  // 计算 15 位格式信息：5 位数据(2 ECC + 3 mask) + 10 位 BCH 纠错，再异或掩码 0x5412
  const data = (ecBits << 3) | mask
  let v = data << 10
  for (let i = 14; i >= 10; i--) {
    if ((v >> i) & 1) v ^= 0x537 << (i - 10)
  }
  const bits = v ^ 0x5412
  for (let i = 0; i < 15; i++) {
    const bit = ((bits >> i) & 1) === 1
    if (i < 6) matrix[8][i] = bit
    else if (i === 6) matrix[8][7] = bit
    else if (i === 7) matrix[8][8] = bit
    else if (i === 8) matrix[7][8] = bit
    else matrix[14 - i][8] = bit
    if (i < 8) matrix[size - 1 - i][8] = bit
    else matrix[8][size - 15 + i] = bit
  }
  matrix[size - 8][8] = true // 暗模块
}

function versionBits(version) {
  // 18 位版本信息：6 位版本号 + 12 位 BCH(Golay)，生成多项式 0x1F25
  let v = version << 12
  for (let i = 17; i >= 12; i--) {
    if ((v >> i) & 1) v ^= 0x1f25 << (i - 12)
  }
  return v
}

function calcPenalty(m, size) {
  let p = 0
  // 规则1：连续同色
  for (let r = 0; r < size; r++) {
    let run = 1
    for (let c = 1; c < size; c++) { if (m[r][c] === m[r][c - 1]) run++; else { if (run >= 5) p += run - 2; run = 1 } }
    if (run >= 5) p += run - 2
  }
  for (let c = 0; c < size; c++) {
    let run = 1
    for (let r = 1; r < size; r++) { if (m[r][c] === m[r - 1][c]) run++; else { if (run >= 5) p += run - 2; run = 1 } }
    if (run >= 5) p += run - 2
  }
  // 规则2：2x2 同色块
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++)
      if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3
  // 规则3：明暗比（简化）
  let dark = 0
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++
  const ratio = dark / (size * size)
  p += Math.floor(Math.abs(ratio * 100 - 50) / 5) * 10
  return p
}

// 对齐图案中心位置表（version 2..40）
const ALIGN_TABLE = [
  [6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],
  [6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,30,60,90],[6,34,62,94],
  [6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],
  [6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]
]

// 编码主入口：文本 → 数据字节流（含模式指示、长度、填充）
function encodeData(text, version, ecLevel) {
  const bytes = Buffer.from(text, 'utf8')
  const rsBlocks = getRSBlocks(version, ecLevel)
  const totalDataBytes = rsBlocks.reduce((s, b) => s + b.dataCount, 0)

  const bits = []
  const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1) }
  // 模式指示符：字节模式 0100
  pushBits(0b0100, 4)
  // 长度
  pushBits(bytes.length, lengthBits(version))
  // 数据
  for (const b of bytes) pushBits(b, 8)
  // 终止符（最多4位）
  const totalBits = totalDataBytes * 8
  for (let i = 0; i < 4 && bits.length < totalBits; i++) bits.push(0)
  // 字节对齐
  while (bits.length % 8 !== 0) bits.push(0)
  // 填充
  const dataBuf = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]
    dataBuf.push(b)
  }
  let padByte = 0
  while (dataBuf.length < totalDataBytes) { dataBuf.push(padByte ? PAD1 : PAD0); padByte ^= 1 }

  // 分块 + RS 纠错
  const blocks = []
  const ecBlocks = []
  let offset = 0
  for (const blk of rsBlocks) {
    const data = dataBuf.slice(offset, offset + blk.dataCount)
    offset += blk.dataCount
    const ec = rsEncode(data, blk.ecCount)
    blocks.push(data)
    ecBlocks.push(ec)
  }

  // 交错
  const result = []
  const maxData = Math.max(...blocks.map(b => b.length))
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) result.push(b[i])
  const maxEc = Math.max(...ecBlocks.map(b => b.length))
  for (let i = 0; i < maxEc; i++) for (const b of ecBlocks) if (i < b.length) result.push(b[i])
  return result
}

function rsEncode(data, ecLen) {
  const gen = getECPolynomial(ecLen)
  const buf = data.slice()
  // 多项式除法
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i]
    if (coef === 0) continue
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen.get(j), coef)
  }
  return buf.slice(data.length)
}

// ---- 对外接口 ----
export function generateQRSvg(text, ecLevel = 'M') {
  const version = selectVersion(Buffer.byteLength(text, 'utf8'), ecLevel)
  if (version < 0) throw new Error('数据过长，超出 QR Code 最大容量')
  const data = encodeData(text, version, ecLevel)
  const { matrix, size } = buildMatrix(version, ecLevel, data)
  const scale = 8, margin = 4
  const dim = (size + margin * 2) * scale
  let rects = ''
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) rects += `<rect x="${(c + margin) * scale}" y="${(r + margin) * scale}" width="${scale}" height="${scale}"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
}

export function generateQRDataUrl(text, ecLevel = 'M') {
  const svg = generateQRSvg(text, ecLevel)
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64')
}
