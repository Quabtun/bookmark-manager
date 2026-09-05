<template>
  <section class="flex flex-col h-full min-w-0 bg-[var(--surface-subtle)] border border-[var(--stroke-subtle)] rounded-2xl overflow-hidden">

    <!-- 顶栏（可向上收纳） -->
    <header
      class="px-3 py-2 flex flex-col gap-2 border-b border-[var(--stroke-subtle)] backdrop-blur-xl shrink-0 cursor-pointer select-none transition-all duration-200"
      :class="[
        side === 'left' ? 'bg-amber-50/60 dark:bg-amber-900/15' : 'bg-sky-50/60 dark:bg-sky-900/15',
        headerCollapsed ? 'py-1 px-3' : 'py-2'
      ]"
      @click="viewState.setLastActiveSide(side)"
      @dblclick="headerCollapsed = !headerCollapsed"
    >
      <!-- 收纳态顶栏（只显示标题 + 展开按钮） -->
      <template v-if="headerCollapsed">
        <div class="flex items-center gap-2">
          <span class="text-base shrink-0">{{ side === 'left' ? '📥' : '🗂️' }}</span>
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-semibold truncate">{{ side === 'left' ? '待分类区' : '分类区' }}</div>
            <div class="text-[10px] text-slate-400 truncate">{{ headerSubtitle }}</div>
          </div>
          <button @click.stop="headerCollapsed = false"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60 shrink-0"
                  title="展开功能栏">
            ▼
          </button>
        </div>
      </template>

      <!-- 展开态顶栏 -->
      <template v-else>
        <!-- 第一行：标题 + 分类选择下拉 + 导入/导出/新建/⋯/显示方式/收纳 -->
        <div class="flex items-center gap-2">
          <span class="text-base shrink-0">{{ side === 'left' ? '📥' : '🗂️' }}</span>
          <div class="leading-tight shrink-0 min-w-0">
            <div class="text-[13px] font-semibold truncate">{{ side === 'left' ? '待分类区' : '分类区' }}</div>
            <div class="text-[10px] text-slate-400 truncate">{{ headerSubtitle }}</div>
          </div>

          <!-- 左窗：批量操作（删除选中） -->
          <button v-if="side === 'left' && paneSelectedSize > 0"
                  @click.stop="$emit('batchDeleteSelected')"
                  class="text-[10px] px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200 dark:hover:bg-red-900/50"
                  :title="'删除选中的 ' + paneSelectedSize + ' 个书签'">
            🗑 删除选中 ({{ paneSelectedSize }})
          </button>
          <button v-if="side === 'left' && paneSelectedSize > 0"
                  @click.stop="clearPaneSelected"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
                  title="清除选择">
            ✕
          </button>

          <!-- 左窗：导入按钮（点击展开下拉菜单） -->
          <div v-if="side === 'left'" class="relative" ref="importMenuContainer">
            <button @click.stop="toggleImportMenu"
                    class="text-[10px] px-2 py-0.5 rounded-md bg-accent text-white hover:bg-accent-600 flex items-center gap-1">
              ⬇ 导入 <span class="text-[8px]">▾</span>
            </button>
            <teleport to="body">
              <div v-if="importMenuOpen" class="fixed z-[300] w-56 glass rounded-xl shadow-glass py-1 animate-pop"
                   :style="{ right: importMenuRight + 'px', top: importMenuTop + 'px' }">
                <div class="text-[10px] uppercase tracking-wide text-slate-400 px-3 py-1">导入</div>
                <button v-for="act in menuImportActions" :key="act.id"
                        @click="onMenuAction(act.id)"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                  {{ act.icon }} {{ act.label }}
                </button>
                <button v-for="b in detectedBrowsers" :key="b.browser"
                        @click="onMenuBrowser(b)"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                  {{ b.icon }} 从 {{ b.name }} 导入
                </button>
              </div>
            </teleport>
          </div>
          <button v-if="side === 'left' && selectedKey && selectedKey !== 'all' && selectedKey !== 'unclassified'"
                  @click.stop="selectKey('unclassified')"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60">
            返回未分类
          </button>

          <!-- 新建文件夹按钮已移除，集中在分类管理弹窗 / 树右键菜单 / Sidebar 入口 -->

          <!-- 分类环境（仅右窗显示） -->
          <button v-if="side === 'right'" @click.stop="$emit('openEnvManager')"
                  class="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 flex items-center gap-1"
                  title="分类环境（多套分类方案）">
            🌍 环境
          </button>

          <!-- 右窗：导出菜单（下拉选择） -->
          <div v-if="side === 'right'" class="relative" ref="exportDropdownContainer">
            <button @click.stop="toggleExportDropdown"
                    class="text-[10px] px-2 py-0.5 rounded-md bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 flex items-center gap-1">
              📤 导出 <span class="text-[8px]">▾</span>
            </button>
            <teleport to="body">
              <div v-if="exportDropdownOpen"
                   class="fixed z-[300] w-56 glass rounded-xl shadow-glass py-1 animate-pop"
                   :style="{ right: exportDropdownRight + 'px', top: exportDropdownTop + 'px' }">
                <div class="text-[10px] uppercase tracking-wide text-slate-400 px-3 py-1">导出</div>
                <button v-if="currentCategoryNode"
                        @click="onExportAction('exportCategory'); exportDropdownOpen = false"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                  📁 导出「{{ currentCategoryNode.name }}」
                </button>
                <button v-for="act in menuExportActions" :key="'exp-' + act.id"
                        @click="onExportAction(act.id); exportDropdownOpen = false"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                  {{ act.icon }} {{ act.label }}
                </button>
              </div>
            </teleport>
          </div>

          <!-- 显示方式：下拉选择 7 种布局（详细信息/并行排列/三行排列/四行排列/平铺/列表/内容） -->
          <div class="flex items-center gap-1" @click.stop>
            <span class="text-[10px] text-slate-400">显示方式</span>
            <select v-model="displayMode"
                    class="text-[10px] px-1.5 py-0.5 rounded-md bg-white/60 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 hover:border-accent/60 focus:border-accent outline-none cursor-pointer"
                    title="选择显示方式">
              <option v-for="m in displayModes" :key="m.key" :value="m.key">
                {{ m.icon }} {{ m.label }}
              </option>
            </select>
          </div>

          <!-- 左窗预览缓存占用（来自 HomeView 注入） -->
          <span v-if="side === 'left' && previewCacheMb !== null"
                class="text-[10px] px-2 py-0.5 rounded-md text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700/60 select-none"
                title="预览图缓存占用"
                @click.stop>
            🖼️ {{ previewCacheMb }} / {{ previewCacheLimitMb }} MB
          </span>

          <!-- 左窗：全选图标（按窗独立：仅作用于左窗当前可见书签） -->
          <button v-if="side === 'left' && bm.filtered.length > 0"
                  @click.stop="togglePaneSelectAll"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
                  :title="paneSelectedSize === bm.filtered.length ? '取消全选' : '全选当前可见书签 (' + bm.filtered.length + ')'">
            ☑️
          </button>

          <!-- 左窗：隐藏操作功能（自动分类/刷新图标/去重/清空） -->
          <button v-if="side === 'left'" @click.stop="onMenuAction('autoClassify')"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
                  title="自动分类">
            🤖
          </button>
          <button v-if="side === 'left'" @click.stop="onMenuAction('refreshAllFavicons')"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
                  title="刷新全部图标">
            🔄
          </button>
          <button v-if="side === 'left'" @click.stop="onMenuAction('removeDuplicates')"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
                  title="去重">
            🔁
          </button>
          <button v-if="side === 'left'" @click.stop="onMenuAction('clearAll')"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                  title="清空">
            🗑️
          </button>

          <!-- 顶栏向上收纳 -->
          <button @click.stop="headerCollapsed = true"
                  class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
                  title="收起功能栏 (向上折叠)">
            ▲
          </button>
        </div>

        <!-- 第二行：搜索 + 状态筛选 + 阅读筛选 + 排序 + 标签筛选 -->
        <div class="flex items-center gap-1.5 flex-wrap" @click.stop>
          <!-- 搜索框（按窗独立） -->
          <div class="relative flex-1 min-w-[140px] max-w-md">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input v-model="paneSearch" @focus="emit('onSearchFocus')" @blur="emit('onSearchBlur')" @input="emit('onSearchInput')"
                   placeholder="搜索此窗书签…"
                   class="input pl-7 text-xs py-0.5" />
            <!-- 搜索建议下拉 -->
            <div v-if="showSearchSuggestions && searchHistory && searchHistory.length > 0 && searchFocused"
                 class="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-glass border border-slate-200 dark:border-slate-700 py-1 z-50 max-h-48 overflow-y-auto">
              <div v-for="q in searchHistory.filter(h => !paneSearch || h.toLowerCase().includes(paneSearch.toLowerCase()))" :key="q"
                   @mousedown.prevent="selectSearchSuggestion(q)"
                   class="px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-2">
                <span class="text-slate-400">🕐</span>
                <span>{{ q }}</span>
              </div>
            </div>
          </div>

          <!-- 状态筛选 -->
          <select v-model="pane.statusFilter" @change="emit('statusFilterChanged', pane.statusFilter)"
                  class="input w-auto text-xs py-0.5">
            <option value="all">全部状态</option>
            <option value="ok">✅ 正常</option>
            <option value="warn">⚠️ 异常</option>
            <option value="dead">💀 失效</option>
            <option value="redirect">🔁 跳转</option>
            <option value="unknown">❓ 未检查</option>
          </select>

          <!-- 阅读状态筛选 -->
          <select v-model="pane.readFilter" @change="emit('readFilterChanged', pane.readFilter)"
                  class="input w-auto text-xs py-0.5">
            <option value="">阅读状态</option>
            <option value="unread">📖 未读</option>
            <option value="reading">📖 在读</option>
            <option value="done">✅ 已读</option>
          </select>

          <!-- 排序（按窗独立，下拉选择） -->
          <select v-model="pane.sortBy" @change="setPaneSort(pane.sortBy)"
                  class="input w-auto text-xs py-0.5"
                  title="排序方式">
            <option value="manual">📌 手动</option>
            <option value="title">Aa 标题 A→Z</option>
            <option value="title-desc">Az 标题 Z→A</option>
            <option value="frequency">🔥 常用</option>
            <option value="addedAt">📅 最新添加</option>
            <option value="addedAt-asc">📅 最早添加</option>
            <option value="status">🩺 状态</option>
            <option value="url">🔗 URL</option>
          </select>

          <!-- 新建（仅左窗，左窗覆盖范围是全局，新建应放主窗） -->
          <button v-if="side === 'left'" @click.stop="emit('add')"
                  class="btn-ghost text-xs py-0.5">
            ＋ 新建
          </button>

          <!-- 新建文件夹（仅右窗：手动分类入口） -->
          <button v-if="side === 'right'" @click.stop="emit('new-folder')"
                  class="btn-ghost text-xs py-0.5"
                  title="新建文件夹">
            ＋ 新建文件夹
          </button>

          <!-- 校验（仅左窗） -->
          <button v-if="side === 'left'" @click.stop="emit('validateAll')"
                  :disabled="props.validateRunning"
                  class="btn-ghost text-xs py-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  :title="props.validateRunning ? '正在校验书签' : '校验所有书签'">
            🩺 校验
          </button>

          <!-- 预览（仅左窗） -->
          <button v-if="side === 'left'" @click.stop="emit('loadAllPreviews')"
                  :disabled="props.previewRunning"
                  class="btn-ghost text-xs py-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  :title="props.previewRunning ? '正在加载预览' : '加载所有预览'">
            🖼️ 预览
          </button>

          <!-- 归档选中（仅左窗，按窗隔离的选中集） -->
          <button v-if="side === 'left' && paneSelectedSize > 0" @click.stop="emit('archiveSelected')"
                  class="btn-ghost text-xs py-0.5 text-amber-500"
                  :title="`归档选中 ${paneSelectedSize} 项`">
            📦 归档选中 ({{ paneSelectedSize }})
          </button>
        </div>
      </template>
    </header>

    <!-- 主体：分类树（可收纳+可拖拽） + 书签列表 -->
    <div class="flex-1 grid min-h-0" :style="gridStyle">
      <!-- 分类区（常驻展开，不再收纳） -->
      <div class="relative overflow-y-auto px-1.5 py-2 border-r border-[var(--stroke-subtle)] min-h-0 select-none bg-white/30 dark:bg-slate-900/30">
        <!-- 左窗快捷入口：未分类（filter 出没有 categoryId 的书签） -->
        <div v-if="side === 'left'" class="mb-1.5 pb-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
          <button @click="selectKey('unclassified')"
                  :class="['w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2',
                           selectedKey === 'unclassified' ? 'bg-accent/15 text-accent font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-700/60']">
            <span>📥</span><span class="flex-1">未分类</span>
            <span class="text-[10px] text-slate-400">{{ unclassifiedCount }}</span>
          </button>
        </div>

        <!-- 树顶部静态标题（导入区 / 我的整理） -->
        <div class="px-2 pb-1.5 mb-1.5 border-b border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5">
          <span class="text-sm">{{ side === 'left' ? '📥' : '🗂️' }}</span>
          <span class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex-1">
            {{ side === 'left' ? '已导入' : '我的整理' }}
          </span>
          <span class="text-[10px] text-slate-400">{{ treeNodesFlat.length }}</span>
        </div>

        <!-- 分类选择下拉（点击切换顶层分类） -->
        <div class="relative mb-1.5" ref="catDropdownContainer">
          <button @click.stop="toggleCatDropdown"
                  class="w-full text-[11px] px-2 py-1 rounded-md bg-slate-100/70 dark:bg-slate-700/60 hover:bg-slate-200/70 dark:hover:bg-slate-600/60 flex items-center gap-1 min-w-0">
            <span class="text-sm shrink-0">{{ currentCatIcon }}</span>
            <span class="flex-1 text-left truncate font-medium">{{ currentCatName }}</span>
            <span class="text-[8px] shrink-0 opacity-60">▾</span>
          </button>
          <teleport to="body">
            <div v-if="catDropdownOpen"
                 class="fixed z-[300] w-64 max-h-80 overflow-y-auto glass rounded-xl shadow-glass py-1 animate-pop"
                 :style="{ left: catDropdownLeft + 'px', top: catDropdownTop + 'px' }">
              <div class="text-[10px] uppercase tracking-wide text-slate-400 px-3 py-1">快速切换</div>
              <button v-for="vc in virtualCatList" :key="'vc-' + vc.id"
                      @click="onSelectVirtual(vc.id); catDropdownOpen = false"
                      :class="['w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2',
                               selectedKey === vc.id ? 'bg-accent/15 text-accent font-medium' : '']">
                <span class="text-base">{{ vc.icon }}</span>
                <span class="flex-1 truncate">{{ vc.name }}</span>
                <span v-if="vc.count !== null" class="text-[10px] text-slate-400">{{ vc.count }}</span>
              </button>
              <div v-if="catDropdownList.length > 0" class="border-t border-slate-200/50 dark:border-slate-700/50 my-1"></div>
              <div v-if="catDropdownList.length > 0" class="text-[10px] uppercase tracking-wide text-slate-400 px-3 py-1">{{ side === 'right' ? '手动文件夹' : '已导入文件夹' }}</div>
              <button v-for="c in catDropdownList" :key="'c-' + c.id"
                      @click="onSelectCat(c.id); catDropdownOpen = false"
                      :class="['w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2',
                               selectedKey === c.id ? 'bg-accent/15 text-accent font-medium' : '']">
                <span class="text-base">{{ c.icon || '📁' }}</span>
                <span class="flex-1 truncate">{{ c.name }}</span>
                <span class="text-[10px] text-slate-400">{{ c.bookmarkCount || 0 }}</span>
              </button>
              <div class="border-t border-slate-200/50 dark:border-slate-700/50 my-1"></div>
              <button @click="openCategoryManager; catDropdownOpen = false"
                      class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-accent">
                <span>⚙</span><span>分类管理...</span>
              </button>
            </div>
          </teleport>
        </div>

        <!-- 真实分类树（已包裹虚拟根：我的整理 / 已导入） -->
        <CategoryTree
          :nodes="wrappedTreeNodes"
          :expanded-ids="treeExpandedIds"
          :selected-id="selectedKey"
          :on-drop-bookmark="handleDropBookmark"
          :on-drop-category="handleDropCategory"
          :on-select="selectKey"
          :on-toggle-expand="toggleExpand"
          :on-context-menu="openLeftTreeContextMenu"
          empty-text="暂无分类，去分类管理新建"
        />
      </div>


      <!-- 书签列表（按显示方式渲染） -->
      <div class="overflow-y-auto px-3 py-2 min-w-0 min-h-0 transition-colors flex-1"
           :class="[
             side === 'left' ? 'bg-white/30 dark:bg-slate-900/30' : '',
             listDragOver ? 'ring-2 ring-accent ring-inset bg-accent/5' : '',
             dropDisallowed ? 'ring-2 ring-red-400 ring-inset bg-red-50/50 dark:bg-red-900/10' : ''
           ]"
           @dragover.stop.prevent="onListDragOver"
           @drop.stop.prevent="onListDrop"
           @dragleave="onListDragLeave"
           @contextmenu.prevent="openSurfaceMenu">
          <!-- 显示方式：detail / 并行排列 / 三行排列 / 四行排列 / 平铺 / 列表 / 内容 -->
          <div class="space-y-2">
            <div v-for="(group, gIdx) in groupedList" :key="group.key">
              <div v-if="group.label" class="sticky top-0 z-[1] px-2 py-1 text-[11px] font-semibold text-slate-500 bg-[var(--surface-subtle)]/95 backdrop-blur rounded-md mb-1">
                {{ group.label }} <span class="opacity-60">({{ group.items.length }})</span>
              </div>

              <!-- 列表 / 详细信息：单列 -->
              <div v-if="['list','detail','content'].includes(displayMode)" class="space-y-1">
                <BookmarkCard
                  v-for="bm in group.items" :key="bm.id"
                  :bm="bm"
                  :class="displayMode === 'list' ? 'list-card' : (displayMode === 'content' ? 'content-card' : 'detail-card')"
                  @edit="$emit('cardEdit', $event)"
                  @validate="$emit('cardValidate', $event)"
                  @geo="$emit('cardGeo', $event)"
                  @archive="$emit('cardArchive', $event)"
                  @restore="$emit('cardRestore', $event)"
                  @unarchive="$emit('cardUnarchive', $event)"
                  @delete="$emit('cardDelete', $event)"
                  @open="$emit('cardOpen', $event)"
                  @hover="$emit('cardHover', $event)"
                  @leave="$emit('cardLeave', $event)"
                  @context="$emit('cardContext', $event)"
                  @quick-note="$emit('cardQuickNote', $event)"
                  @reorder="onCardReorder"
                />
              </div>

              <!-- 平铺：多列网格 -->
              <div v-else-if="displayMode === 'tile'" class="grid gap-2" :style="gridColumnsStyle">
                <BookmarkCard
                  v-for="bm in group.items" :key="bm.id"
                  :bm="bm"
                  class="grid-card"
                  @edit="$emit('cardEdit', $event)"
                  @validate="$emit('cardValidate', $event)"
                  @geo="$emit('cardGeo', $event)"
                  @archive="$emit('cardArchive', $event)"
                  @restore="$emit('cardRestore', $event)"
                  @unarchive="$emit('cardUnarchive', $event)"
                  @delete="$emit('cardDelete', $event)"
                  @open="$emit('cardOpen', $event)"
                  @hover="$emit('cardHover', $event)"
                  @leave="$emit('cardLeave', $event)"
                  @context="$emit('cardContext', $event)"
                  @quick-note="$emit('cardQuickNote', $event)"
                  @reorder="onCardReorder"
                />
              </div>

              <!-- 并行排列 / 三行排列 / 四行排列：紧凑网格 -->
              <div v-else :class="['grid gap-2', iconGridClass]" :style="iconCardStyle">
                <BookmarkCard
                  v-for="bm in group.items" :key="bm.id"
                  :bm="bm"
                  :class="iconCardClass"
                  @edit="$emit('cardEdit', $event)"
                  @validate="$emit('cardValidate', $event)"
                  @geo="$emit('cardGeo', $event)"
                  @archive="$emit('cardArchive', $event)"
                  @restore="$emit('cardRestore', $event)"
                  @unarchive="$emit('cardUnarchive', $event)"
                  @delete="$emit('cardDelete', $event)"
                  @open="$emit('cardOpen', $event)"
                  @hover="$emit('cardHover', $event)"
                  @leave="$emit('cardLeave', $event)"
                  @context="$emit('cardContext', $event)"
                  @quick-note="$emit('cardQuickNote', $event)"
                  @reorder="onCardReorder"
                />
              </div>
            </div>
          </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu
      :open="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenuItems"
      @close="closeContextMenu"
      @select="onMenuSelect"
    />

    <!-- 重命名弹窗 -->
    <teleport to="body">
      <div v-if="renameDialog.visible"
           class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
           @click.self="renameDialog.visible = false">
        <div class="w-72 glass rounded-2xl shadow-glass p-4 animate-pop">
          <h3 class="text-sm font-semibold mb-3">重命名文件夹</h3>
          <input v-model="renameDialog.name" @keydown.enter="commitRename"
                 class="input text-sm" />
          <div class="flex justify-end gap-2 mt-3">
            <button @click="renameDialog.visible = false" class="btn-ghost text-xs">取消</button>
            <button @click="commitRename" class="btn-accent text-xs">确定</button>
          </div>
        </div>
      </div>
    </teleport>
  </section>
