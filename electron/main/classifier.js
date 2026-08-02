import { loadCategories } from './store.js'

// 自动分类引擎：域名规则库 + 关键词权重 + TLD + 分类预设标签
// 规则结构: { categoryId, domains:[], keywords:[], tlDs:[] }
const RULES = [
  {
    categoryId: 'cat-dev', keywords: ['github', 'gitee', 'stackoverflow', 'gitlab', 'npm', 'pypi', 'v2ex', 'juejin', 'csdn', '掘金', '稀土', '开发者', 'coding', 'codepen', 'jsdelivr', 'unpkg', 'registry', 'dev', 'api', 'sdk', '框架', '编程', '算法', 'leetcode', '牛客'],
    domains: ['github.com', 'gitlab.com', 'gitee.com', 'stackoverflow.com', 'codepen.io', 'jsfiddle.net', 'npmjs.com', 'pypi.org', 'v2ex.com', 'juejin.cn', 'csdn.net', 'leetcode.com', 'leetcode.cn', 'nowcoder.com', 'developer.mozilla.org', 'segmentfault.com', 'cnblogs.com']
  },
  {
    categoryId: 'cat-design', keywords: ['dribbble', 'behance', 'figma', 'sketch', '设计', 'ui', 'ux', '配色', '字体', '图标', 'icon', 'logo', '素材', 'psd', 'pinterest', '花瓣', '壁纸', 'design'],
    domains: ['dribbble.com', 'behance.net', 'figma.com', 'huaban.com', 'pinterest.com', 'iconfont.cn', 'ui.cn', 'zcool.com.cn']
  },
  {
    categoryId: 'cat-study', keywords: ['wiki', '教程', '文档', 'course', '课程', 'mooc', '公开课', '学习', '考研', '考试', '知乎', 'bilibili', '学', '书', 'book', 'docs', 'reference', '百科'],
    domains: ['wikipedia.org', 'baike.baidu.com', 'zhihu.com', 'mooc.cn', 'icourse163.org', 'ted.com', 'duolingo.cn', 'khanacademy.org']
  },
  {
    categoryId: 'cat-tools', keywords: ['工具', '转换', '转换器', 'converter', '在线', '计算', 'json', '格式化', '生成', 'generator', 'tool', 'utility', '翻译', 'translate', '下载', '网盘', '云盘', '种子', '磁力'],
    domains: ['translate.google.com', 'fanyi.baidu.com', 'deepl.com', 'tool.lu', 'pan.baidu.com', 'aliyundrive.com', '123pan.com']
  },
  {
    categoryId: 'cat-social', keywords: ['微博', 'weibo', 'twitter', 'facebook', 'instagram', 'discord', 'telegram', 'reddit', '贴吧', '论坛', '社区', '社交', 'chat', '交友', '微信', 'qq', '朋友圈'],
    domains: ['weibo.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'discord.com', 't.me', 'reddit.com', 'tieba.baidu.com', 'douban.com']
  },
  {
    categoryId: 'cat-news', keywords: ['新闻', 'news', '头条', '日报', '报道', '资讯', '时事', '热点', '新浪', '网易', '腾讯新闻', '央视', 'cctv', '光明网', '环球', 'paper', 'press'],
    domains: ['news.sina.com.cn', 'news.163.com', 'news.qq.com', 'thepaper.cn', 'cctv.com', 'reuters.com', 'bbc.com', 'bbc.co.uk']
  },
  {
    categoryId: 'cat-shop', keywords: ['购物', '商城', 'shop', 'store', '淘宝', 'taobao', '天猫', 'tmall', '京东', 'jd', '拼多多', 'pdd', '亚马逊', 'amazon', '苏宁', '唯品会', '优惠', '折扣', 'coupon', 'deal'],
    domains: ['taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com', 'amazon.cn', 'amazon.com', 'suning.com', 'vip.com', 'smzdm.com']
  },
  {
    categoryId: 'cat-fun', keywords: ['游戏', 'game', 'steam', 'epic', '视频', 'video', '电影', 'movie', '动漫', 'anime', '音乐', 'music', 'spotify', '网易云', 'b站', '哔哩', 'youku', '爱奇艺', 'iqiyi', '腾讯视频', '娱乐', '直播', 'live', 'stream', '小说', 'novel'],
    domains: ['bilibili.com', 'youku.com', 'iqiyi.com', 'v.qq.com', 'music.163.com', 'spotify.com', 'steampowered.com', 'epicgames.com', 'douban.com', 'taptap.com', 'mgtv.com']
  }
]

// 分类标签缓存索引（避免每次评分都读磁盘）
let _catTagIndex = null

function buildCatTagIndex() {
  _catTagIndex = {}
  const cats = loadCategories()
  for (const c of cats) {
    if (c.tags && c.tags.length) _catTagIndex[c.id] = c.tags.map((t) => t.toLowerCase())
  }
  return _catTagIndex
}

function scoreBookmark(bm, rule, catTagIndex) {
  const url = (bm.url || '').toLowerCase()
  const title = (bm.title || '').toLowerCase()
  const desc = (bm.description || '').toLowerCase()
  const tags = (bm.tags || []).map((t) => t.toLowerCase())
  const text = url + ' ' + title + ' ' + desc + ' ' + tags.join(' ')

  let score = 0
  // 域名精确匹配：高分
  try {
    const host = new URL(bm.url).hostname.replace(/^www\./, '')
    if (rule.domains && rule.domains.some((d) => host === d || host.endsWith('.' + d))) {
      score += 100
    }
  } catch { /* ignore */ }
  // 内置关键词
  if (rule.keywords) {
    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase())) score += kw.length >= 4 ? 10 : 6
    }
  }
  // 分类预设标签
  if (catTagIndex && catTagIndex[rule.categoryId]) {
    for (const tag of catTagIndex[rule.categoryId]) {
      if (text.includes(tag) || tags.includes(tag)) score += 8
    }
  }
  return score
}

