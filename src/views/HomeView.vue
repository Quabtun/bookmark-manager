<template>
  <div class="flex h-screen">
    <Sidebar
      @manage-categories="showCatMgr = true"
      @new-folder="onNewFolder"
      @open-credentials="showCred = true"
      @open-cookies="showCookie = true"
      @open-plugins="showPluginMgr = true"
      @open-snapshots="showSnap = true"
      @open-recycle="bm.showRecycled = true"
      @close-recycle="bm.showRecycled = false"
      @open-archive="bm.showArchived = true"
      @close-archive="bm.showArchived = false"
      @new-smart-folder="smartFolderDialog.visible = true"
    />

    <main class="flex-1 flex flex-col min-w-0 relative bg-theme"
          @contextmenu.prevent="onSurfaceContext"
          @dragover.prevent="onDragOverMain"
          @drop.prevent="onDropMain"
          @dragleave="onDragLeaveMain">

      <!-- 拖拽 URL 覆盖层 -->
      <div v-if="dropOverlay" class="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl px-8 py-6 text-center animate-pop border-2 border-dashed border-accent">
          <div class="text-4xl mb-2">📥</div>
          <div class="text-sm font-medium text-slate-600 dark:text-slate-300">拖放 URL 到此处添加书签</div>
        </div>
      </div>
      <Toolbar
        v-show="!bm.focusMode"
        v-model:ui_viewMode="viewMode"
        :search-history="searchHistory"
        :show-search-suggestions="showSearchSuggestions"
        :batch-running="ui.isBatchRunning"
        :batch-kind="ui.batchProgress.kind"
        @add="onAdd"
        @validate-all="validateAll"
        @load-all-previews="loadAllPreviews"
        @auto-classify="autoClassify"
        @refresh-all-favicons="refreshAllFavicons"
        @remove-duplicates="removeDuplicates"
        @clear-all="clearAll"
        @archive-selected="archiveSelected"
        @import-html="importHtml"
        @export-html="exportHtml"
        @export-json="exportJson"
        @export-styled-html="exportStyledHtml"
        @import-json="importJson"
        @import-from-browser="importFromBrowser"
        @import-pocket-csv="importPocketCsv"
        @import-csv="importCsv"
        @export-markdown="exportMarkdown"
        @select-search-suggestion="selectSearchSuggestion"
        @on-search-blur="onSearchBlur"
        @on-search-focus="onSearchFocus"
        @on-search-input="onSearchInput"
      />

      <!-- 统计条（可点击筛选） -->
      <div v-if="!bm.showRecycled" class="px-5 py-2 flex items-center gap-3 text-xs border-b border-slate-200/50 dark:border-slate-700/50">
        <button @click="bm.statusFilter = 'all'" :class="['px-2 py-0.5 rounded transition', bm.statusFilter === 'all' ? 'bg-accent text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700']">全部 {{ bm.stats.total }}</button>
        <button @click="bm.statusFilter = 'ok'" :class="['px-2 py-0.5 rounded transition', bm.statusFilter === 'ok' ? 'bg-green-500 text-white' : 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30']">✅ {{ bm.stats.ok }}</button>
        <button @click="bm.statusFilter = 'warn'" :class="['px-2 py-0.5 rounded transition', bm.statusFilter === 'warn' ? 'bg-amber-500 text-white' : 'text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30']">⚠️ {{ bm.stats.warn }}</button>
        <button @click="bm.statusFilter = 'dead'" :class="['px-2 py-0.5 rounded transition', bm.statusFilter === 'dead' ? 'bg-red-500 text-white' : 'text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30']">💀 {{ bm.stats.dead }}</button>
        <button @click="bm.statusFilter = 'redirect'" :class="['px-2 py-0.5 rounded transition', bm.statusFilter === 'redirect' ? 'bg-blue-500 text-white' : 'text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30']">🔁 {{ bm.stats.redirect }}</button>
        <button @click="bm.statusFilter = 'unknown'" :class="['px-2 py-0.5 rounded transition', bm.statusFilter === 'unknown' ? 'bg-slate-500 text-white' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700']">❓ {{ bm.stats.unknown }}</button>
        <span class="ml-auto" v-if="previewCacheMb !== null">🖼️ {{ previewCacheMb }} / {{ settings.settings.previewCacheLimitMB }} MB</span>
      </div>

      <!-- 回收站工具栏 -->
      <div v-if="bm.showRecycled"
           class="px-5 py-2 flex items-center gap-3 text-xs bg-red-50 dark:bg-red-900/20 border-b border-red-200/50 dark:border-red-800/50">
        <span class="font-medium text-red-600 dark:text-red-400">🗑️ 回收站</span>
        <span class="text-red-500">{{ bm.recycledCount }} 项</span>
        <div class="w-px h-4 bg-red-200 dark:bg-red-800"></div>
        <button v-if="bm.selected.size > 0" @click="batchRestoreSelected" class="btn-ghost text-xs py-0.5 text-green-600 dark:text-green-400">✅ 恢复选中 ({{ bm.selected.size }})</button>
        <button v-if="bm.selected.size > 0" @click="batchDeleteSelected" class="btn-ghost text-xs py-0.5 text-red-500">永久删除选中</button>
        <button v-else @click="doEmptyRecycleBin" :disabled="bm.recycledCount === 0" class="btn-ghost text-xs py-0.5 text-red-500">清空回收站</button>
        <div class="ml-auto">
          <button @click="bm.showRecycled = false" class="btn-ghost text-xs py-0.5">← 返回书签</button>
        </div>
      </div>

      <!-- 归档工具栏 -->
      <div v-if="bm.showArchived"
           class="px-5 py-2 flex items-center gap-3 text-xs bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200/50 dark:border-amber-800/50">
        <span class="font-medium text-amber-600 dark:text-amber-400">📦 归档</span>
        <span class="text-amber-500">{{ bm.archivedCount }} 项</span>
        <div class="w-px h-4 bg-amber-200 dark:bg-amber-800"></div>
        <button v-if="bm.selected.size > 0" @click="batchUnarchiveSelected" class="btn-ghost text-xs py-0.5 text-green-600 dark:text-green-400">✅ 取消归档选中 ({{ bm.selected.size }})</button>
        <button v-if="bm.selected.size > 0" @click="batchDeleteSelected" class="btn-ghost text-xs py-0.5 text-red-500">永久删除选中</button>
        <div class="ml-auto">
          <button @click="bm.showArchived = false" class="btn-ghost text-xs py-0.5">← 返回书签</button>
        </div>
      </div>

      <!-- 批量操作栏（选中项时出现） -->
      <div v-if="bm.selected.size > 0"
           class="px-5 py-2 flex items-center gap-3 text-xs bg-accent/10 border-b border-accent/20">
        <span class="font-medium">已选 {{ bm.selected.size }} 项</span>
        <button @click="bm.selectAll()" class="btn-ghost text-xs py-0.5">全选当前</button>
        <button @click="bm.clearSelection()" class="btn-ghost text-xs py-0.5">取消</button>
        <div class="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
        <!-- 批量移动分类 -->
        <select v-model="batchCatId" class="input w-auto text-xs py-0.5">
          <option value="">移动到分类…</option>
          <option v-for="c in cats.sorted" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
        </select>
        <button @click="batchMoveToCategory" :disabled="!batchCatId" class="btn-accent text-xs py-0.5">移动</button>
        <div class="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
        <!-- 批量添加标签 -->
        <div class="flex items-center gap-1">
          <input v-model="batchTagInput" @keydown.enter="batchAddTags" class="input w-28 text-xs py-0.5" placeholder="标签（回车添加）" />
          <button @click="batchAddTags" :disabled="!batchTagInput.trim()" class="btn-ghost text-xs py-0.5">+ 标签</button>
        </div>
        <div class="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
        <button @click="batchRefreshFavicon" class="btn-ghost text-xs py-0.5" title="重新抓取选中项图标">🔄 刷新图标</button>
        <button @click="batchDeleteSelected" class="btn-ghost text-xs py-0.5 text-red-500">🗑️ 删除选中</button>
      </div>

      <!-- 书签区 -->
      <div class="flex-1 overflow-y-auto p-5" ref="scrollArea">
        <!-- 空状态 -->
        <div v-if="bm.loaded && bm.flatFiltered.length === 0" class="h-full flex flex-col items-center justify-center text-slate-400">
          <div class="text-6xl mb-3">📭</div>
          <div class="text-lg">{{ bm.bookmarks.length === 0 ? '还没有书签' : '没有匹配的书签' }}</div>
          <div class="text-sm mt-1">{{ bm.bookmarks.length === 0 ? '点击右上角「新建」或「⋯」导入浏览器书签' : '试试调整搜索或筛选条件' }}</div>
          <button v-if="bm.bookmarks.length === 0" @click="importHtml" class="btn-primary mt-4">📥 导入浏览器书签</button>
        </div>

        <!-- 分组视图 -->
        <template v-if="bm.filtered && bm.filtered.grouped">
          <div v-for="(bookmarks, catId) in bm.filtered.groups" :key="catId" class="mb-6">
            <div @click="collapsedGroups[catId] = !collapsedGroups[catId]"
                 class="flex items-center gap-2 px-1 py-2 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg transition group">
              <span class="text-xs text-slate-400 transition-transform" :class="collapsedGroups[catId] ? '' : 'rotate-90'">&#9656;</span>
              <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {{ catId === 'unclassified' ? '未分类' : (cats.byId[catId]?.name || catId) }}
              </span>
              <span class="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{{ bookmarks.length }}</span>
            </div>
            <div v-show="!collapsedGroups[catId]" class="mt-2">
              <div v-if="viewMode === 'grid'" class="grid gap-3.5" :class="gridClass">
                <BookmarkCard
                  v-for="(b, idx) in bookmarks" :key="b.id" :bm="b" :view-mode="'grid'"
                  @edit="onEdit" @validate="onValidate" @geo="onGeo" @delete="onDeleteCard" @open="onOpen" @hover="onHover" @leave="onLeave" @context="onContext"
                  @reorder="onReorder"
                  @quick-note="onQuickNote"
                  @archive="onArchive"
                  @dragOver="() => {}" @dragLeave="() => {}"
                />
              </div>
              <div v-else class="space-y-1.5">
                <div v-for="(b, idx) in bookmarks" :key="b.id">
                  <BookmarkCard :bm="b" :view-mode="'list'"
                    @edit="onEdit" @validate="onValidate" @geo="onGeo" @delete="onDeleteCard" @open="onOpen" @hover="onHover" @leave="onLeave" @context="onContext"
                    @reorder="onReorder"
                    @quick-note="onQuickNote"
                    @archive="onArchive"
                    @dragOver="() => {}" @dragLeave="() => {}"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 网格视图（非分组） -->
        <div v-else-if="viewMode === 'grid'" class="grid gap-3.5" :class="gridClass">
          <BookmarkCard
            v-for="(b, idx) in bm.paginatedFiltered" :key="b.id" :bm="b" :view-mode="'grid'" :focused="focusedIndex === idx"
            @edit="onEdit" @validate="onValidate" @geo="onGeo" @delete="onDeleteCard" @open="onOpen" @hover="onHover" @leave="onLeave" @context="onContext"
            @reorder="onReorder"
            @quick-note="onQuickNote"
            @dragOver="() => {}" @dragLeave="() => {}"
            @archive="onArchive"
          />
        </div>

        <!-- 列表视图（非分组） -->
        <div v-else class="space-y-1.5">
          <div v-for="(b, idx) in bm.paginatedFiltered" :key="b.id">
            <BookmarkCard :bm="b" :view-mode="'list'" :focused="focusedIndex === idx"
              @edit="onEdit" @validate="onValidate" @geo="onGeo" @delete="onDeleteCard" @open="onOpen" @hover="onHover" @leave="onLeave" @context="onContext"
              @reorder="onReorder"
              @quick-note="onQuickNote"
              @dragOver="() => {}" @dragLeave="() => {}"
              @archive="onArchive"
            />
          </div>
        </div>
      </div>

      <!-- 分页导航栏（仅非分组视图显示） -->
      <div v-if="!bm.showRecycled && !bm.showArchived && !(bm.filtered && bm.filtered.grouped) && bm.totalPages > 1"
           class="px-5 py-2 flex items-center gap-3 text-xs border-t border-slate-200/50 dark:border-slate-700/50 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
        <span class="text-slate-500">共 {{ bm.flatFiltered.length }} 条</span>
        <span class="text-slate-400">第 {{ bm.currentPage }}/{{ bm.totalPages }} 页</span>
        <button @click="goToPage(bm.currentPage - 1)" :disabled="bm.currentPage <= 1" class="btn-ghost text-xs py-0.5 disabled:opacity-30">上一页</button>
        <button @click="goToPage(bm.currentPage + 1)" :disabled="bm.currentPage >= bm.totalPages" class="btn-ghost text-xs py-0.5 disabled:opacity-30">下一页</button>
        <div class="flex items-center gap-1">
          <input type="number" :value="bm.currentPage" @keydown.enter="goToPage(Number($event.target.value))" class="input w-14 text-xs py-0.5 text-center" min="1" :max="bm.totalPages" />
          <span class="text-slate-400">/ {{ bm.totalPages }}</span>
        </div>
        <div class="ml-auto flex items-center gap-1">
          <span class="text-slate-400">每页</span>
          <select v-model="bm.pageSize" class="input w-auto text-xs py-0.5">
            <option :value="30">30</option>
            <option :value="60">60</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
          </select>
          <span class="text-slate-400">条</span>
        </div>
      </div>
    </main>

    <!-- 书签详情侧滑面板 -->
    <teleport to="body">
      <transition name="slide-right">
        <div v-if="detailPanel.visible" class="fixed top-0 right-0 h-full w-[360px] z-40 bg-white dark:bg-slate-800 shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col" style="animation: slideInRight 0.25s ease-out">
          <!-- 关闭按钮 -->
          <button @click="detailPanel.visible = false" class="absolute top-3 right-3 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center text-slate-500 transition z-10" title="关闭 (Esc)">✕</button>

          <div v-if="detailPanel.bookmark" class="flex-1 overflow-y-auto p-5">
            <!-- Favicon + 标题 -->
            <div class="flex items-start gap-3 mb-4">
              <div class="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm ring-1 ring-black/5 shrink-0 overflow-hidden">
                <img v-if="detailPanel.bookmark.favicon" :src="detailPanel.bookmark.favicon" class="w-7 h-7 object-contain" />
                <span v-else class="text-xl font-bold" :style="{ color: '#64748b' }">{{ (detailPanel.bookmark.title || '?').charAt(0).toUpperCase() }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <h2 class="text-lg font-bold leading-snug break-words">{{ detailPanel.bookmark.title || detailPanel.bookmark.url }}</h2>
                <div class="text-xs text-slate-400 mt-0.5">ID: {{ detailPanel.bookmark.id?.slice(0, 8) }}</div>
              </div>
            </div>

            <!-- URL -->
            <div class="mb-4">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 mb-1">URL</div>
              <a :href="detailPanel.bookmark.url" @click.prevent="bm.recordOpen(detailPanel.bookmark.id); window.api.invoke('browser:open', detailPanel.bookmark.url)"
                 class="text-sm text-blue-500 hover:text-blue-600 break-all underline decoration-dotted">{{ detailPanel.bookmark.url }}</a>
            </div>

            <!-- 描述 -->
            <div v-if="detailPanel.bookmark.description" class="mb-4">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 mb-1">描述</div>
              <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{{ detailPanel.bookmark.description }}</p>
            </div>

            <!-- 备注 -->
            <div class="mb-4">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 mb-1">备注</div>
              <p class="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">{{ detailPanel.bookmark.notes || '(无)' }}</p>
            </div>

            <!-- 分类信息 -->
            <div class="mb-4">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 mb-1">分类</div>
              <span v-if="cats.byId[detailPanel.bookmark.categoryId]" class="chip" :style="{ background: cats.byId[detailPanel.bookmark.categoryId].color + '22', color: cats.byId[detailPanel.bookmark.categoryId].color }">
                {{ cats.byId[detailPanel.bookmark.categoryId].icon }} {{ cats.byId[detailPanel.bookmark.categoryId].name }}
              </span>
              <span v-else-if="detailPanel.bookmark.manualSet" class="chip">✋ 手动</span>
              <span v-else class="text-sm text-slate-400">未分类</span>
            </div>

            <!-- 标签列表 -->
            <div v-if="detailPanel.bookmark.tags && detailPanel.bookmark.tags.length" class="mb-4">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 mb-1">标签</div>
              <div class="flex flex-wrap gap-1">
                <span v-for="t in detailPanel.bookmark.tags" :key="t" class="chip">#{{ t }}</span>
              </div>
            </div>

            <!-- 状态信息 -->
            <div class="mb-4">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 mb-1">状态</div>
              <div class="flex items-center gap-2">
                <span :class="['w-2.5 h-2.5 rounded-full', {
                  'bg-green-500': detailPanel.bookmark.status === 'ok',
                  'bg-blue-400': detailPanel.bookmark.status === 'redirect',
                  'bg-amber-400': detailPanel.bookmark.status === 'warn',
                  'bg-red-500': detailPanel.bookmark.status === 'dead',
                  'bg-slate-300': !detailPanel.bookmark.status || detailPanel.bookmark.status === 'unknown'
                }]"></span>
                <span class="text-sm">{{ ({ ok: '正常', redirect: '跳转', warn: '异常', dead: '失效', unknown: '未检查' })[detailPanel.bookmark.status || 'unknown'] }}</span>
              </div>
              <div v-if="detailPanel.bookmark.statusCheckedAt" class="text-xs text-slate-400 mt-1">最后检查: {{ formatTime(detailPanel.bookmark.statusCheckedAt) }}</div>
            </div>

            <!-- 地理位置 -->
            <div v-if="detailPanel.bookmark.geo && !detailPanel.bookmark.geo.error" class="mb-4">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 mb-1">服务器位置</div>
              <p class="text-sm text-slate-600 dark:text-slate-300">📍 {{ [detailPanel.bookmark.geo.country, detailPanel.bookmark.geo.region, detailPanel.bookmark.geo.city, detailPanel.bookmark.geo.isp].filter(Boolean).join(' / ') }}</p>
            </div>

            <!-- 统计信息 -->
            <div class="mb-4">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 mb-1">统计</div>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
                  <div class="text-xs text-slate-400">打开次数</div>
                  <div class="font-semibold">{{ detailPanel.bookmark.openCount || 0 }}</div>
                </div>
                <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
                  <div class="text-xs text-slate-400">最后打开</div>
                  <div class="font-semibold text-xs">{{ detailPanel.bookmark.lastOpenedAt ? formatTime(detailPanel.bookmark.lastOpenedAt) : '从未' }}</div>
                </div>
                <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2 col-span-2">
                  <div class="text-xs text-slate-400">添加时间</div>
                  <div class="font-semibold text-xs">{{ formatTime(detailPanel.bookmark.addedAt) }}</div>
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex flex-wrap gap-2 mt-6">
              <button @click="onEdit(detailPanel.bookmark); detailPanel.visible = false" class="btn-accent text-xs">✏️ 编辑</button>
              <button @click="bm.recordOpen(detailPanel.bookmark.id); window.api.invoke('browser:open', detailPanel.bookmark.url)" class="btn-ghost text-xs">🔗 打开 URL</button>
              <button @click="bm.remove(detailPanel.bookmark.id); detailPanel.visible = false; window.$toast('已移入回收站', 'info')" class="btn-ghost text-xs text-red-500">🗑️ 删除</button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- 专注模式退出按钮 -->
    <button v-if="bm.focusMode" @click="bm.focusMode = false"
            class="fixed top-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white text-xs backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity"
            title="退出专注模式 (Esc)">
      退出专注模式 (Esc)
    </button>

    <!-- 悬停预览 -->
    <PreviewPopup :visible="previewVisible" :bookmark="previewBookmark" :pos="previewPos" />

    <!-- 编辑弹窗 -->
    <EditModal v-model="editVisible" :bookmark="editing" @save="onSave" @delete="onDelete" />

    <ContextMenu
      :open="quickMenu.visible"
      :x="quickMenu.x"
      :y="quickMenu.y"
      :items="bookmarkMenuItems"
      @close="quickMenu.visible = false"
      @select="onBookmarkMenuSelect"
    />
    <ContextMenu
      :open="surfaceMenu.visible"
      :x="surfaceMenu.x"
      :y="surfaceMenu.y"
      :items="surfaceMenuItems"
      @close="surfaceMenu.visible = false"
      @select="onSurfaceMenuSelect"
    />

    <!-- 分类管理 -->
    <CategoryManager v-if="showCatMgr" v-model="showCatMgr" />

    <!-- 二维码弹窗 -->
    <teleport to="body">
      <div v-if="qrDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center" @click.self="qrDialog.visible = false">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-xs w-full text-center animate-pop">
          <h3 class="text-lg font-bold mb-1">书签二维码</h3>
          <p class="text-sm text-slate-500 mb-4 truncate max-w-[200px] mx-auto" :title="qrDialog.url">{{ qrDialog.title || qrDialog.url }}</p>
          <div v-if="qrDialog.loading" class="py-12 text-slate-400 text-sm">生成中…</div>
          <div v-else-if="qrDialog.error" class="py-8 text-red-400 text-sm">{{ qrDialog.error }}</div>
          <img v-else :src="qrDialog.dataUrl" alt="QR Code" class="mx-auto rounded-lg w-48 h-48 object-contain" />
          <div class="mt-4 flex gap-2 justify-center">
            <button @click="qrDialog.visible = false" class="btn-ghost text-sm">关闭</button>
            <button v-if="qrDialog.dataUrl" @click="copyQrImage" class="btn-accent text-sm">复制图片</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- 快捷搜索面板（Spotlight） -->
    <teleport to="body">
      <transition name="spotlight">
        <div v-if="spotlight.visible" class="fixed inset-0 z-[500] flex justify-center pt-[15vh]"
             @mousedown.self="spotlight.visible = false">
          <div class="w-[560px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-pop"
               @keydown.escape="spotlight.visible = false">
            <!-- 搜索输入 -->
            <div class="flex items-center gap-3 px-5 py-4 border-b border-slate-200/50 dark:border-slate-700/50">
              <span class="text-xl text-slate-400">🔍</span>
              <input ref="spotlightInput"
                     v-model="spotlight.query"
                     @keydown.prevent="onSpotlightKeydown"
                     placeholder="搜索书签… 输入关键词、URL 或标签"
                     class="flex-1 bg-transparent text-lg outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                     autocomplete="off" />
              <kbd class="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">ESC</kbd>
            </div>
            <!-- 结果列表 -->
            <div class="max-h-[50vh] overflow-y-auto">
              <div v-if="spotlight.results.length === 0 && spotlight.query.trim()" class="px-5 py-12 text-center text-slate-400 text-sm">
                没有匹配的书签
              </div>
              <div v-else-if="spotlight.results.length === 0 && !spotlight.query.trim()" class="px-5 py-8 text-center text-slate-300 text-sm">
                输入关键词开始搜索
              </div>
              <button v-for="(item, idx) in spotlight.results" :key="item.id"
                      @click="spotlightOpen(item)"
                      @mouseenter="spotlight.index = idx"
                      :class="['w-full flex items-center gap-3 px-5 py-3 text-left transition-colors',
                               idx === spotlight.index ? 'bg-accent/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50']">
                <!-- favicon / 首字母 -->
                <div class="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                     :style="{ background: (item.catColor || '#64748b') + '18', color: item.catColor || '#64748b' }">
                  {{ (item.title || '?').charAt(0).toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate" v-html="item._highlight"></div>
                  <div class="text-xs text-slate-400 truncate">{{ item.url }}</div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span v-if="item.status === 'dead'" class="text-xs">💀</span>
                  <span v-else-if="item.status === 'warn'" class="text-xs">⚠️</span>
                  <span v-if="item.categoryName" class="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{{ item.categoryName }}</span>
                </div>
              </button>
            </div>
            <!-- 底部提示 -->
            <div class="px-5 py-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-4 text-[10px] text-slate-400">
              <span>↑↓ 选择</span>
              <span>Enter 打开</span>
              <span>Shift+Enter 新窗口</span>
              <span class="ml-auto">{{ spotlight.results.length }} 个结果</span>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- 标签管理弹窗 -->
    <teleport to="body">
      <div v-if="tagManager.visible" class="fixed inset-0 z-[400] flex items-center justify-center" @click.self="tagManager.visible = false">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-md w-full animate-pop">
          <h3 class="text-lg font-bold mb-4">管理标签</h3>
          <div class="max-h-64 overflow-y-auto space-y-1.5 mb-4">
            <div v-for="t in bm.allTags" :key="t.tag" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 group">
              <span class="flex-1 text-sm">#{{ t.tag }}</span>
              <span class="text-xs text-slate-400">{{ t.count }} 个书签</span>
              <input v-if="tagManager.renaming === t.tag" v-model="tagManager.newName" @keydown.enter="renameTag(t.tag)" @keydown.escape="tagManager.renaming = ''"
                     class="input w-28 text-xs py-0.5" placeholder="新标签名" ref="renameInput" />
              <template v-else>
                <button @click="startRenameTag(t.tag)" class="text-xs opacity-0 group-hover:opacity-100 hover:text-accent transition">重命名</button>
                <button @click="mergeTag(t.tag)" class="text-xs opacity-0 group-hover:opacity-100 hover:text-blue-500 transition">合并到…</button>
                <button @click="deleteTag(t.tag)" class="text-xs opacity-0 group-hover:opacity-100 hover:text-red-500 transition">删除</button>
              </template>
            </div>
            <div v-if="bm.allTags.length === 0" class="text-center py-8 text-slate-400 text-sm">暂无标签</div>
          </div>
          <div class="flex gap-2 justify-end">
            <button @click="tagManager.visible = false" class="btn-ghost text-sm">关闭</button>
          </div>
        </div>
      </div>
    </teleport>
    <!-- 凭证面板 -->
    <CredentialPanel v-if="showCred" v-model="showCred" />

    <!-- 插件管理 -->
    <PluginManager v-if="showPluginMgr" v-model="showPluginMgr" />
    <!-- Cookie 面板 -->
    <CookiePanel v-if="showCookie" v-model="showCookie" />
    <!-- 快照面板 -->
    <SnapshotPanel v-if="showSnap" v-model="showSnap" />
    <!-- Geo 信息面板 -->
    <!-- 新建文件夹弹窗 -->
    <teleport to="body">
      <div v-if="newFolderDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="newFolderDialog.visible = false">
        <div class="w-80 glass rounded-2xl shadow-glass p-5 animate-pop">
          <h3 class="text-sm font-semibold mb-3">新建文件夹</h3>
          <input v-model="newFolderDialog.name" @keydown.enter="doCreateFolder" class="input text-sm" placeholder="输入文件夹名称" ref="newFolderInput" />
          <div class="text-[10px] text-slate-400 mt-1" v-if="newFolderDialog.parentName">将创建为「{{ newFolderDialog.parentName }}」的子文件夹</div>
          <div class="flex justify-end gap-2 mt-4">
            <button @click="newFolderDialog.visible = false" class="btn-ghost text-xs">取消</button>
            <button @click="doCreateFolder" class="btn-accent text-xs">创建</button>
          </div>
        </div>
      </div>
    </teleport>

    <GeoInfoPanel v-if="showGeo" v-model="showGeo" :bookmark="geoBookmark" />

    <!-- 右侧可交互 Web 预览面板 -->
    <WebPreview :visible="previewPanel.visible" :currentUrl="previewPanel.url" :currentTitle="previewPanel.title"
                :panelWidth="previewPanel.width"
                @close="previewPanel.visible = false" @open="previewPanel.visible = true"
                @update:currentTitle="(t) => previewPanel.title = t" />

    <!-- 多标签预览 Tab 栏 -->
    <TabbedPreview :tabs="previewTabs" :active-tab-id="activePreviewTab"
                   @select="onPreviewTabSelect" @close="onPreviewTabClose" @close-all="onPreviewTabCloseAll" />

    <!-- 去重预览弹窗 -->
    <teleport to="body">
      <div v-if="dedupDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="dedupDialog.visible = false">
        <div class="w-full max-w-2xl glass rounded-2xl shadow-glass p-5 animate-pop max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">去重预览</h3>
            <button @click="dedupDialog.visible = false" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>
          <div class="text-sm text-slate-500 mb-3">
            发现 {{ dedupDialog.duplicates.length }} 组重复，共 {{ dedupDialog.duplicates.reduce((s, g) => s + g.remove.length, 0) }} 项待删除
          </div>
          <div class="flex-1 overflow-y-auto space-y-3 mb-4">
            <div v-for="g in dedupDialog.duplicates" :key="g.key" class="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              <div class="text-xs text-slate-400 mb-2 truncate font-mono" :title="g.key">{{ g.key }}</div>
              <div class="text-xs text-green-600 dark:text-green-400 mb-1 flex items-center gap-1">
                <span>✅ 保留</span>
                <span class="truncate font-medium text-slate-700 dark:text-slate-300">{{ g.keep.title || g.keep.url }}</span>
              </div>
              <div v-for="r in g.remove" :key="r.id" class="text-xs text-red-500 flex items-center gap-1 ml-3">
                <span>🗑️</span>
                <span class="truncate text-slate-600 dark:text-slate-400">{{ r.title || r.url }}</span>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
            <button @click="dedupDialog.visible = false" class="btn-ghost text-sm">取消</button>
            <button @click="confirmDedup" class="btn-primary text-sm">确认删除 {{ dedupDialog.duplicates.reduce((s, g) => s + g.remove.length, 0) }} 项</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- 导入/导出结果弹窗 -->
    <ResultDialog v-model="resultDialog.visible" :title="resultDialog.title" :icon="resultDialog.icon" :message="resultDialog.message" :details="resultDialog.details" />

    <!-- 导入结果摘要面板 -->
    <teleport to="body">
      <div v-if="importResult && !importResult.loading" class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="importResult = null">
        <div class="w-80 glass rounded-2xl shadow-glass p-5 animate-pop">
          <h3 class="text-sm font-semibold mb-3">导入完成</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-slate-500">来源</span><span>{{ importResult.source }}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">成功导入</span><span class="text-green-600 font-medium">{{ importResult.imported }} 条</span></div>
            <div class="flex justify-between"><span class="text-slate-500">跳过（重复）</span><span class="text-amber-500">{{ importResult.skipped || 0 }} 条</span></div>
            <div class="flex justify-between"><span class="text-slate-500">总计解析</span><span>{{ importResult.parsed }} 条</span></div>
          </div>
          <div class="flex justify-end mt-4">
            <button @click="importResult = null" class="btn-accent text-xs">关闭</button>
          </div>
        </div>
      </div>
      <!-- 导入中 loading -->
      <div v-else-if="importResult && importResult.loading" class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
        <div class="w-64 glass rounded-2xl shadow-glass p-5 animate-pop text-center">
          <div class="text-3xl mb-2">⏳</div>
          <div class="text-sm text-slate-600 dark:text-slate-300">正在{{ importResult.source }}...</div>
        </div>
      </div>
    </teleport>

    <!-- 快速添加弹窗（功能4） -->
    <teleport to="body">
      <div v-if="quickAddDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="quickAddDialog.visible = false">
        <div class="w-[400px] glass rounded-2xl shadow-glass p-5 animate-pop">
          <h3 class="text-sm font-semibold mb-3">快速添加书签</h3>
          <input v-model="quickAddDialog.url" @keydown.enter="submitQuickAdd" class="input text-sm mb-2 font-mono" placeholder="URL（自动从剪贴板读取）" ref="quickAddUrlInput" />
          <input v-model="quickAddDialog.title" @keydown.enter="submitQuickAdd" class="input text-sm mb-3" placeholder="标题（可选）" />
          <div class="flex justify-end gap-2">
            <button @click="quickAddDialog.visible = false" class="btn-ghost text-xs">取消</button>
            <button @click="submitQuickAdd" class="btn-accent text-xs" :disabled="!quickAddDialog.url.trim()">添加</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- 智能文件夹弹窗（功能6） -->
    <teleport to="body">
      <div v-if="smartFolderDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="smartFolderDialog.visible = false">
        <div class="w-[400px] glass rounded-2xl shadow-glass p-5 animate-pop">
          <h3 class="text-sm font-semibold mb-3">保存为智能文件夹</h3>
          <input v-model="smartFolderDialog.name" @keydown.enter="saveSmartFolder" class="input text-sm mb-3" placeholder="输入智能文件夹名称" ref="smartFolderNameInput" />
          <div class="text-xs text-slate-400 mb-2">当前筛选条件摘要：</div>
          <div class="text-xs space-y-1 mb-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
            <div v-if="bm.searchQuery"><span class="text-slate-500">搜索：</span>{{ bm.searchQuery }}</div>
            <div v-if="bm.statusFilter && bm.statusFilter !== 'all'"><span class="text-slate-500">状态：</span>{{ bm.statusFilter }}</div>
            <div v-if="bm.tagFilter"><span class="text-slate-500">标签：</span>{{ bm.tagFilter }}</div>
            <div v-if="bm.domainFilter"><span class="text-slate-500">域名：</span>{{ bm.domainFilter }}</div>
            <div v-if="bm.dateFrom || bm.dateTo"><span class="text-slate-500">日期：</span>{{ bm.dateFrom || '...' }} ~ {{ bm.dateTo || '...' }}</div>
            <div v-if="!bm.searchQuery && (!bm.statusFilter || bm.statusFilter === 'all') && !bm.tagFilter && !bm.domainFilter && !bm.dateFrom && !bm.dateTo">（无筛选条件）</div>
          </div>
          <div class="flex justify-end gap-2">
            <button @click="smartFolderDialog.visible = false" class="btn-ghost text-xs">取消</button>
            <button @click="saveSmartFolder" class="btn-accent text-xs" :disabled="!smartFolderDialog.name.trim()">保存</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- 通知中心（功能7） -->
    <div class="fixed top-3 right-3 z-[200]">
      <button @click="notificationPanel.visible = !notificationPanel.visible" class="relative w-8 h-8 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-600 shadow text-sm flex items-center justify-center transition">
        🔔
        <span v-if="notifications.length > 0" class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{{ notifications.length > 9 ? '9+' : notifications.length }}</span>
      </button>
      <div v-if="notificationPanel.visible" class="absolute right-0 top-10 w-72 glass rounded-xl shadow-glass border border-slate-200 dark:border-slate-700 animate-pop max-h-80 overflow-hidden">
        <div class="px-3 py-2 text-xs font-medium text-slate-500 border-b border-slate-200/50 dark:border-slate-700/50">通知</div>
        <div v-if="notifications.length === 0" class="px-3 py-6 text-center text-xs text-slate-400">暂无通知</div>
        <div v-else class="max-h-60 overflow-y-auto">
          <div v-for="n in notifications.slice(0, 10)" :key="n.id"
               :class="['px-3 py-2 text-xs border-b border-slate-100 dark:border-slate-700/50 last:border-0', n.type === 'error' ? 'text-red-600' : n.type === 'success' ? 'text-green-600' : n.type === 'warn' ? 'text-amber-600' : 'text-slate-600 dark:text-slate-300']">
            <div>{{ n.message }}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">{{ formatNotificationTime(n.time) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import Toolbar from '../components/Toolbar.vue'
import BookmarkCard from '../components/BookmarkCard.vue'
import PreviewPopup from '../components/PreviewPopup.vue'
import EditModal from '../components/EditModal.vue'
import CategoryManager from '../components/CategoryManager.vue'
import CredentialPanel from '../components/CredentialPanel.vue'
import PluginManager from '../components/PluginManager.vue'
import CookiePanel from '../components/CookiePanel.vue'
import SnapshotPanel from '../components/SnapshotPanel.vue'
import GeoInfoPanel from '../components/GeoInfoPanel.vue'
import WebPreview from '../components/WebPreview.vue'
import TabbedPreview from '../components/TabbedPreview.vue'
import ResultDialog from '../components/ResultDialog.vue'
import ContextMenu from '../components/ContextMenu.vue'
import { useBookmarksStore } from '../stores/bookmarks.js'
import { useCategoriesStore } from '../stores/categories.js'
import { useUiStore } from '../stores/ui.js'
import { useSettingsStore } from '../stores/settings.js'

const bm = useBookmarksStore()
const cats = useCategoriesStore()
const ui = useUiStore()
const settings = useSettingsStore()

function getDesktopApi() {
  if (!window.api || typeof window.api.invoke !== 'function') {
    throw new Error('桌面功能不可用：请从书签管理器桌面应用启动后再导入，勿直接在浏览器中打开开发地址或 HTML 文件')
  }
  return window.api
}

const viewMode = ref('grid')
const gridClass = computed(() => 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]')

// 兼容：获取扁平列表（用于键盘导航等需要 length 的场景）
const flatFiltered = computed(() => {
  const f = bm.filtered
  if (f && f.grouped) {
    return Object.values(f.groups).flat()
  }
  return f
})

// 导入结果
const importResult = ref(null)
const scrollArea = ref(null)

// 弹窗状态
const editVisible = ref(false)
const editing = ref(null)
const showCatMgr = ref(false)
const showCred = ref(false)

const newFolderDialog = ref({ visible: false, name: '', parentName: '' })
const newFolderInput = ref(null)

async function onNewFolder() {
  const parentId = (bm.activeCategory !== 'all' && bm.activeCategory !== 'unclassified') ? bm.activeCategory : null
  newFolderDialog.value = {
    visible: true,
    name: '',
    parentName: parentId ? (cats.byId[parentId]?.name || '') : ''
  }
  setTimeout(() => newFolderInput.value?.focus(), 100)
}

async function doCreateFolder() {
  const name = newFolderDialog.value.name.trim()
  if (!name) { newFolderDialog.value.visible = false; return }
  try {
    const parentId = (bm.activeCategory !== 'all' && bm.activeCategory !== 'unclassified') ? bm.activeCategory : null
    await cats.add({ name, icon: '📁', color: '#64748b', parentId: parentId || null, tags: [] })
    window.$toast(`文件夹「${name}」已创建`, 'success')
  } catch (e) {
    window.$toast('创建失败: ' + (e.message || e), 'error')
  }
  newFolderDialog.value.visible = false
}
const showCookie = ref(false)
const showSnap = ref(false)
const showGeo = ref(false)
const geoBookmark = ref(null)
const resultDialog = ref({ visible: false, title: '', icon: '', message: '', details: [] })
const previewPanel = ref({ visible: false, url: '', title: '', width: 480 })

// 书签详情侧滑面板
const detailPanel = ref({ visible: false, bookmark: null })

function openDetail(bookmark) {
  detailPanel.value = { visible: true, bookmark }
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

// 拖拽 URL 导入
const dropOverlay = ref(false)

function onDragOverMain(e) {
  const types = e.dataTransfer?.types || []
  if (types.includes('text/uri-list') || types.includes('text/plain')) {
    dropOverlay.value = true
    e.dataTransfer.dropEffect = 'copy'
  }
}

async function onDropMain(e) {
  dropOverlay.value = false
  const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
  const trimmed = (url || '').trim().split('\n')[0]
  if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
    window.$toast && window.$toast('无效的 URL', 'warn')
    return
  }
  const r = await bm.add({ url: trimmed })
  if (r) {
    window.$toast && window.$toast('已添加书签', 'success')
    refreshCacheSize()
  }
}

function onDragLeaveMain(e) {
  if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
    dropOverlay.value = false
  }
}

// 回收站操作
async function batchRestoreSelected() {
  const ids = [...bm.selected]
  for (const id of ids) {
    await bm.restore(id)
  }
  window.$toast(`已恢复 ${ids.length} 个书签`, 'success')
  bm.clearSelection()
}

async function doEmptyRecycleBin() {
  if (!confirm(`确定清空回收站中的 ${bm.recycledCount} 个书签？\n\n此操作不可恢复！`)) return
  await bm.emptyRecycleBin()
  bm.clearSelection()
  window.$toast('回收站已清空', 'info')
}

// 去重预览弹窗
const dedupDialog = ref({ visible: false, duplicates: [] })
const collapsedGroups = ref({})

// 多标签预览
const previewTabs = ref([])
const activePreviewTab = ref('')

function addPreviewTab(url, title) {
  const id = 'tab-' + Date.now()
  previewTabs.value.push({ id, url, title: title || url })
  activePreviewTab.value = id
  // 同时显示 WebPreview 面板
  previewPanel.value.url = url
  previewPanel.value.title = title || ''
  previewPanel.value.visible = true
}

function onPreviewTabSelect(tabId) {
  activePreviewTab.value = tabId
  const tab = previewTabs.value.find(t => t.id === tabId)
  if (tab) {
    previewPanel.value.url = tab.url
    previewPanel.value.title = tab.title
    previewPanel.value.visible = true
  }
}

function onPreviewTabClose(tabId) {
  const idx = previewTabs.value.findIndex(t => t.id === tabId)
  previewTabs.value.splice(idx, 1)
  if (activePreviewTab.value === tabId) {
    if (previewTabs.value.length > 0) {
      const next = previewTabs.value[Math.min(idx, previewTabs.value.length - 1)]
      onPreviewTabSelect(next.id)
    } else {
      previewPanel.value.visible = false
      activePreviewTab.value = ''
    }
  }
}

function onPreviewTabCloseAll() {
  previewTabs.value = []
  activePreviewTab.value = ''
  previewPanel.value.visible = false
}

// 悬停预览
const previewVisible = ref(false)
const previewBookmark = ref(null)
const previewPos = ref({ x: 0, y: 0 })
let previewTimer = null

// 搜索历史
const SEARCH_HISTORY_KEY = 'bm-search-history'
const searchHistory = ref(loadSearchHistory())
const showSearchSuggestions = ref(false)

function loadSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]').slice(0, 15)
  } catch { return [] }
}

