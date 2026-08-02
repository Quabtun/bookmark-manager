/**
 * 书签统计插件
 * 
 * 演示插件 API 的使用方式。
 * 安装：将 bookmark-stats 文件夹复制到数据目录的 plugins/ 下。
 */

exports.activate = function (api) {
  api.log('书签统计插件已激活')

  // 启动时执行一次统计
  const bookmarks = api.getBookmarks()
  const categories = api.getCategories()

  const stats = {
    total: bookmarks.length,
    byStatus: {},
    byCategory: {},
    withTags: bookmarks.filter(b => b.tags && b.tags.length > 0).length,
    avgTags: 0
  }

  let tagCount = 0
  for (const b of bookmarks) {
    stats.byStatus[b.status || 'unknown'] = (stats.byStatus[b.status || 'unknown'] || 0) + 1
    if (b.categoryId) {
      const cat = categories.find(c => c.id === b.categoryId)
      const catName = cat ? cat.name : b.categoryId
      stats.byCategory[catName] = (stats.byCategory[catName] || 0) + 1
    }
    if (b.tags) tagCount += b.tags.length
  }
  stats.avgTags = bookmarks.length > 0 ? (tagCount / bookmarks.length).toFixed(1) : 0

  api.log('统计结果:', JSON.stringify(stats, null, 2))

  // 持久化存储统计
  api.store.set('lastStats', stats)
  api.store.set('lastRun', Date.now())

  // 导出 tab 面板
  exports.renderTab = function () {
    const stats = api.store.get('lastStats', { total: 0, byStatus: {}, byCategory: {} })
    const lastRun = new Date(api.store.get('lastRun', 0)).toLocaleString('zh-CN')

    let html = '<div style="padding:20px; font-family:system-ui,sans-serif;">'
    html += '<h2 style="margin:0 0 16px">📊 书签统计</h2>'
    html += '<p style="color:#888;font-size:12px">最后更新: ' + lastRun + '</p>'
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0">'

    // 状态卡片
    const statusLabels = { ok: '✅ 正常', dead: '💀 失效', warn: '⚠️ 异常', unknown: '❓ 未检查', redirect: '🔁 跳转' }
    for (const [status, count] of Object.entries(stats.byStatus)) {
      const pct = stats.total > 0 ? Math.round(count / stats.total * 100) : 0
      html += '<div style="background:#f8fafc;border-radius:12px;padding:12px;text-align:center">'
      html += '<div style="font-size:24px;font-weight:700">' + count + '</div>'
      html += '<div style="font-size:12px;color:#666">' + (statusLabels[status] || status) + '</div>'
      html += '<div style="margin-top:6px;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden">'
      html += '<div style="height:100%;width:' + pct + '%;background:' + (status === 'ok' ? '#22c55e' : status === 'dead' ? '#ef4444' : '#f59e0b') + ';border-radius:2px"></div>'
      html += '</div></div>'
    }
    html += '</div>'

    // 分类分布
    if (Object.keys(stats.byCategory).length > 0) {
      html += '<h3 style="margin:20px 0 8px;font-size:14px">分类分布</h3>'
      for (const [cat, count] of Object.entries(stats.byCategory)) {
        const pct = stats.total > 0 ? Math.round(count / stats.total * 100) : 0
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        html += '<span style="width:80px;font-size:12px;text-align:right">' + cat + '</span>'
        html += '<div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden">'
        html += '<div style="height:100%;width:' + pct + '%;background:#3b82f6;border-radius:4px"></div>'
        html += '</div>'
        html += '<span style="font-size:11px;color:#888;width:40px">' + count + ' (' + pct + '%)</span>'
        html += '</div>'
      }
    }

    html += '</div>'
    return html
  }

  // 导出设置面板
  exports.renderSettings = function () {
    return '<div style="padding:16px">' +
      '<p style="font-size:13px;margin-bottom:12px">书签统计插件设置</p>' +
      '<p style="font-size:12px;color:#666">统计信息在每次应用启动时自动更新。</p>' +
      '<button onclick="location.reload()" style="margin-top:12px;padding:6px 16px;border-radius:8px;background:#3b82f6;color:#fff;border:none;cursor:pointer;font-size:12px">重新统计</button>' +
      '</div>'
  }
}

exports.deactivate = function () {
  // 清理
}