</template>

<script setup>
import { computed, ref, watch, h, defineComponent, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import BookmarkCard from './BookmarkCard.vue'
import ContextMenu from './ContextMenu.vue'
import { useBookmarksStore } from '../stores/bookmarks.js'
import { useCategoriesStore } from '../stores/categories.js'
import { useViewStateStore } from '../stores/viewState.js'

const props = defineProps({
  side: { type: String, default: 'right' }, // 'left' | 'right'
  // 从 HomeView 注入的状态
  previewCacheMb: { type: Number, default: null },
  previewCacheLimitMb: { type: Number, default: 100 },
  searchHistory: { type: Array, default: () => [] },
  showSearchSuggestions: { type: Boolean, default: false },
  validateRunning: { type: Boolean, default: false },
  previewRunning: { type: Boolean, default: false }
})
const emit = defineEmits([
  'new-folder', 'surface-menu', 'manage-categories', 'import',
  // 透传给 HomeView 的全局操作
  'add', 'validateAll', 'loadAllPreviews', 'autoClassify',
  'refreshAllFavicons', 'removeDuplicates', 'clearAll', 'archiveSelected',
  'importHtml', 'exportHtml', 'exportJson', 'exportStyledHtml',
  'importJson', 'importFromBrowser', 'importPocketCsv', 'importCsv',
  'exportMarkdown',
  // 分类环境管理
  'openEnvManager',
  // 右窗顶栏导出菜单（统一转发）
  'exportAction',
  'selectSearchSuggestion', 'onSearchBlur', 'onSearchFocus', 'onSearchInput',
  // 单卡操作：透传给 HomeView（卡片上的编辑/校验/位置/归档/删除/打开等按钮）
  'cardEdit', 'cardValidate', 'cardGeo', 'cardArchive', 'cardRestore', 'cardUnarchive', 'cardDelete',
  'cardOpen', 'cardHover', 'cardLeave', 'cardContext', 'cardQuickNote'
])

const bm = useBookmarksStore()
const cats = useCategoriesStore()
const viewState = useViewStateStore()

// ---- 左右窗独立筛选状态（每窗独立，会话级） ----
const pane = computed(() => bm.getPane(props.side))

// 在 pane reactive 上扩展字段（按需扩展）
if (pane.value.tagFilter === undefined) {
  pane.value.tagFilter = ''
}
if (pane.value.sortBy === undefined) {
  pane.value.sortBy = 'manual'
}

const paneSearch = computed({
  get: () => pane.value.search || '',
  set: (v) => { pane.value.search = v }
})

function setPaneSort(field) {
  bm.setPaneSort(props.side, field)
}
function setPaneTagFilter(tag) {
  pane.value.tagFilter = tag
  tagFilterOpen.value = false
}
function sortBtnClass(field) {
  const active = pane.value.sortBy === field
  const base = 'px-2 py-0.5 text-[10px] transition'
  return active ? base + ' bg-accent text-white' : base + ' bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600'
}

// 搜索建议
const searchFocused = ref(false)
function selectSearchSuggestion(q) {
  paneSearch.value = q
  emit('selectSearchSuggestion', q)
  searchFocused.value = false
}

// ---- 导出菜单（右窗顶栏下拉） ----
const exportDropdownContainer = ref(null)
const exportDropdownOpen = ref(false)
const exportDropdownTop = ref(0)
const exportDropdownRight = ref(0)

function toggleExportDropdown() {
  exportDropdownOpen.value = !exportDropdownOpen.value
  if (exportDropdownOpen.value) {
    if (exportDropdownContainer.value) {
      const rect = exportDropdownContainer.value.getBoundingClientRect()
      exportDropdownTop.value = rect.bottom + 4
      exportDropdownRight.value = window.innerWidth - rect.right
    }
    setTimeout(() => document.addEventListener('click', onClickOutsideExportDropdown), 0)
  } else {
    document.removeEventListener('click', onClickOutsideExportDropdown)
  }
}

function onClickOutsideExportDropdown(e) {
  if (!exportDropdownContainer.value) return
  if (!exportDropdownContainer.value.contains(e.target)) {
    exportDropdownOpen.value = false
    document.removeEventListener('click', onClickOutsideExportDropdown)
  }
}
async function onExportAction(actionId) {
  if (actionId === 'exportCategory') {
    await exportCurrentFolder()
    return
  }
  // 转发到 HomeView 已有的导出函数（通过 emit）
  emit('exportAction', actionId)
}

// ---- 导入下拉菜单 ----
const importMenuContainer = ref(null)
const importMenuOpen = ref(false)
const importMenuTop = ref(0)
const importMenuRight = ref(0)
const detectedBrowsers = ref([])

const menuImportActions = [
  { id: 'importHtml', icon: '📄', label: '从 HTML 文件导入' },
  { id: 'importCsv', icon: '📊', label: '从 CSV 导入' },
  { id: 'importPocketCsv', icon: '🐶', label: '从 Pocket 导入' },
  { id: 'importJson', icon: '♻️', label: '导入 JSON 备份' }
]
const menuExportActions = [
  { id: 'exportHtml', icon: '📤', label: '导出 Chrome 书签' },
  { id: 'exportStyledHtml', icon: '🌐', label: '导出为网页' },
  { id: 'exportMarkdown', icon: '📝', label: '导出为 Markdown' },
  { id: 'exportJson', icon: '💾', label: '导出 JSON 备份' }
]

function toggleImportMenu() {
  importMenuOpen.value = !importMenuOpen.value
  if (importMenuOpen.value) {
    if (importMenuContainer.value) {
      const rect = importMenuContainer.value.getBoundingClientRect()
      importMenuTop.value = rect.bottom + 4
      importMenuRight.value = window.innerWidth - rect.right
    }
    setTimeout(() => document.addEventListener('click', onClickOutsideImportMenu), 0)
    if (detectedBrowsers.value.length === 0) {
      try {
        window.api.invoke('io:detectBrowsers').then((r) => {
          if (Array.isArray(r)) detectedBrowsers.value = r
        }).catch(() => {})
      } catch { /* api not ready */ }
    }
  } else {
    document.removeEventListener('click', onClickOutsideImportMenu)
  }
}
function onClickOutsideImportMenu(e) {
  if (importMenuContainer.value && !importMenuContainer.value.contains(e.target)) {
    importMenuOpen.value = false
    document.removeEventListener('click', onClickOutsideImportMenu)
  }
}
function onMenuAction(name) {
  importMenuOpen.value = false
  document.removeEventListener('click', onClickOutsideImportMenu)
  emit(name)
}
function onMenuBrowser(b) {
  importMenuOpen.value = false
  document.removeEventListener('click', onClickOutsideImportMenu)
  emit('importFromBrowser', b)
}

// 标签筛选位置
const tagFilterContainer = ref(null)
const tagFilterOpen = ref(false)
const tagFilterTop = ref(0)
const tagFilterRight = ref(0)
function closeTagFilter(e) {
  if (tagFilterContainer.value && !tagFilterContainer.value.contains(e.target)) {
    tagFilterOpen.value = false
    document.removeEventListener('click', closeTagFilter)
  }
}
watch(tagFilterOpen, (v) => {
  if (v) {
    nextTick(() => {
      if (tagFilterContainer.value) {
        const rect = tagFilterContainer.value.getBoundingClientRect()
        tagFilterTop.value = rect.bottom + 4
        tagFilterRight.value = window.innerWidth - rect.right
      }
      setTimeout(() => document.addEventListener('click', closeTagFilter), 0)
    })
  }
})

// ---- 收纳 / 显示方式 ----
const HEADER_KEY = `organizer-header-collapsed-${props.side}`
const headerCollapsed = ref(localStorage.getItem(HEADER_KEY) === '1')
watch(headerCollapsed, (v) => localStorage.setItem(HEADER_KEY, v ? '1' : '0'))

// 显示方式切换（每窗独立：7 种布局）
const DISPLAY_MODE_KEY = `organizer-display-mode-${props.side}`
const displayModes = [
  { key: 'detail',  label: '详细信息', icon: '≡' },
  { key: 'iconS',   label: '并行排列', icon: '⫶' },
  { key: 'iconM',   label: '三行排列', icon: '☰' },
  { key: 'iconL',   label: '四行排列', icon: '☱' },
  { key: 'tile',    label: '平铺',     icon: '▦' },
  { key: 'list',    label: '列表',     icon: '☷' },
  { key: 'content', label: '内容',     icon: '▤' }
]
// 兼容旧值（之前可能保存 list/grid/detail），映射到新的 7 项
function migrateOldDisplayMode(v) {
  if (!v) return 'detail'
  if (['list', 'grid', 'detail'].includes(v)) {
    return v === 'grid' ? 'tile' : v
  }
  return displayModes.some(m => m.key === v) ? v : 'detail'
}
const displayMode = ref(migrateOldDisplayMode(localStorage.getItem(DISPLAY_MODE_KEY)))
watch(displayMode, (v) => localStorage.setItem(DISPLAY_MODE_KEY, v))
const displayModeIcon = computed(() => displayModes.find(m => m.key === displayMode.value)?.icon || '≡')
const currentDisplayLabel = computed(() => displayModes.find(m => m.key === displayMode.value)?.label || '')
function toggleDisplayMode() {
  const idx = displayModes.findIndex(m => m.key === displayMode.value)
  displayMode.value = displayModes[(idx + 1) % displayModes.length].key
}

// 网格视图列数
const gridColumnsStyle = computed(() => {
  if (displayMode.value !== 'tile') return {}
  return { gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }
})

// 并行排列 / 三行排列 / 四行排列 三种紧凑网格的列宽 + 卡片样式
const iconGridClass = computed(() => {
  if (displayMode.value === 'iconS') return 'grid gap-1'         // 并行排列：紧凑
  if (displayMode.value === 'iconM') return 'grid gap-2'         // 三行排列：中等
  if (displayMode.value === 'iconL') return 'grid gap-3'         // 四行排列：宽松
  return ''
})
const iconCardClass = computed(() => {
  if (displayMode.value === 'iconS') return 'icon-card-sm'
  if (displayMode.value === 'iconM') return 'icon-card-md'
  if (displayMode.value === 'iconL') return 'icon-card-lg'
  return ''
})
const iconCardStyle = computed(() => {
  if (displayMode.value === 'iconS') return { minWidth: '70px' }
  if (displayMode.value === 'iconM') return { minWidth: '150px' }
  if (displayMode.value === 'iconL') return { minWidth: '220px' }
  return {}
})

// ---- 状态排序权重（与 store 一致） ----
const STATUS_ORDER = { dead: 0, warn: 1, redirect: 2, unknown: 3, ok: 4 }

// ---- 当前选中节点 ----
const selectedKey = computed(() => {
  return props.side === 'left'
    ? viewState.organizer.leftSelectedKey
    : viewState.organizer.rightSelectedKey
})

function selectKey(key) {
  // 单击虚拟根（「我的整理」/「已导入」） → 切换其展开状态，不影响书签列表
  if (key === WRAPPED_ROOT_ID.value) {
    toggleExpand(key)
    return
  }
  if (props.side === 'left') viewState.selectLeft(key)
  else viewState.selectRight(key)
  // 切换窗时把 store 的活动窗也同步过来，避免与 selectedByPane 错位
  try { bm.setActiveSide(props.side) } catch {}
}

// 按窗隔离的多选状态：本窗内 selected.size 的视图
const paneSelectedSize = computed(() => bm.paneSize(props.side))
function clearPaneSelected() {
  bm.paneClear(props.side)
}
function togglePaneSelectAll() {
  const ids = (bm.filtered || []).map(b => b.id)
  if (bm.paneSize(props.side) === ids.length && ids.length > 0) {
    bm.paneClear(props.side)
  } else {
    bm.paneSelectAll(props.side, ids)
  }
}

const treeNodesFlat = computed(() => {
  if (props.side === 'right') {
    // 右窗：用户手动添加的分类树
    return cats.manualTree?.value || cats.manualTree || []
  }
  // 左窗：导入的分类树
  return cats.importedTree?.value || cats.importedTree || []
})

const treeNodes = computed(() => {
  // 保留 treeNodes 别名（用于 expandAll 等场景）
  return treeNodesFlat.value
})

// ---- 分类树展开状态（每窗独立） ----
const treeExpandedIds = computed(() => {
  return props.side === 'left'
    ? viewState.organizer.leftExpandedIds
    : viewState.organizer.rightExpandedIds
})
function toggleExpand(id) {
  if (props.side === 'left') viewState.toggleLeftExpanded(id)
  else viewState.toggleRightExpanded(id)
}

// ---- 虚拟根：「我的整理」 / 「已导入」包住整棵真实分类树 ----
// 让 CategoryTree 渲染时从单一根节点开始，让用户能从一个标题点开看到整棵树。
const WRAPPED_ROOT_ID = computed(() => 'pane-root-' + props.side)
const WRAPPED_ROOT_NAME = computed(() => props.side === 'right' ? '我的整理' : '已导入')
const WRAPPED_ROOT_ICON = computed(() => props.side === 'right' ? '🗂️' : '📥')

// 包一层虚拟根，让 CategoryTree 渲染单一根结构；不修改 cats 里真实数据
const wrappedTreeNodes = computed(() => [{
  id: WRAPPED_ROOT_ID.value,
  name: WRAPPED_ROOT_NAME.value,
  icon: WRAPPED_ROOT_ICON.value,
  children: treeNodesFlat.value
}])

function ensureRootExpanded() {
  const ids = treeExpandedIds.value || []
  const set = new Set(ids)
  let changed = false
  if (!set.has(WRAPPED_ROOT_ID.value)) { set.add(WRAPPED_ROOT_ID.value); changed = true }
  // 默认展开整棵目录树：所有分类节点都进入 expandedIds，让用户一眼看到完整目录结构。
  // 用户后续仍可手动折叠任意节点（toggleExpand 会从 set 中移除）。
  function walk(nodes) {
    for (const n of (nodes || [])) {
      if (n && n.id && !set.has(n.id)) { set.add(n.id); changed = true }
      if (n && n.children && n.children.length) walk(n.children)
    }
  }
  walk(treeNodesFlat.value)
  if (changed) {
    if (props.side === 'left') viewState.organizer.leftExpandedIds = [...set]
    else viewState.organizer.rightExpandedIds = [...set]
  }
}

// 左窗「未分类」按钮的数量统计：与点击后过滤逻辑一致（!categoryId）
const unclassifiedCount = computed(() => {
  if (props.side !== 'left') return 0
  return (bm.bookmarks || []).filter((b) => !b.recycled && !b.archived && !b.categoryId).length
})

// 顶栏分类快速切换下拉
const catDropdownContainer = ref(null)
const catDropdownOpen = ref(false)
const catDropdownLeft = ref(0)
const catDropdownTop = ref(0)

// 树占固定宽度：分类区常驻展开，不再有收纳态。拖拽手柄也省略，由 OrganizerPane 外层 grid 控制整体窗宽。
const gridStyle = computed(() => ({
  gridTemplateColumns: '240px 1fr'
}))
const currentCatName = computed(() => {
  const k = selectedKey.value
  if (!k || k === 'all') return '所有书签'
  if (k === 'unclassified') return '未分类'
  if (k.startsWith('smart:')) return '智能文件夹'
  return cats.byId[k]?.name || '未知分类'
})
const currentCatIcon = computed(() => {
  const k = selectedKey.value
  if (!k || k === 'all') return '📑'
  if (k === 'unclassified') return '📥'
  if (k.startsWith('smart:')) return '✨'
  return cats.byId[k]?.icon || '📁'
})
function toggleCatDropdown() {
  if (catDropdownOpen.value) { catDropdownOpen.value = false; return }
  const el = catDropdownContainer.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  catDropdownLeft.value = rect.left
  catDropdownTop.value = rect.bottom + 4
  catDropdownOpen.value = true
  setTimeout(() => document.addEventListener('click', closeCatDropdown), 0)
}
function closeCatDropdown() {
  catDropdownOpen.value = false
  document.removeEventListener('click', closeCatDropdown)
}
function onSelectVirtual(id) { selectKey(id) }
function onSelectCat(id) { selectKey(id) }
// 顶栏分类下拉：根据当前窗，左窗显示导入分类，右窗显示手动分类
const catDropdownList = computed(() => {
  const src = props.side === 'right' ? cats.manualList : cats.importedList
  const list = src?.value || src || []
  return list.map((c) => ({ ...c }))
})
function openCategoryManager() {
  catDropdownOpen.value = false
  emit('manage-categories')
}

// ---- 书签聚合（按侧键 + 按窗独立筛选） ----
const filteredBookmarks = computed(() => {
  const key = selectedKey.value
  const all = bm.bookmarks.filter((b) => !b.recycled && !b.archived)
  let list
  if (props.side === 'left') {
    if (key === 'all') list = all
    else if (key === 'unclassified' || !key) list = all.filter((b) => !b.categoryId)
    else {
      const ids = cats.descendantIds(key)
      list = all.filter((b) => ids.has(b.categoryId))
    }
  } else {
    if (!key) list = []
    else {
      const ids = cats.descendantIds(key)
      list = all.filter((b) => ids.has(b.categoryId))
    }
  }

  // 按窗独立：状态筛选
  if (pane.value.statusFilter && pane.value.statusFilter !== 'all') {
    list = list.filter((b) => (b.status || 'unknown') === pane.value.statusFilter)
  }
  // 按窗独立：阅读状态
  if (pane.value.readFilter) {
    list = list.filter((b) => (b.readStatus || 'unread') === pane.value.readFilter)
  }
  // 按窗独立：标签筛选
  if (pane.value.tagFilter) {
    list = list.filter((b) => (b.tags || []).includes(pane.value.tagFilter))
  }
  // 按窗独立：搜索（标题/URL/标签/描述/备注）
  const q = (pane.value.search || '').trim().toLowerCase()
  if (q) {
    list = list.filter((b) =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.url || '').toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q) ||
      (b.notes || '').toLowerCase().includes(q) ||
      (b.tags || []).some((t) => t.toLowerCase().includes(q))
    )
  }

  // 按窗独立：排序（置顶始终在最前）
  const dir = pane.value.sortOrder === 'asc' ? 1 : -1
  list = [...list].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    if (pane.value.sortBy === 'custom') {
      return (a.order || 0) - (b.order || 0)
    }
    if (pane.value.sortBy === 'title') {
      return dir * (a.title || '').localeCompare(b.title || '', 'zh-CN')
    }
    if (pane.value.sortBy === 'status') {
      const wa = STATUS_ORDER[a.status || 'unknown'] ?? 2
      const wb = STATUS_ORDER[b.status || 'unknown'] ?? 2
      return dir * (wa - wb)
    }
    if (pane.value.sortBy === 'url') {
      return dir * (a.url || '').localeCompare(b.url || '')
    }
    if (pane.value.sortBy === 'frequency') {
      return dir * ((a.openCount || 0) - (b.openCount || 0)) ||
             dir * ((a.lastOpenedAt || 0) - (b.lastOpenedAt || 0))
    }
    // 默认 addedAt
    return dir * ((a.addedAt || 0) - (b.addedAt || 0))
  })

  return list
})