function saveSearchHistory() {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory.value.slice(0, 15)))
}

function addToHistory(query) {
  if (!query.trim()) return
  searchHistory.value = [query, ...searchHistory.value.filter((q) => q !== query)].slice(0, 15)
  saveSearchHistory()
}

function selectSearchSuggestion(q) {
  bm.searchQuery = q
  showSearchSuggestions.value = false
  addToHistory(q)
}

function onSearchBlur() {
  setTimeout(() => { showSearchSuggestions.value = false }, 200)
}

function onSearchFocus() {
  if (bm.searchQuery && searchHistory.value.length > 0) {
    showSearchSuggestions.value = true
  }
}

function onSearchInput() {
  if (bm.searchQuery && searchHistory.value.length > 0) {
    showSearchSuggestions.value = true
  }
}

// 拖拽排序处理
async function onReorder({ dragId, dropId, position }) {
  // 获取当前筛选后的列表
  const list = flatFiltered.value
  const dragIdx = list.findIndex((b) => b.id === dragId)
  const dropIdx = list.findIndex((b) => b.id === dropId)
  if (dragIdx === -1 || dropIdx === -1) return
  // 计算新的 order 值：基于当前列表位置
  const orders = list.map((b, i) => ({ id: b.id, order: i }))
  await bm.reorder(orders)
  // 自动切换到自定义排序
  if (bm.sortBy !== 'custom') bm.setSort('custom')
  bm.sortOrder = 'asc'
}