// 对单个书签给出建议分类（返回 categoryId 或 null）
// 未匹配到任何规则时返回 null，避免强制归入「其他/未分类」
export function suggestCategory(bm) {
  return suggestCategoryWithCats(bm, buildCatTagIndex())
}

// 内部：接受预构建的标签索引
function suggestCategoryWithCats(bm, catTagIndex) {
  let best = null
  let bestScore = 0
  for (const rule of RULES) {
    const s = scoreBookmark(bm, rule, catTagIndex)
    if (s > bestScore) { bestScore = s; best = rule.categoryId }
  }
  return bestScore >= 6 ? best : null
}

// 批量分类：返回每个书签的建议映射 [{id, suggested}]
export function suggestBatch(bookmarks) {
  const catTagIndex = buildCatTagIndex()
  return bookmarks.map((bm) => ({ id: bm.id, suggested: suggestCategoryWithCats(bm, catTagIndex) }))
}

// 应用自动分类到书签列表（不修改原数组，返回新数组）
// protectManual=true 时，manualSet 的书签保留其手动分类
export function applyAutoClassify(bookmarks, { protectManual = true, overrideManual = false } = {}) {
  const catTagIndex = buildCatTagIndex()
  return bookmarks.map((bm) => {
    const suggested = suggestCategoryWithCats(bm, catTagIndex)
    if (protectManual && !overrideManual && bm.manualSet && bm.manualCategoryId) {
      return { ...bm, categoryId: bm.manualCategoryId, autoCategorySuggested: suggested }
    }
    return {
      ...bm,
      categoryId: suggested,
      autoCategorySuggested: suggested,
      manualSet: overrideManual ? false : bm.manualSet
    }
  })
}

// 刷新缓存（分类变更后调用）
export function refreshCatTagIndex() { _catTagIndex = null }