const groupedList = computed(() => {
  if (props.side === 'right') {
    const list = filteredBookmarks.value
    return [{ key: 'root', label: '', items: list }]
  }
  // 左侧：未分类/所有/分类视图
  const key = selectedKey.value
  if (key === 'unclassified' || !key || key === 'all') {
    return [{ key: 'root', label: '', items: filteredBookmarks.value }]
  }
  // 选中某个分类时按子分类分组显示
  const ids = cats.descendantIds(key)
  const subs = cats.categories.filter((c) => c.parentId === key && ids.has(c.id))
  const list = filteredBookmarks.value
  const direct = list.filter((b) => b.categoryId === key)
  const groups = []
  if (direct.length > 0) {
    groups.push({ key: key, label: '📁 直接归属', items: direct })
  }
  for (const sub of subs) {
    const items = list.filter((b) => b.categoryId === sub.id)
    if (items.length > 0) {
      groups.push({ key: sub.id, label: `${sub.icon || '📁'} ${sub.name}`, items })
    }
  }
  // 其他（含子分类下更深层的聚合）
  const accounted = new Set(direct.concat(...subs.map((s) => list.filter((b) => b.categoryId === s.id))).map((b) => b.id))
  const others = list.filter((b) => !accounted.has(b.id))
  if (others.length > 0) {
    groups.push({ key: 'descendants', label: '🌿 子分类聚合', items: others })
  }
  if (groups.length === 0) {
    groups.push({ key: 'root', label: '', items: [] })
  }
  return groups
})