// Shift+点击范围选择
const lastClickedIndex = ref(-1)

function handleBookmarkClick(bookmark, index) {
  if (bm.selected.size > 0) {
    // Shift+点击：范围选择
    if (window._shiftHeld) {
      const list = flatFiltered.value
      const from = Math.min(lastClickedIndex.value, index)
      const to = Math.max(lastClickedIndex.value, index)
      const newSelected = new Set(bm.selected)
      for (let i = from; i <= to; i++) {
        newSelected.add(list[i].id)
      }
      bm.selected = newSelected
      lastClickedIndex.value = index
      return
    }
    bm.toggleSelect(bookmark.id)
    lastClickedIndex.value = index
    return
  }
  onOpen(bookmark)
}

// 快速分类菜单
const quickMenu = ref({ visible: false, x: 0, y: 0, bookmarkId: null })
const surfaceMenu = ref({ visible: false, x: 0, y: 0 })
const surfaceMenuItems = computed(() => [
  { id: 'new-bookmark', label: '新建书签', icon: '+', shortcut: 'Ctrl+N', action: onAdd },
  { id: 'new-folder', label: '新建文件夹', icon: '□', action: onNewFolder },
  { type: 'separator' },
  { id: 'paste-url', label: '从剪贴板添加', icon: '⧉', action: openQuickAdd },
  { id: 'refresh', label: '刷新书签图标', icon: '↻', action: refreshAllFavicons }
])
function onSurfaceContext(event) {
  if (event.target.closest('[data-bookmark-card]')) return
  surfaceMenu.value = { visible: true, x: event.clientX, y: event.clientY }
}
function onSurfaceMenuSelect(item) { item.action?.() }
const quickCats = computed(() => cats.sorted.slice(0, 12))
const bookmarkMenuItems = computed(() => [
  { type: 'heading', label: '书签操作' },
  ...quickCats.value.map((category, index) => ({ id: `category-${category.id}`, label: `移至 ${category.name}`, icon: category.icon || '□', shortcut: index < 9 ? String(index + 1) : '', action: () => quickAssign(category.id) })),
  { type: 'separator' },
  { id: 'copy-url', label: '复制 URL', icon: '⧉', shortcut: 'Ctrl+C', action: copyBookmarkUrl },
  { id: 'copy-title', label: '复制标题', icon: 'T', action: copyBookmarkTitle },
  { id: 'copy-markdown', label: '复制为 Markdown', icon: '⌁', action: copyAsMarkdown },
  { id: 'new-window', label: '在新窗口打开', icon: '↗', action: openInNewWindow },
  { type: 'separator' },
  { id: 'qr', label: '生成二维码', icon: '⌘', action: showQrCode },
  { id: 'tags', label: '管理标签', icon: '#', action: openTagManager }
])
function onBookmarkMenuSelect(item) { item.action?.() }

// 批量操作
const batchCatId = ref('')
const batchTagInput = ref('')

async function batchMoveToCategory() {
  if (!batchCatId.value) return
  const ids = [...bm.selected]
  for (const id of ids) {
    await bm.moveToCategory(id, batchCatId.value, { manual: true })
  }
  window.$toast(`已将 ${ids.length} 个书签移至「${cats.byId[batchCatId.value]?.name || batchCatId.value}」`, 'success')
  bm.clearSelection()
  batchCatId.value = ''
}

async function batchAddTags() {
  const tag = batchTagInput.value.replace(/^#/, '').trim()
  if (!tag) return
  const ids = [...bm.selected]
  await bm.addTagBatch(ids, [tag])
  window.$toast(`已为 ${ids.length} 个书签添加标签 #${tag}`, 'success')
  batchTagInput.value = ''
}

async function batchDeleteSelected() {
  const count = bm.selected.size
  if (!confirm(`确定永久删除选中的 ${count} 个书签？\n\n此操作不可恢复！`)) return
  if (bm.showRecycled) {
    // 回收站模式：永久删除
    const ids = [...bm.selected]
    for (const id of ids) {
      await window.api.invoke('bm:delete', id)
    }
    bm.bookmarks = bm.bookmarks.filter(b => !new Set(ids).has(b.id))
    bm.clearSelection()
    window.$toast(`已永久删除 ${count} 个书签`, 'info')
  } else {
    bm.removeBatch([...bm.selected])
    bm.clearSelection()
    window.$toast(`已删除 ${count} 个书签`, 'info')
  }
}

function batchRefreshFavicon() {
  const ids = [...bm.selected]
  let refreshed = 0
  for (const id of ids) {
    const bookmark = bm.getById(id)
    if (bookmark && bookmark.url) {
      window.api.invoke('favicon:fetch', bookmark.url).then((fname) => {
        if (fname) bm.update(id, { favicon: fname })
      }).catch(() => {})
      refreshed++
    }
  }
  ui.clearFavicon()
  window.$toast(`正在刷新 ${refreshed} 个图标…`, 'info')
  bm.clearSelection()
}

// 快捷搜索面板（Spotlight）
const spotlight = ref({ visible: false, query: '', results: [], index: 0 })
const spotlightInput = ref(null)

// HTML 转义工具函数，防止 XSS
const escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')

function openSpotlight() {
  spotlight.value = { visible: true, query: '', results: [], index: 0 }
  setTimeout(() => spotlightInput.value?.focus(), 50)
}

function closeSpotlight() {
  spotlight.value.visible = false
}

function onSpotlightKeydown(e) {
  const results = spotlight.value.results
  if (e.key === 'ArrowDown') {
    spotlight.value.index = Math.min(spotlight.value.index + 1, results.length - 1)
  } else if (e.key === 'ArrowUp') {
    spotlight.value.index = Math.max(spotlight.value.index - 1, 0)
  } else if (e.key === 'Enter') {
    if (spotlight.value.index >= 0 && spotlight.value.index < results.length) {
      spotlightOpen(results[spotlight.value.index], e.shiftKey)
    }
  } else if (e.key === 'Escape') {
    closeSpotlight()
  }
}

function spotlightOpen(item, newWindow = false) {
  if (!item) return
  bm.recordOpen(item.id)
  if (newWindow) {
    window.api.invoke('previewWindow:create', item.url, item.title || item.url)
  } else {
    window.api.invoke('browser:open', item.url)
  }
  closeSpotlight()
}

// Spotlight 搜索计算
watch(() => spotlight.value.query, (q) => {
  if (!q || !q.trim()) {
    spotlight.value.results = []
    spotlight.value.index = 0
    return
  }
  const query = q.trim().toLowerCase()
  const all = bm.bookmarks.filter(b => !b.recycled && !b.archived)
  const maxResults = 20
  const scored = []

  for (const b of all) {
    let score = 0
    const title = (b.title || '').toLowerCase()
    const url = (b.url || '').toLowerCase()
    const tags = (b.tags || []).join(' ').toLowerCase()
    const notes = (b.notes || '').toLowerCase()

    // 标题精确匹配
    if (title === query) score += 100
    else if (title.startsWith(query)) score += 80
    else if (title.includes(query)) score += 60

    // URL 匹配
    if (url.includes(query)) score += 40

    // 标签匹配
    if ((b.tags || []).some(t => t.toLowerCase() === query)) score += 50
    else if (tags.includes(query)) score += 30

    // 备注匹配
    if (notes.includes(query)) score += 20

    if (score > 0) {
      // 高亮匹配文字（先对标题做 HTML 转义，防止 XSS）
      const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi')
      const highlight = escapeHtml(b.title).replace(re, '<span class="text-accent font-semibold">$1</span>')
      const cat = cats.byId[b.categoryId]
      scored.push({ ...b, _score: score, _highlight: highlight, catColor: cat?.color || '#64748b', categoryName: cat?.name || '' })
    }
  }

  scored.sort((a, b) => b._score - a._score)
  spotlight.value.results = scored.slice(0, maxResults)
  spotlight.value.index = 0
})

// 键盘导航
const focusedIndex = ref(-1)

function setFocusedIndex(idx) {
  const list = flatFiltered.value
  if (idx < 0) focusedIndex.value = list.length - 1
  else if (idx >= list.length) focusedIndex.value = 0
  else focusedIndex.value = idx
}

// ---- 分页 ----
function goToPage(page) {
  if (page < 1) page = 1
  if (page > bm.totalPages) page = bm.totalPages
  bm.currentPage = page
  scrollArea.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// ---- 归档操作 ----
async function onArchive(bookmark) {
  await bm.archive(bookmark.id)
  window.$toast(`已归档「${bookmark.title || bookmark.url}」`, 'info')
}

async function batchUnarchiveSelected() {
  const ids = [...bm.selected]
  for (const id of ids) {
    await bm.unarchive(id)
  }
  window.$toast(`已取消归档 ${ids.length} 个书签`, 'success')
  bm.clearSelection()
}

async function archiveSelected() {
  const ids = [...bm.selected]
  for (const id of ids) {
    await bm.archive(id)
  }
  window.$toast(`已归档 ${ids.length} 个书签`, 'info')
  bm.clearSelection()
}

// ---- 预览缓存大小
const previewCacheMb = ref(null)
async function refreshCacheSize() {
  const r = await window.api.invoke('preview:cacheSize')
  previewCacheMb.value = r.mb
}

onMounted(async () => {
  await Promise.all([bm.load(), cats.load()])
  refreshCacheSize()
  // 自动校验（按设置）
  if (settings.settings.autoValidate.onStartup) {
    validateAll()
  }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
  window.addEventListener('click', closeQuickMenu)
  window.addEventListener('mousemove', onMouseMove)
  // 功能4：监听全局热键快速添加事件
  quickAddUnlisten = window.api.on('quickAdd', openQuickAdd)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  window.removeEventListener('click', closeQuickMenu)
  window.removeEventListener('mousemove', onMouseMove)
  if (quickAddUnlisten) quickAddUnlisten()
  _notifTimers.forEach(t => clearTimeout(t))
})

function onKeyup(e) {
  window._shiftHeld = e.shiftKey
}

function onKeydown(e) {
  window._shiftHeld = e.shiftKey

  // 详情面板 ESC 关闭
  if (e.key === 'Escape' && detailPanel.value.visible) {
    detailPanel.value.visible = false
    return
  }

  // 专注模式切换: F11 或 Ctrl+Shift+F（弹窗打开时禁止切换）
  if (e.key === 'F11' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f')) {
    if (editVisible.value || qrDialog.visible || quickAddDialog.value.visible || smartFolderDialog.value.visible || showGeo.value || dedupDialog.value.visible || importResult.value) return
    e.preventDefault()
    if (e.key === 'F11') e.preventDefault() // 阻止浏览器全屏
    bm.focusMode = !bm.focusMode
    return
  }

  // 专注模式下 ESC 退出
  if (e.key === 'Escape' && bm.focusMode) {
    bm.focusMode = false
    return
  }

  // 快捷搜索面板 Ctrl+Shift+K
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (spotlight.value.visible) closeSpotlight()
    else openSpotlight()
    return
  }

  // 撤销 Ctrl+Z
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    if (bm.undoStack.length > 0) {
      bm.undo()
      window.$toast && window.$toast('已撤销', 'info')
    }
    return
  }

  // 快速分类菜单
  if (quickMenu.value.visible) {
    if (e.key === 'Escape') quickMenu.value.visible = false
    const n = parseInt(e.key, 10)
    if (!isNaN(n) && n >= 1 && n <= quickCats.value.length) {
      quickAssign(quickCats.value[n - 1].id)
    }
    return
  }

  // 全局快捷键
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    onAdd()
  }
  if (e.shiftKey && e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    bm.selectAll()
  }
  if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
    if (bm.selected.size > 0 && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault()
      batchDeleteSelected()
      return
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    bm.selectAll()
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (bm.selected.size > 0 && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault()
      batchDeleteSelected()
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    if (bm.selected.size > 0) {
      bm.clearSelection()
    }
  }
  // 键盘导航（方向键在书签间移动焦点）
  if (!e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'SELECT') {
    const list = flatFiltered.value
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      setFocusedIndex(focusedIndex.value + 1)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setFocusedIndex(focusedIndex.value - 1)
    } else if (e.key === 'Enter' && focusedIndex.value >= 0 && focusedIndex.value < list.length) {
      e.preventDefault()
      // 多选状态下 Enter：打开所有选中项为多标签预览
      if (bm.selected.size > 1) {
        for (const id of bm.selected) {
          const sb = bm.getById(id)
          if (sb) addPreviewTab(sb.url, sb.title || sb.url)
        }
        return
      }
      const b = list[focusedIndex.value]
      // Shift+Enter 双击打开（外部浏览器），Enter 单击打开（WebPreview）
      if (e.shiftKey) {
        bm.recordOpen(b.id)
        window.api.invoke('browser:open', b.url)
      } else {
        onOpen(b)
      }
    } else if (e.key === ' ' && focusedIndex.value >= 0) {
      // 空格切换选中
      e.preventDefault()
      const b = list[focusedIndex.value]
      bm.toggleSelect(b.id)
    } else {
      // 数字键 1-9 快速分配分类（多选时）
      if (bm.selected.size > 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const n = parseInt(e.key, 10)
        if (!isNaN(n) && n >= 1 && n <= quickCats.value.length) {
          e.preventDefault()
          const catId = quickCats.value[n - 1].id
          const ids = [...bm.selected]
          for (const id of ids) {
            bm.moveToCategory(id, catId, { manual: true }).catch(() => {})
          }
          window.$toast(`已将 ${ids.length} 个书签移至「${cats.byId[catId]?.name}」`, 'success')
        }
      }
    }
  }
}
function closeQuickMenu() { quickMenu.value.visible = false }