const headerSubtitle = computed(() => {
  const key = selectedKey.value
  const total = filteredBookmarks.value.length
  if (props.side === 'left') {
    if (key === 'all') return `所有书签 · 显示 ${total} 条`
    if (!key || key === 'unclassified') {
      const n = bm.bookmarks.filter((b) => !b.recycled && !b.archived && !b.categoryId).length
      return `未分类 · 显示 ${total}/${n} 条`
    }
    const c = cats.byId[key]
    return c ? `${c.name} · 显示 ${total} 条` : `共 0 条`
  } else {
    if (!key) return '请选择右侧文件夹'
    const c = cats.byId[key]
    return c ? `${c.name} · 显示 ${total} 条` : `共 0 条`
  }
})

// ---- 拖拽处理 ----
function handleDropBookmark(bookmarkId, categoryId) {
  if (props.side === 'right' && categoryId) {
    bm.moveToCategory(bookmarkId, categoryId, { manual: true })
    const c = cats.byId[categoryId]
    if (window.$toast && c) window.$toast(`已移至「${c.name}」`, 'success')
  } else if (props.side === 'left') {
    if (categoryId && categoryId !== 'all' && categoryId !== 'unclassified') {
      bm.moveToCategory(bookmarkId, categoryId, { manual: true })
      const c = cats.byId[categoryId]
      if (window.$toast && c) window.$toast(`已移至「${c.name}」`, 'success')
    } else {
      bm.moveToCategory(bookmarkId, null, { manual: true })
      if (window.$toast) window.$toast('已移回未分类', 'success')
    }
  }
}