// ---- 书签操作 ----
function onAdd() { editing.value = null; editVisible.value = true }
function onEdit(b) { editing.value = b; editVisible.value = true }

async function onSave(data) {
  if (data.id) {
    const r = await bm.update(data.id, data, { isManual: true })
    if (r) { window.$toast('已保存', 'success'); ui.clearPreview(data.url) }
  } else {
    const r = await bm.add({ ...data, manualSet: true })
    if (r) window.$toast('已添加', 'success')
  }
  refreshCacheSize()
}

async function onDelete(id) {
  if (bm.showRecycled) {
    if (!confirm('永久删除此书签？此操作不可恢复！')) return
    await window.api.invoke('bm:delete', id)
    bm.bookmarks = bm.bookmarks.filter(x => x.id !== id)
    window.$toast('已永久删除', 'info')
  } else {
    await bm.remove(id)
    window.$toast('已移入回收站', 'info')
  }
}

async function onOpen(b) {
  openDetail(b)
}

// 悬停预览
function onHover(b) {
  clearTimeout(previewTimer)
  previewBookmark.value = b
  previewTimer = setTimeout(() => {
    // 智能定位：确保预览不超出屏幕
    const pw = 320, ph = 280
    let x = lastMouse.x + 14
    let y = lastMouse.y - 20
    if (x + pw > window.innerWidth) x = lastMouse.x - pw - 10
    if (y + ph > window.innerHeight) y = window.innerHeight - ph - 10
    if (x < 0) x = 10
    if (y < 0) y = 10
    previewPos.value = { x, y }
    previewVisible.value = true
  }, 300)  // 300ms快速响应用户悬停
}
function onLeave() {
  clearTimeout(previewTimer)
  // 预览不立即清除（数据已持久化在主进程），仅隐藏浮层
  previewVisible.value = false
}
const lastMouse = { x: 0, y: 0 }
function onMouseMove(e) { lastMouse.x = e.clientX; lastMouse.y = e.clientY }