// 右键菜单中的"新建文件夹"由 HomeView 的 newFolderDialog 处理——但 OrganizerPane 顶栏也有"新建文件夹"按钮，需要补一个
function ensureExpandedForNode(nodeId) {
  // 把 nodeId 自身 + 所有祖先 id 加入 expandedIds
  const tree = cats.tree?.value || cats.tree || []
  function findAncestors(nodes, target, path = []) {
    for (const n of nodes) {
      const nextPath = [...path, n.id]
      if (n.id === target) return nextPath
      const r = findAncestors(n.children || [], target, nextPath)
      if (r) return r
    }
    return null
  }
  const ancestors = findAncestors(tree, nodeId) || [nodeId]
  const set = new Set(treeExpandedIds.value)
  for (const id of ancestors) set.add(id)
  if (props.side === 'left') viewState.organizer.leftExpandedIds = [...set]
  else viewState.organizer.rightExpandedIds = [...set]
}
function handleDropCategory(categoryId, newParentId) {
  if (!categoryId || !newParentId || categoryId === newParentId) return
  // 左窗分类树只读，不允许拖动
  if (props.side === 'left') {
    if (window.$toast) window.$toast('已导入分类为只读，请在右窗手动整理', 'warn')
    return
  }
  if (cats.isAncestor(categoryId, newParentId)) {
    if (window.$toast) window.$toast('不能将文件夹移入其子文件夹', 'warn')
    return
  }
  cats.update(categoryId, { parentId: newParentId })
}

const listDragOver = ref(false)
const dropDisallowed = ref(false)
function onListDragOver(e) {
  const types = e.dataTransfer?.types || []
  const hasBm = types.includes('text/bookmark-id')
  const hasCat = types.includes('text/category-id')
  if (!hasBm && !hasCat) return
  // 右窗空白：当前打开（选中）了一个文件夹时接受 drop
  // 否则视为不允许（提示用户先选中），但仍允许以"提示"形式 drop
  if (props.side === 'right' && !selectedKey.value && hasBm) {
    e.dataTransfer.dropEffect = 'move'
    listDragOver.value = true
    dropDisallowed.value = true
    return
  }
  // 左窗空白：仅当拖的是书签且有选中分类时接受（移到当前分类）
  if (props.side === 'left' && !selectedKey.value && hasBm) {
    e.dataTransfer.dropEffect = 'move'
    listDragOver.value = true
    dropDisallowed.value = true
    return
  }
  e.dataTransfer.dropEffect = 'move'
  listDragOver.value = true
  dropDisallowed.value = false
}
function onListDragLeave() {
  listDragOver.value = false
  dropDisallowed.value = false
}
function onListDrop(e) {
  listDragOver.value = false
  dropDisallowed.value = false
  // 优先取整批选中（支持批量拖动）；否则拖单条
  const bmIds = new Set(bm.selected || [])
  const singleBmId = e.dataTransfer.getData('text/bookmark-id') || window.__dragBookmarkId
  window.__dragBookmarkId = null
  if (singleBmId) bmIds.add(singleBmId)
  const catId = e.dataTransfer.getData('text/category-id')

  if (bmIds.size > 0) {
    let targetKey = selectedKey.value
    // 右窗没选中分类：自动选右窗第一个手动分类作为目标（不阻断用户拖动）
    if (props.side === 'right' && (!targetKey || targetKey === 'all' || targetKey === 'unclassified' || targetKey.startsWith('smart:'))) {
      const firstManual = cats.manualTree?.value?.[0] || cats.manualTree?.[0]
      if (firstManual) {
        targetKey = firstManual.id
        viewState.selectRight(targetKey)
      }
    }
    if (!targetKey) {
      if (window.$toast) window.$toast('请先在右侧选中目标文件夹再拖入', 'warn')
      return
    }
    // 右窗拖入目标确认是真实分类
    if (props.side === 'right' && (targetKey === 'all' || targetKey === 'unclassified' || targetKey.startsWith('smart:'))) {
      if (window.$toast) window.$toast('请在右窗先选中具体文件夹再拖入', 'warn')
      return
    }
    const ids = [...bmIds]
    bm.moveBatchToCategory(ids, targetKey, { manual: true }).then((n) => {
      const c = cats.byId[targetKey]
      const name = c?.name || '当前文件夹'
      if (window.$toast) window.$toast(n > 1 ? `已批量移入「${name}」（${n} 项）` : `已移至「${name}」`, 'success')
    })
    return
  }
  // 拖文件夹：右窗把文件夹移入当前打开的文件夹内部
  if (catId && props.side === 'right' && selectedKey.value) {
    handleDropCategory(catId, selectedKey.value)
  }
}