// 右键快速分类
function onContext(b, evt) {
  let x = evt.clientX
  let y = evt.clientY
  // 智能定位：防止溢出视口
  const menuW = 224, menuH = 400
  if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 10
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 10
  if (x < 10) x = 10
  if (y < 10) y = 10
  quickMenu.value = { visible: true, x, y, bookmarkId: b.id }
}
async function quickAssign(catId) {
  if (quickMenu.value.bookmarkId) {
    await bm.moveToCategory(quickMenu.value.bookmarkId, catId, { manual: true })
    const c = cats.byId[catId]
    window.$toast(`已分类至「${c?.name}」`, 'success')
  }
  quickMenu.value.visible = false
}

function copyBookmarkUrl() {
  const b = bm.getById(quickMenu.value.bookmarkId)
  if (b) { navigator.clipboard.writeText(b.url); window.$toast('URL 已复制', 'success') }
  quickMenu.value.visible = false
}

function copyBookmarkTitle() {
  const b = bm.getById(quickMenu.value.bookmarkId)
  if (b) { navigator.clipboard.writeText(b.title || b.url); window.$toast('标题已复制', 'success') }
  quickMenu.value.visible = false
}

function copyAsMarkdown() {
  const b = bm.getById(quickMenu.value.bookmarkId)
  if (b) {
    const md = `[${b.title || b.url}](${b.url})`
    navigator.clipboard.writeText(md)
    window.$toast('已复制 Markdown 链接', 'success')
  }
  quickMenu.value.visible = false
}

// 快速备注
async function onQuickNote({ id, notes }) {
  const r = await bm.update(id, { notes })
  if (r) window.$toast('备注已保存', 'success')
}

// 二维码
const qrDialog = ref({ visible: false, title: '', url: '', dataUrl: '', loading: false, error: '' })

// 插件管理
const showPluginMgr = ref(false)

// 功能4：快速添加
const quickAddDialog = ref({ visible: false, url: '', title: '' })
const quickAddUrlInput = ref(null)

let quickAddUnlisten = null

async function openQuickAdd() {
  let clipboardUrl = ''
  try {
    clipboardUrl = await navigator.clipboard.readText()
    if (!clipboardUrl || !clipboardUrl.trim().startsWith('http')) {
      clipboardUrl = ''
    } else {
      clipboardUrl = clipboardUrl.trim()
    }
  } catch { /* 剪贴板读取失败，忽略 */ }
  quickAddDialog.value = { visible: true, url: clipboardUrl, title: '' }
  setTimeout(() => quickAddUrlInput.value?.focus(), 100)
}

async function submitQuickAdd() {
  const url = quickAddDialog.value.url.trim()
  if (!url) return
  const title = quickAddDialog.value.title.trim() || url
  await bm.add({ url, title, manualSet: true })
  quickAddDialog.value = { visible: false, url: '', title: '' }
  window.$toast('书签已添加', 'success')
  addNotification('已通过快捷键添加书签: ' + title, 'success')
}

// 功能6：智能文件夹
const smartFolderDialog = ref({ visible: false, name: '' })
const smartFolderNameInput = ref(null)