// ---- 卡片排序（重排序在本分栏当前列表内） ----
function onCardReorder({ dragId, dropId }) {
  const list = filteredBookmarks.value
  const dragIdx = list.findIndex((b) => b.id === dragId)
  const dropIdx = list.findIndex((b) => b.id === dropId)
  if (dragIdx === -1 || dropIdx === -1) return
  const ids = list.map((b) => b.id)
  const next = [...ids]
  next.splice(dragIdx, 1)
  next.splice(dropIdx, 0, ids[dragIdx])
  const orders = next.map((id, i) => ({ id, order: i }))
  bm.reorder(orders)
}

// ---- 上下文菜单 ----
const contextMenu = ref({ visible: false, x: 0, y: 0, node: null })
const renameDialog = ref({ visible: false, node: null, name: '' })

const contextMenuItems = computed(() => {
  const node = contextMenu.value.node
  if (!node) return []

  // 左窗分类节点：只读，不允许新建/重命名/复制/删除，仅"查看该文件夹"
  if (props.side === 'left') {
    return [
      { type: 'heading', label: node.name },
      { id: 'select', label: '查看该文件夹', icon: '▸', action: () => { selectKey(node.id); closeContextMenu() } },
      { type: 'separator' },
      { id: 'expand-all', label: '全部展开', icon: '▾', action: () => { expandAll(); closeContextMenu() } },
      { id: 'collapse-all', label: '全部折叠', icon: '▸', action: () => { collapseAll(); closeContextMenu() } }
    ]
  }

  // 右窗：完整 CRUD
  const items = []
  items.push({ type: 'heading', label: node.name })
  items.push({ id: 'select', label: '查看该文件夹', icon: '▸', action: () => { selectKey(node.id); closeContextMenu() } })
  items.push({ id: 'new-child', label: '新建子文件夹', icon: '＋', action: async () => {
      const created = await cats.add({ name: '新文件夹', parentId: node.id, origin: 'manual' })
      ensureExpandedForNode(created.id)
      selectKey(created.id)
      closeContextMenu()
      if (window.$toast) window.$toast('已新建子文件夹', 'success')
    }
  })
  items.push({ type: 'separator' })
  items.push({ id: 'rename', label: '重命名', icon: '✎', action: () => { renameDialog.value = { visible: true, node, name: node.name }; closeContextMenu() } })
  items.push({ id: 'duplicate', label: '复制文件夹', icon: '⧉', action: async () => { const c = await cats.add({ name: node.name + ' (副本)', icon: node.icon, color: node.color, parentId: node.parentId, tags: [...(node.tags || [])], origin: 'manual' }); ensureExpandedForNode(c.id); closeContextMenu(); if (window.$toast) window.$toast('已复制', 'success') } })
  items.push({ type: 'separator' })
  items.push({ id: 'manage', label: '打开分类管理', icon: '⚙', action: () => { closeContextMenu(); emit('manage-categories') } })
  items.push({ type: 'separator' })
  items.push({ id: 'delete', label: '删除文件夹', icon: '✕', danger: true, action: () => confirmDelete(node) })
  return items
})