async function saveSmartFolder() {
  const name = smartFolderDialog.value.name.trim()
  if (!name) return
  const folder = {
    id: 'sf-' + Date.now(),
    name,
    query: bm.searchQuery || '',
    domainFilter: bm.domainFilter || '',
    statusFilter: bm.statusFilter || 'all',
    tagFilter: bm.tagFilter || '',
    dateFrom: bm.dateFrom || '',
    dateTo: bm.dateTo || ''
  }
  const folders = [...(settings.settings.smartFolders || []), folder]
  await settings.save({ smartFolders: folders })
  smartFolderDialog.value = { visible: false, name: '' }
  window.$toast(`智能文件夹「${name}」已保存`, 'success')
  addNotification('已创建智能文件夹: ' + name, 'success')
}

// 功能7：通知中心
const notifications = ref([])
const notificationPanel = ref({ visible: false })
const _notifTimers = []

function addNotification(message, type = 'info') {
  const n = { id: Date.now() + Math.random(), message, type, time: Date.now() }
  notifications.value.unshift(n)
  if (notifications.value.length > 50) notifications.value = notifications.value.slice(0, 50)
  const t = setTimeout(() => {
    const idx = notifications.value.findIndex(x => x.id === n.id)
    if (idx !== -1) notifications.value.splice(idx, 1)
  }, 5000)
  _notifTimers.push(t)
}

function formatNotificationTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
  }
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
}

// 多窗口
async function openInNewWindow() {
  const b = bm.getById(quickMenu.value.bookmarkId)
  if (!b) { quickMenu.value.visible = false; return }
  quickMenu.value.visible = false
  bm.recordOpen(b.id)
  await window.api.invoke('previewWindow:create', b.url, b.title || b.url)
  window.$toast('已在新窗口打开', 'info')
}

// 标签管理
const tagManager = ref({ visible: false, renaming: '', newName: '', merging: '', mergeTarget: '' })

function openTagManager() {
  quickMenu.value.visible = false
  tagManager.value = { visible: true, renaming: '', newName: '', merging: '', mergeTarget: '' }
}

function startRenameTag(tag) {
  tagManager.value.renaming = tag
  tagManager.value.newName = tag
}

async function renameTag(oldTag) {
  const newTag = tagManager.value.newName.trim().replace(/^#/, '')
  if (!newTag || newTag === oldTag) { tagManager.value.renaming = ''; return }
  for (const b of bm.bookmarks) {
    const tags = (b.tags || []).map((t) => t === oldTag ? newTag : t)
    await bm.update(b.id, { tags })
  }
  window.$toast(`已将 #${oldTag} 重命名为 #${newTag}`, 'success')
  tagManager.value.renaming = ''
}

async function mergeTag(tag) {
  const target = prompt(`将「${tag}」合并到哪个标签？\n输入目标标签名（不带#）：`)
  if (!target) return
  const cleanTarget = target.trim().replace(/^#/, '')
  if (!cleanTarget || cleanTarget === tag) return
  let count = 0
  for (const b of bm.bookmarks) {
    if ((b.tags || []).includes(tag)) {
      const tags = [...new Set([...(b.tags || []).filter((t) => t !== tag), cleanTarget])]
      await bm.update(b.id, { tags })
      count++
    }
  }
  window.$toast(`已将 #${tag} 合并到 #${cleanTarget}（${count} 个书签）`, 'success')
}

async function deleteTag(tag) {
  if (!confirm(`确定从所有书签中移除标签「${tag}」？`)) return
  let count = 0
  for (const b of bm.bookmarks) {
    if ((b.tags || []).includes(tag)) {
      await bm.update(b.id, { tags: (b.tags || []).filter((t) => t !== tag) })
      count++
    }
  }
  window.$toast(`已移除 #${tag}（${count} 个书签）`, 'success')
}

async function showQrCode() {
  const b = bm.getById(quickMenu.value.bookmarkId)
  if (!b) { quickMenu.value.visible = false; return }
  quickMenu.value.visible = false
  qrDialog.value = { visible: true, title: b.title, url: b.url, dataUrl: '', loading: true, error: '' }
  try {
    const r = await window.api.invoke('bm:qrcode', b.url, 256)
    if (r && r.dataUrl) {
      qrDialog.value.dataUrl = r.dataUrl
    } else {
      qrDialog.value.error = r?.error || '生成失败'
    }
  } catch (e) {
    qrDialog.value.error = e.message || '网络错误'
  }
  qrDialog.value.loading = false
}

async function copyQrImage() {
  // 将 dataURL 转为 Blob 并复制到剪贴板
  try {
    const res = await fetch(qrDialog.value.dataUrl)
    const blob = await res.blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    window.$toast('二维码已复制到剪贴板', 'success')
  } catch {
    window.$toast('复制失败（浏览器不支持复制图片）', 'warn')
  }
}

// Geo 查询
async function onGeo(b) {
  geoBookmark.value = b
  showGeo.value = true
  if (!b.geo) {
    const r = await window.api.invoke('geo:lookup', b.url)
    await bm.update(b.id, { geo: r })
  }
}

async function onValidate(b) {
  window.$toast(`正在校验 ${b.title || b.url}…`, 'info')
  // 深拷贝脱离 Vue Proxy，确保 URL 是普通字符串
  const url = JSON.parse(JSON.stringify(b.url))
  const r = await window.api.invoke('validate:one', url)
  if (r && r.status) {
    await bm.update(b.id, { status: r.status, statusCheckedAt: Date.now() })
    const labels = { ok: '✅ 正常', redirect: '🔁 跳转', warn: '⚠️ ' + r.message, dead: '💀 ' + r.message, unknown: '❓' }
    window.$toast(labels[r.status] || r.status, r.status === 'ok' ? 'success' : r.status === 'dead' ? 'error' : 'warn')
  } else {
    window.$toast('校验失败: ' + (r?.message || '未知错误'), 'error')
  }
}

async function onDeleteCard(b) {
  if (bm.showRecycled) {
    if (!confirm(`永久删除书签「${b.title || b.url}」？\n\n此操作不可恢复！`)) return
    await window.api.invoke('bm:delete', b.id)
    bm.bookmarks = bm.bookmarks.filter(x => x.id !== b.id)
    window.$toast('已永久删除', 'info')
  } else {
    if (!confirm(`删除书签「${b.title || b.url}」？\n将移入回收站，可恢复。`)) return
    await bm.remove(b.id)
    window.$toast('已移入回收站', 'info')
  }
}

// ---- 批量操作 ----
async function validateAll() {
  if (ui.isBatchRunning) return window.$toast('已有批量任务正在进行，请等待完成', 'warn')
  const list = bm.bookmarks.filter((b) => !b.recycled && !b.archived)
  if (list.length === 0) return window.$toast('没有书签可校验', 'warn')

  window.$toast(`开始校验 ${list.length} 个书签…`, 'info')
  ui.startBatchProgress('validate', list.length)
  try {
    // 必须用深拷贝脱离 Vue Proxy，否则 IPC 序列化可能丢数据
    const urls = JSON.parse(JSON.stringify(list.map((b) => b.url)))
    const results = await window.api.invoke('validate:batch', urls)
    if (!results || results.error) {
      ui.stopBatchProgress('validate')
      window.$toast('校验失败: ' + (results?.error || '未知错误'), 'error')
      return
    }

    let ok = 0, dead = 0, warn = 0, redirect = 0, unknown = 0
    for (let i = 0; i < list.length; i++) {
      const r = results[i]
      const bookmarkId = list[i].id
      const index = bm.bookmarks.findIndex((b) => b.id === bookmarkId)
      if (index === -1) continue
      const b = bm.bookmarks[index]
      if (r && r.status) {
        bm.bookmarks[index] = { ...b, status: r.status, statusCheckedAt: Date.now() }
        if (r.status === 'ok') ok++
        else if (r.status === 'dead') dead++
        else if (r.status === 'warn') warn++
        else if (r.status === 'redirect') redirect++
        else unknown++
      } else {
        console.warn('[validateAll] 第', i, '个书签校验结果异常:', r, 'URL:', urls[i])
        bm.bookmarks[index] = { ...b, status: 'unknown', statusCheckedAt: Date.now() }
        unknown++
      }
    }
    await bm.persistAll()
    ui.finishBatchProgress('validate')
    window.$toast(`校验完成: ✅${ok} 💀${dead} ⚠️${warn} 🔁${redirect}` + (unknown > 0 ? ` ❓${unknown}` : ''), 'success')
    addNotification(`校验完成: ✅${ok} 💀${dead} ⚠️${warn} 🔁${redirect}`, 'success')
  } catch (e) {
    ui.stopBatchProgress('validate')
    window.$toast('校验异常: ' + (e.message || e), 'error')
    addNotification('校验异常: ' + (e.message || e), 'error')
    console.error('[validateAll] 异常:', e)
  }
}

async function loadAllPreviews() {
  if (ui.isBatchRunning) return window.$toast('已有批量任务正在进行，请等待完成', 'warn')
  const list = bm.bookmarks.filter((b) => !b.recycled && !b.archived)
  if (list.length === 0) return window.$toast('没有书签可加载预览', 'warn')

  window.$toast(`开始加载 ${list.length} 个预览…`, 'info')
  ui.startBatchProgress('preview', list.length)
  try {
    const urls = JSON.parse(JSON.stringify(list.map((b) => b.url)))
    const result = await window.api.invoke('preview:batch', urls)
    if (result?.error) throw new Error(result.error)
    ui.clearPreview()
    refreshCacheSize()
    ui.finishBatchProgress('preview')
    window.$toast('预览加载完成', 'success')
    addNotification('预览加载完成', 'success')
  } catch (e) {
    ui.stopBatchProgress('preview')
    window.$toast('预览异常: ' + (e.message || e), 'error')
    addNotification('预览异常: ' + (e.message || e), 'error')
    console.error('[loadAllPreviews] 异常:', e)
  }
}

async function autoClassify() {
  if (!confirm('将自动分类所有书签。\n手动分类过的书签默认保留。\n系统会先自动保存一条快照，可随时恢复。\n\n继续？')) return
  try {
    const result = await bm.applyAutoClassify({ protectManual: true })
    if (result && Array.isArray(result)) {
      window.$toast('自动分类完成（已自动保存快照）', 'success')
      await bm.load()
    }
  } catch (e) {
    window.$toast('自动分类异常: ' + (e.message || e), 'error')
    console.error('[autoClassify] 异常:', e)
  }
}

async function removeDuplicates() {
  // 前端计算重复项
  const groups = {}
  for (const b of bm.bookmarks) {
    try {
      let normalized = (b.url || '').trim().replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/i, '').toLowerCase()
      if (!groups[normalized]) groups[normalized] = []
      groups[normalized].push(b)
    } catch { /* skip invalid URLs */ }
  }
  const duplicates = []
  for (const [url, items] of Object.entries(groups)) {
    if (items.length > 1) {
      // 按更新时间降序排序，保留第一条（最近更新的）
      items.sort((a, b) => (b.updatedAt || b.addedAt || 0) - (a.updatedAt || a.addedAt || 0))
      duplicates.push({ key: url, keep: items[0], remove: items.slice(1) })
    }
  }
  if (duplicates.length === 0) {
    window.$toast('没有重复书签', 'info')
    return
  }
  dedupDialog.value = { visible: true, duplicates }
}

async function confirmDedup() {
  const ids = dedupDialog.value.duplicates.flatMap(g => g.remove.map(b => b.id))
  dedupDialog.value.visible = false
  if (ids.length === 0) return
  window.$toast(`正在删除 ${ids.length} 个重复书签…`, 'info')
  await bm.removeBatch(ids)
  window.$toast(`已删除 ${ids.length} 个重复书签`, 'success')
  dedupDialog.value = { visible: false, duplicates: [] }
}

async function refreshAllFavicons() {
  if (!confirm('将重新抓取所有书签的图标（耗时较长）。\n继续？')) return
  const list = bm.bookmarks
  ui.clearFavicon()
  window.$toast(`正在刷新 ${list.length} 个图标…`, 'info')
  const tasks = list.map((b) => () =>
    window.api.invoke('favicon:fetch', b.url).then((fname) => {
      if (fname) bm.update(b.id, { favicon: fname }).catch(() => {})
    }).catch(() => {})
  )
  await runConcurrent(tasks, 6)  // 图标刷新 6 并发
  window.$toast(`已刷新 ${list.length} 个图标`, 'success')
}

async function clearAll() {
  if (bm.bookmarks.length === 0) return window.$toast('没有书签可清除', 'info')
  // 二步验证
  if (!confirm(`⚠️ 确定清除全部 ${bm.bookmarks.length} 个书签吗？\n\n此操作不可恢复！`)) return
  if (!confirm(`再次确认：清除全部 ${bm.bookmarks.length} 个书签？\n\n输入框留空点取消可中止`)) return
  await window.api.invoke('bm:clearAll')
  await bm.load()
  window.$toast('所有书签已清除', 'success')
}

// ---- 导入导出 ----
function showResult(title, icon, message, details = []) {
  resultDialog.value = { visible: true, title, icon, message, details }
}

// 带并发控制的异步队列
function runConcurrent(tasks, limit = 4) {
  return new Promise((resolve) => {
    let idx = 0
    let running = 0
    const results = []
    function next() {
      while (running < limit && idx < tasks.length) {
        const i = idx++
        running++
        tasks[i]().then((r) => { results[i] = r }).catch(() => {}).finally(() => { running--; next() })
      }
      if (running === 0 && idx >= tasks.length) resolve(results)
    }
    next()
  })
}

// 导入后后台抓图标和预览（复用逻辑，带并发控制）
function fetchMissingMetadata(bookmarkList) {
  const tasks = bookmarkList.map((b) => () => {
    const promises = []
    if (!b.favicon) {
      promises.push(
        window.api.invoke('favicon:fetch', b.url).then((fname) => {
          if (fname) bm.update(b.id, { favicon: fname }).catch(() => {})
        }).catch(() => {})
      )
    }
    if (!b.description) {
      promises.push(
        window.api.invoke('preview:generate', b.url).then((preview) => {
          if (preview && preview.title) {
            bm.update(b.id, { description: preview.description || '', title: b.title || preview.title }).catch(() => {})
          }
        }).catch(() => {})
      )
    }
    return Promise.all(promises)
  })
  runConcurrent(tasks, 4)  // 最多 4 个并发
}

async function importHtml() {
  importResult.value = { loading: true, source: '导入 HTML 书签' }
  let r
  try { r = await getDesktopApi().invoke('io:importHtml') } catch(e) { importResult.value = null; showResult('错误', '❌', '导入失败: ' + (e.message||e)); return }
  importResult.value = null
  if (!r || r.canceled) return
  if (r.error) { showResult('导入失败', '❌', r.error); return }
  if (r.imported > 0) {
    importResult.value = { loading: false, source: 'HTML 书签', imported: r.imported, skipped: r.skipped || 0, parsed: r.parsed }
    bm.activeCategory = 'all'
    bm.statusFilter = 'all'
    await bm.load()
    fetchMissingMetadata(bm.bookmarks)
  } else if (r.parsed === 0) {
    showResult('导入结果', '📭', '该文件中未找到有效的书签链接', ['请确认文件是浏览器导出的书签 HTML'])
  } else {
    showResult('导入结果', 'ℹ️', '所有书签已存在（无新增）', [`共解析 ${r.parsed} 条，全部重复`])
  }
}

async function importCsv() {
  importResult.value = { loading: true, source: '导入 CSV 书签' }
  let r
  try { r = await getDesktopApi().invoke('io:importCsv') } catch(e) { importResult.value = null; showResult('错误', '❌', '导入失败: ' + (e.message||e)); return }
  importResult.value = null
  if (!r || r.canceled) return
  if (r.error) { showResult('导入失败', '❌', r.error); return }
  if (r.imported > 0) {
    importResult.value = { loading: false, source: 'CSV 文件', imported: r.imported, skipped: r.skipped || 0, parsed: r.parsed }
    bm.activeCategory = 'all'
    bm.statusFilter = 'all'
    await bm.load()
    fetchMissingMetadata(bm.bookmarks)
  } else if (r.parsed === 0) {
    showResult('导入结果', '📭', '该 CSV 中未找到有效的书签链接', ['请确认 CSV 包含 url/link/href 列'])
  } else {
    showResult('导入结果', 'ℹ️', '所有书签已存在（无新增）', [`共解析 ${r.parsed} 条，全部重复`])
  }
}

async function importFromBrowser(b) {
  importResult.value = { loading: true, source: `从 ${b.name} 导入` }
  let r
  try { r = await getDesktopApi().invoke('io:importFromBrowser', b.path) } catch(e) { importResult.value = null; showResult('错误', '❌', '导入失败: ' + (e.message||e)); return }
  importResult.value = null
  if (!r) return
  if (r.error) { showResult('导入失败', '❌', r.error); return }
  if (r.imported > 0) {
    importResult.value = { loading: false, source: b.name, imported: r.imported, skipped: r.skipped || 0, parsed: r.parsed }
    bm.activeCategory = 'all'
    bm.statusFilter = 'all'
    await bm.load()
    fetchMissingMetadata(bm.bookmarks)
  } else if (r.parsed === 0) {
    showResult('导入结果', '📭', `在 ${b.name} 中未找到书签`)
  } else {
    showResult('导入结果', 'ℹ️', '所有书签已存在（无新增）')
  }
}

async function exportHtml() {
  let r
  try { r = await window.api.invoke('io:exportHtml') } catch(e) { showResult('错误', '❌', '导出失败: ' + (e.message||e)); return }
  if (!r || r.canceled) return
  if (r.error) { showResult('导出失败', '❌', r.error); return }
  if (r.exported) {
    showResult('导出完成', '📤', '已导出为 Chrome 可导入的书签 HTML 文件', [`文件: ${r.path || 'bookmarks.html'}`, `共 ${bm.stats.total} 个书签`])
  }
}

async function exportJson() {
  let r
  try { r = await window.api.invoke('io:exportJson') } catch(e) { showResult('错误', '❌', '导出失败: ' + (e.message||e)); return }
  if (!r || r.canceled) return
  if (r.error) { showResult('导出失败', '❌', r.error); return }
  if (r.exported) {
    showResult('导出完成', '💾', '已导出 JSON 备份', [`文件: ${r.path || 'backup.json'}`, `共 ${bm.stats.total} 个书签`])
  }
}

async function importJson() {
  importResult.value = { loading: true, source: '导入 JSON 备份' }
  let r
  try { r = await getDesktopApi().invoke('io:importJson') } catch(e) { importResult.value = null; showResult('错误', '❌', '导入失败: ' + (e.message||e)); return }
  importResult.value = null
  if (!r || r.canceled) return
  if (r.error) { showResult('导入失败', '❌', r.error); return }
  if (r.imported > 0) {
    importResult.value = { loading: false, source: 'JSON 备份', imported: r.imported, skipped: 0, parsed: r.parsed || r.imported }
    await Promise.all([bm.load(), cats.load()])
  } else {
    showResult('导入结果', 'ℹ️', '该备份文件中没有书签数据')
  }
}

async function exportStyledHtml() {
  let r
  try { r = await window.api.invoke('io:exportStyledHtml') } catch (e) { showResult('错误', '❌', '导出失败: ' + (e.message || e)); return }
  if (!r || r.canceled) return
  if (r.error) { showResult('导出失败', '❌', r.error); return }
  if (r.exported) showResult('导出完成', '🌐', '已导出为带样式的网页文件', [`文件: ${r.path}`, `共 ${bm.stats.total} 个书签`])
}

async function importPocketCsv() {
  importResult.value = { loading: true, source: '导入 Pocket 书签' }
  let r
  try { r = await getDesktopApi().invoke('io:importPocketCsv') } catch(e) { importResult.value = null; showResult('错误', '❌', '导入失败: ' + (e.message||e)); return }
  importResult.value = null
  if (!r || r.canceled) return
  if (r.error) { showResult('导入失败', '❌', r.error); return }
  if (r.imported > 0) {
    importResult.value = { loading: false, source: 'Pocket', imported: r.imported, skipped: r.skipped || 0, parsed: r.parsed }
    bm.activeCategory = 'all'
    bm.statusFilter = 'all'
    await bm.load()
    fetchMissingMetadata(bm.bookmarks)
  } else if (r.parsed === 0) {
    showResult('导入结果', '📭', '该 CSV 中未找到有效书签')
  } else {
    showResult('导入结果', 'ℹ️', '所有书签已存在（无新增）')
  }
}

async function exportMarkdown() {
  let r
  try { r = await window.api.invoke('io:exportMarkdown') } catch (e) { showResult('错误', '❌', '导出失败: ' + (e.message || e)); return }
  if (!r || r.canceled) return
  if (r.error) { showResult('导出失败', '❌', r.error); return }
  if (r.exported) showResult('导出完成', '📝', '已导出为 Markdown 文件', [`文件: ${r.path}`, `共 ${bm.stats.total} 个书签`])
}
</script>

<style scoped>
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
</style>