function openContextMenu(node, e) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, node }
  selectKey(node.id)
}
function closeContextMenu() { contextMenu.value.visible = false }
function onMenuSelect(item) {
  if (typeof item.action === 'function') item.action()
}
function openSurfaceMenu(e) {
  if (e.target?.closest('[data-bookmark-card]')) return
  emit('surface-menu', e)
}

// 左窗右键分类树：左窗只读，仅有"查看"操作
function openLeftTreeContextMenu(node, e) {
  if (!node || node._divider) return
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, node }
}

// 新建文件夹功能已从 OrganizerPane 顶栏移除，集中在分类管理弹窗 / 右键菜单

async function confirmDelete(node) {
  closeContextMenu()
  if (!window.confirm(`删除文件夹「${node.name}」？\n该文件夹下的书签将变为「未分类」。`)) return
  await cats.remove(node.id)
  for (const b of bm.bookmarks) {
    if (b.categoryId === node.id || b.manualCategoryId === node.id) {
      bm.update(b.id, { categoryId: null, manualCategoryId: null, manualSet: false }).catch(() => {})
    }
  }
  if (selectedKey.value === node.id) selectKey('')
  if (window.$toast) window.$toast('已删除', 'info')
}

function commitRename() {
  const { node, name } = renameDialog.value
  if (name && name.trim() && node && name.trim() !== node.name) {
    cats.update(node.id, { name: name.trim() })
    if (window.$toast) window.$toast('已重命名', 'success')
  }
  renameDialog.value.visible = false
}

// ---- 全部展开（按当前窗 side） ----
function expandAll() {
  const ids = []
  function walk(nodes) {
    for (const n of nodes) {
      ids.push(n.id)
      if (n.children?.length) walk(n.children)
    }
  }
  // 左窗展开的是导入树，右窗展开的是手动树
  const src = props.side === 'left' ? (cats.importedTree?.value || cats.importedTree || []) : (cats.manualTree?.value || cats.manualTree || [])
  walk(src)
  viewState.setExpandedIds(props.side, ids)
}

// ---- 把虚拟根 + 所有一级根节点写入 expandedIds（默认常驻展开） ----
// 监听真实分类数变化（手动建文件夹/导入后回流），自动补回虚拟根与缺省的一级展开。
watch(treeNodesFlat, () => {
  ensureRootExpanded()
}, { immediate: true })

// ---- 全部折叠 ----
function collapseAll() {
  viewState.setExpandedIds(props.side, [])
}

// ---- 当前选中的文件夹节点（仅右窗导出按钮用） ----
const currentCategoryNode = computed(() => {
  const key = selectedKey.value
  if (!key || key === 'all' || key === 'unclassified' || key.startsWith('smart:')) return null
  return cats.byId[key] || null
})

// ---- 导出当前文件夹 ----
async function exportCurrentFolder() {
  const node = currentCategoryNode.value
  if (!node) return
  try {
    const r = await window.api.invoke('io:exportCategory', node.id)
    if (r && r.exported) {
      if (window.$toast) window.$toast(`已导出「${node.name}」(${r.count}个书签)`, 'success')
    } else if (r && !r.canceled) {
      if (window.$toast) window.$toast('导出失败: ' + (r.error || ''), 'warn')
    }
  } catch (e) {
    if (window.$toast) window.$toast('导出失败: ' + (e.message || e), 'error')
  }
}

// Ctrl+K / Ctrl+F 聚焦本窗搜索框
function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    // Ctrl+K 全局：仅在 HomeView 顶层还有该绑定时生效；这里不抢
  }
}

onUnmounted(() => {
  document.removeEventListener('click', closeTagFilter)
  window.removeEventListener('keydown', onKeydown)
})
</script>
