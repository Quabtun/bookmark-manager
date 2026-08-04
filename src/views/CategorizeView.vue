<template>
  <div class="h-screen flex flex-col bg-theme">
    <!-- 顶栏 -->
    <div class="px-5 py-3 glass border-b border-white/30 dark:border-slate-700/50 flex items-center gap-3 shrink-0">
      <router-link to="/" custom v-slot="{ navigate }">
        <button @click="navigate" class="btn-ghost">← 返回</button>
      </router-link>
      <h2 class="text-lg font-semibold">🗂️ 书签分类工作台</h2>
      <span class="text-xs text-slate-400 ml-auto">{{ bm.bookmarks.length }} 个书签 · {{ cats.categories.length }} 个分类</span>
    </div>

    <!-- 步骤条 -->
    <div class="px-5 py-2.5 flex items-center gap-1 glass border-b border-white/30 dark:border-slate-700/50 shrink-0">
      <button v-for="(s, i) in steps" :key="s.key"
              @click="step = s.key"
              :class="['flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition',
                       step === s.key ? 'bg-accent text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50']">
        <span :class="['w-5 h-5 rounded-full flex items-center justify-center text-xs',
                        step === s.key ? 'bg-white/30' : 'bg-slate-200 dark:bg-slate-600']">{{ i + 1 }}</span>
        <span>{{ s.icon }} {{ s.label }}</span>
      </button>
      <span v-if="step === 2" class="text-[11px] text-slate-400 ml-auto">提示：拖拽书签到左侧分类可快速分类</span>
    </div>

    <!-- ============ 步骤1: 导入书签 ============ -->
    <div v-show="step === 1" class="flex-1 overflow-y-auto p-6">
      <div class="max-w-3xl mx-auto space-y-5">
        <!-- 浏览器导入 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-1">🌐 从浏览器导入</h3>
          <p class="text-xs text-slate-400 mb-4">自动检测已安装的浏览器，一键导入书签</p>
          <div v-if="detectedBrowsers.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button v-for="b in detectedBrowsers" :key="b.path"
                    @click="doImport('browser', b)"
                    :disabled="ioLoading"
                    class="flex items-start gap-3 rounded-xl p-4 border border-slate-200/50 dark:border-slate-700/50 hover:border-accent hover:shadow-md transition text-left group disabled:opacity-50">
              <span class="text-2xl">{{ browserIcon(b.name) }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium group-hover:text-accent">从 {{ b.name }} 导入</div>
                <div class="text-xs text-slate-400 mt-0.5 truncate">{{ b.path }}</div>
              </div>
            </button>
          </div>
          <div v-else class="text-sm text-slate-400 py-4 text-center">未检测到已安装的浏览器</div>
        </section>

        <!-- 文件导入 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-1">📄 从文件导入</h3>
          <p class="text-xs text-slate-400 mb-4">支持多种格式的书签文件</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button @click="doImport('html')" :disabled="ioLoading"
                    class="io-card group">
              <span class="text-2xl">🌐</span>
              <div class="flex-1"><div class="text-sm font-medium group-hover:text-accent">书签 HTML 文件</div><div class="text-xs text-slate-400 mt-0.5">浏览器导出的标准 HTML</div></div>
            </button>
            <button @click="doImport('json')" :disabled="ioLoading"
                    class="io-card">
              <span class="text-2xl">💾</span>
              <div class="flex-1"><div class="text-sm font-medium group-hover:text-accent">JSON 备份</div><div class="text-xs text-slate-400 mt-0.5">从本应用导出的备份</div></div>
            </button>
            <button @click="doImport('csv')" :disabled="ioLoading"
                    class="io-card">
              <span class="text-2xl">📊</span>
              <div class="flex-1"><div class="text-sm font-medium group-hover:text-accent">CSV 文件</div><div class="text-xs text-slate-400 mt-0.5">含 url 列的 CSV</div></div>
            </button>
            <button @click="doImport('pocket')" :disabled="ioLoading"
                    class="io-card">
              <span class="text-2xl">🔖</span>
              <div class="flex-1"><div class="text-sm font-medium group-hover:text-accent">Pocket CSV</div><div class="text-xs text-slate-400 mt-0.5">Pocket 导出的 CSV</div></div>
            </button>
          </div>
        </section>

        <!-- 导入结果 -->
        <section v-if="importResult" class="glass rounded-2xl p-5">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-2xl">✅</span>
            <div>
              <div class="font-medium">导入成功</div>
              <div class="text-xs text-slate-400">从 {{ importResult.source }} 导入了 {{ importResult.imported }} 个书签</div>
            </div>
          </div>
          <button @click="step = 2" class="btn-accent text-sm">下一步：分类整理 →</button>
        </section>

        <div v-if="bm.bookmarks.length > 0 && !importResult" class="text-center">
          <button @click="step = 2" class="btn-ghost text-sm">已有 {{ bm.bookmarks.length }} 个书签，跳到分类整理 →</button>
        </div>
      </div>
    </div>

    <!-- ============ 步骤2: 分类整理 ============ -->
    <div v-show="step === 2" class="flex-1 flex min-h-0">
      <!-- 左侧：分类管理 -->
      <div class="w-80 shrink-0 glass border-r border-white/30 dark:border-slate-700/50 flex flex-col">
        <!-- 分类操作工具条 -->
        <div class="p-3 border-b border-slate-200/30 dark:border-slate-700/50 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-500">分类管理</span>
            <button @click="onNewCategory" class="ml-auto text-xs text-accent hover:underline">＋ 新建</button>
          </div>
          <div class="flex items-center gap-1.5">
            <button @click="saveCategoryState" class="btn-ghost text-xs py-1 px-2 flex-1 justify-center" title="保存当前所有书签的分类状态">📸 存状态</button>
            <button @click="showSnapshots = !showSnapshots" class="btn-ghost text-xs py-1 px-2 flex-1 justify-center" title="恢复分类状态">🔄 恢复</button>
          </div>
        </div>

        <!-- 快照列表 -->
        <div v-if="showSnapshots" class="p-2 border-b border-slate-200/30 dark:border-slate-700/50 max-h-48 overflow-y-auto">
          <div class="text-[10px] text-slate-400 mb-1 px-1">分类状态快照</div>
          <div v-if="snapshots.length === 0" class="text-xs text-slate-400 text-center py-2">暂无快照</div>
          <div v-for="snap in snapshots" :key="snap.id"
               class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 text-xs">
            <span class="flex-1 truncate">{{ snap.name }}</span>
            <span class="text-[10px] text-slate-400">{{ snap.count }}项</span>
            <button @click="restoreCategoryState(snap.id)" class="text-accent hover:underline" title="恢复">恢复</button>
            <button @click="deleteSnapshot(snap.id)" class="text-red-400 hover:text-red-600" title="删除">✕</button>
          </div>
        </div>

        <!-- 分类列表 -->
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <!-- 全部 / 未分类 -->
          <button @click="selectedCatId = 'all'"
                  :class="catRowClass('all')">
            <span>📑</span><span class="flex-1 text-left">全部书签</span>
            <span class="text-[10px] opacity-70">{{ bm.bookmarks.filter(b => !b.recycled && !b.archived).length }}</span>
          </button>
          <button @click="selectedCatId = 'unclassified'"
                  :class="catRowClass('unclassified')">
            <span>❓</span><span class="flex-1 text-left">未分类</span>
            <span class="text-[10px] opacity-70">{{ unclassifiedCount }}</span>
          </button>
          <div class="h-px bg-slate-200/50 dark:bg-slate-700/50 my-1"></div>

          <!-- 自定义分类 -->
          <div v-for="c in cats.sorted" :key="c.id">
            <!-- 分类行 -->
            <div @dragover.prevent="dragOverCat = c.id"
                 @dragleave="dragOverCat = null"
                 @drop="onDropToCat($event, c.id)"
                 :class="[catRowClass(c.id), dragOverCat === c.id ? 'ring-2 ring-accent' : '']"
                 @click="selectedCatId = c.id; expandedCat = expandedCat === c.id ? null : c.id">
              <span class="cursor-pointer" @click.stop="expandedCat = expandedCat === c.id ? null : c.id">
                {{ expandedCat === c.id ? '▾' : '▸' }}
              </span>
              <span>{{ c.icon || '📁' }}</span>
              <span class="flex-1 text-left truncate">{{ c.name }}</span>
              <span class="text-[10px] opacity-70">{{ catCount(c.id) }}</span>
            </div>

            <!-- 展开编辑区 -->
            <div v-if="expandedCat === c.id" class="ml-4 mr-1 mt-1 mb-2 rounded-lg bg-slate-50 dark:bg-slate-700/30 p-2.5 space-y-2">
              <!-- 图标/名称/颜色 -->
              <div class="flex items-center gap-1.5">
                <input v-model="c.icon" @change="onCatUpdate(c)" class="w-7 text-center text-sm bg-white dark:bg-slate-700 rounded outline-none py-0.5" maxlength="2" />
                <input v-model="c.name" @change="onCatUpdate(c)" class="flex-1 text-xs bg-white dark:bg-slate-700 rounded px-1.5 py-0.5 outline-none" />
                <input v-model="c.color" type="color" @change="onCatUpdate(c)" class="w-6 h-6 rounded cursor-pointer bg-transparent border-0" />
              </div>
              <!-- 标签管理 -->
              <div class="flex flex-wrap items-center gap-1">
                <span v-for="(t, ti) in (c.tags || [])" :key="ti"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium chip-accent">
                  {{ t }}
                  <button @click.stop="removeCatTag(c, ti)" class="hover:text-red-500 leading-none">×</button>
                </span>
                <input :ref="el => tagInputs[c.id] = el"
                       v-model="tagInputVals[c.id]"
                       @keydown.enter.prevent="addCatTag(c)"
                       @keydown.,.prevent="addCatTag(c)"
                       @click.stop
                       class="w-14 bg-transparent outline-none text-[10px] py-0.5 text-slate-400"
                       placeholder="+标签" />
              </div>
              <!-- 操作按钮 -->
              <div class="flex items-center gap-1 pt-1">
                <button @click.stop="mirrorCategory(c)" class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50" title="镜像此分类">📋 镜像</button>
                <button @click.stop="exportCategory(c)" class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50" title="导出此分类">📤 导出</button>
                <button @click.stop="deleteCategory(c)" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200 dark:hover:bg-red-900/50 ml-auto" title="删除分类">🗑️ 删除</button>
              </div>
            </div>
          </div>
          <button @click="onNewCategory" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-700/50 transition mt-1">
            <span>＋</span><span>新建分类</span>
          </button>
        </div>
      </div>

      <!-- 右侧：书签列表 -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- 工具条 -->
        <div class="px-4 py-2.5 flex items-center gap-2 border-b border-slate-200/30 dark:border-slate-700/50 flex-wrap">
          <input v-model="searchQ" placeholder="搜索书签…" class="input text-sm flex-1 max-w-xs" />
          <select v-model="statusFilter" class="input w-auto text-sm">
            <option value="all">全部状态</option>
            <option value="ok">✅ 正常</option>
            <option value="warn">⚠️ 异常</option>
            <option value="dead">💀 失效</option>
            <option value="unknown">❓ 未知</option>
          </select>
          <span v-if="selectedIds.size > 0" class="text-xs text-accent font-medium">已选 {{ selectedIds.size }} 项</span>
          <select v-if="selectedIds.size > 0" v-model="batchCatId" @change="doBatchMove" class="input w-auto text-sm">
            <option value="">批量分配到…</option>
            <option value="__unclassified__">未分类</option>
            <option v-for="c in cats.sorted" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
          </select>
          <button v-if="selectedIds.size > 0" @click="selectedIds = new Set()" class="btn-ghost text-xs py-0.5">取消选择</button>
        </div>

        <!-- 书签列表 -->
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="filteredList.length === 0" class="h-full flex flex-col items-center justify-center text-slate-400">
            <div class="text-5xl mb-3">📭</div>
            <div class="text-sm">{{ bm.bookmarks.length === 0 ? '还没有书签，请先导入' : '没有匹配的书签' }}</div>
            <button v-if="bm.bookmarks.length === 0" @click="step = 1" class="btn-primary mt-4 text-sm">去导入书签</button>
          </div>
          <div class="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            <div v-for="b in filteredList" :key="b.id"
                 draggable="true"
                 @dragstart="onDragStart($event, b.id)"
                 @dragend="onDragEnd"
                 @click.stop="toggleSelect(b.id)"
                 :class="['glass rounded-xl p-3 border cursor-pointer transition-all duration-150 hover:shadow-card',
                          selectedIds.has(b.id) ? 'ring-2 ring-accent border-accent' : 'border-white/40 dark:border-slate-700/50 hover:border-brand-300']">
              <div class="flex items-start gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center shrink-0 shadow-sm ring-1 ring-black/5 overflow-hidden">
                  <img v-if="b.favicon && faviconUrls.get(b.favicon)" :src="faviconUrls.get(b.favicon)" class="w-5 h-5 object-contain" @error="$event.target.style.display='none'" />
                  <span v-else class="text-sm font-semibold" :style="{ color: letterColor(b.title || b.url) }">{{ letter(b.title || b.url) }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate" :title="b.title">{{ b.title || b.url }}</div>
                  <div class="text-xs text-slate-400 truncate">{{ host(b.url) }}</div>
                </div>
                <span :class="['w-2 h-2 rounded-full shrink-0 mt-1', statusDotClass(b.status)]" :title="statusText(b.status)"></span>
              </div>
              <div class="mt-2 flex items-center gap-1.5">
                <select :value="b.categoryId || ''"
                        @click.stop
                        @change="onCatChange(b.id, $event.target.value)"
                        class="input text-xs py-0.5 px-1.5 flex-1">
                  <option value="">未分类</option>
                  <option v-for="c in cats.sorted" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
                </select>
                <button @click.stop="cycleReadStatus(b.id)"
                        :class="['text-xs px-1.5 py-0.5 rounded transition', readStatusClass(b.readStatus)]"
                        :title="'阅读: ' + readStatusText(b.readStatus)">
                  {{ readStatusIcon(b.readStatus) }}
                </button>
                <button @click.stop="bm.togglePin(b.id)"
                        :class="['text-xs px-1.5 py-0.5 rounded transition',
                                 b.pinned ? 'text-amber-500 bg-amber-100 dark:bg-amber-900/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700']"
                        :title="b.pinned ? '取消置顶' : '置顶'">
                  {{ b.pinned ? '⭐' : '☆' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部：下一步 -->
        <div class="px-4 py-2 border-t border-slate-200/30 dark:border-slate-700/50 flex items-center justify-between">
          <span class="text-xs text-slate-400">{{ filteredList.length }} 个书签显示中</span>
          <button @click="step = 3" class="btn-accent text-sm">下一步：导出到浏览器 →</button>
        </div>
      </div>
    </div>

    <!-- ============ 步骤3: 导出到浏览器 ============ -->
    <div v-show="step === 3" class="flex-1 overflow-y-auto p-6">
      <div class="max-w-3xl mx-auto space-y-5">
        <!-- 导出单个分类 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-1">📁 导出单个分类</h3>
          <p class="text-xs text-slate-400 mb-4">选择一个分类，导出为浏览器可导入的 HTML 文件（含子分类文件夹）</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button v-for="c in cats.sorted" :key="c.id"
                    @click="exportCategory(c)"
                    :disabled="catCount(c.id) === 0"
                    class="flex items-center gap-2 rounded-lg p-2.5 border border-slate-200/50 dark:border-slate-700/50 hover:border-accent transition text-left disabled:opacity-40">
              <span>{{ c.icon || '📁' }}</span>
              <span class="flex-1 text-sm truncate">{{ c.name }}</span>
              <span class="text-xs text-slate-400">{{ catCount(c.id) }} 个</span>
              <span class="text-xs text-accent">导出</span>
            </button>
          </div>
        </section>

        <!-- 导出全部 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-1">📤 导出全部书签</h3>
          <p class="text-xs text-slate-400 mb-4">将所有书签导出为多种格式</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button @click="exportHtml" class="io-card">
              <span class="text-2xl">🌐</span>
              <div class="flex-1"><div class="text-sm font-medium group-hover:text-accent">Chrome 书签 HTML</div><div class="text-xs text-slate-400 mt-0.5">标准格式，可导入所有浏览器</div></div>
            </button>
            <button @click="exportStyledHtml" class="io-card">
              <span class="text-2xl">🎨</span>
              <div class="flex-1"><div class="text-sm font-medium group-hover:text-accent">带样式网页</div><div class="text-xs text-slate-400 mt-0.5">可视化书签页面</div></div>
            </button>
            <button @click="exportJson" class="io-card">
              <span class="text-2xl">💾</span>
              <div class="flex-1"><div class="text-sm font-medium group-hover:text-accent">JSON 备份</div><div class="text-xs text-slate-400 mt-0.5">完整数据备份</div></div>
            </button>
            <button @click="exportMarkdown" class="io-card">
              <span class="text-2xl">📝</span>
              <div class="flex-1"><div class="text-sm font-medium group-hover:text-accent">Markdown</div><div class="text-xs text-slate-400 mt-0.5">按分类组织的文档</div></div>
            </button>
          </div>
        </section>

        <!-- 导入到浏览器指引 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-1">🔌 导入到浏览器</h3>
          <p class="text-xs text-slate-400 mb-4">将导出的 HTML 文件导入到浏览器</p>
          <div class="space-y-3">
            <div class="step-item"><span class="step-num">1</span><span class="text-sm">点击上方「Chrome 书签 HTML」或单个分类的「导出」，生成 HTML 文件</span></div>
            <div class="step-item">
              <span class="step-num">2</span>
              <div class="text-sm flex-1">
                <span>在浏览器书签管理器中选择「导入书签」</span>
                <div class="mt-1.5 flex flex-wrap gap-2">
                  <button @click="openUrl('chrome://bookmarks')" class="chip text-xs hover:ring-1 hover:ring-accent">Chrome</button>
                  <button @click="openUrl('edge://favorites')" class="chip text-xs hover:ring-1 hover:ring-accent">Edge</button>
                  <button @click="openUrl('about:bookmarks')" class="chip text-xs hover:ring-1 hover:ring-accent">Firefox</button>
                </div>
              </div>
            </div>
            <div class="step-item"><span class="step-num">3</span><span class="text-sm">选择导出的 HTML 文件，浏览器将自动导入所有书签和分类文件夹</span></div>
          </div>
        </section>

        <div class="text-center pt-2">
          <button @click="step = 2" class="btn-ghost text-sm">← 返回分类整理</button>
        </div>
      </div>
    </div>

    <!-- 镜像分类弹窗 -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="mirrorDialog.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="mirrorDialog.visible = false">
          <div class="w-full max-w-md glass rounded-2xl shadow-glass p-5 animate-slide-up">
            <h3 class="text-lg font-semibold mb-1">📋 镜像分类</h3>
            <p class="text-xs text-slate-400 mb-4">将「{{ mirrorDialog.sourceName }}」镜像到新分类，可选择是否同时复制书签</p>
            <div class="space-y-3">
              <div>
                <label class="block text-xs text-slate-500 mb-1">新分类名称</label>
                <input v-model="mirrorDialog.name" class="input text-sm w-full" />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">镜像到目标分类（留空则创建新分类）</label>
                <select v-model="mirrorDialog.targetId" class="input text-sm w-full">
                  <option value="">创建新分类</option>
                  <option v-for="c in cats.sorted.filter(c => c.id !== mirrorDialog.sourceId)" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
                </select>
              </div>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" v-model="mirrorDialog.copyBookmarks" class="rounded" />
                <span>同时复制书签到目标分类（源分类书签会被移动）</span>
              </label>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button @click="mirrorDialog.visible = false" class="btn-ghost">取消</button>
              <button @click="doMirror" class="btn-accent">镜像</button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- 加载遮罩 -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="ioLoading" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div class="glass rounded-2xl px-6 py-4 flex items-center gap-3">
            <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            <span class="text-sm">{{ ioLoadingText }}</span>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- 结果弹窗 -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="resultDialog.visible" class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="resultDialog.visible = false">
          <div class="w-full max-w-md glass rounded-2xl shadow-glass p-5 animate-slide-up">
            <div class="text-center mb-3">
              <div class="text-4xl mb-2">{{ resultDialog.icon }}</div>
              <h3 class="text-lg font-semibold">{{ resultDialog.title }}</h3>
            </div>
            <div class="text-sm text-slate-600 dark:text-slate-300 text-center space-y-1">
              <p>{{ resultDialog.message }}</p>
              <p v-for="d in resultDialog.details" :key="d" class="text-xs text-slate-400">{{ d }}</p>
            </div>
            <button @click="resultDialog.visible = false" class="btn-accent w-full mt-4 justify-center">确定</button>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { useBookmarksStore } from '../stores/bookmarks.js'
import { useCategoriesStore } from '../stores/categories.js'
import { useUiStore } from '../stores/ui.js'

const bm = useBookmarksStore()
const cats = useCategoriesStore()
const ui = useUiStore()

// ---- 步骤 ----
const steps = [
  { key: 1, label: '导入书签', icon: '📥' },
  { key: 2, label: '分类整理', icon: '🗂️' },
  { key: 3, label: '导出到浏览器', icon: '📤' }
]
const step = ref(1)

// ---- favicon 缓存 ----
const faviconUrls = ref(new Map())
async function loadFavicons(list) {
  for (const b of list) {
    if (b.favicon && !faviconUrls.value.has(b.favicon)) {
      const url = await ui.getFavicon(b.favicon)
      if (url) {
        const m = new Map(faviconUrls.value)
        m.set(b.favicon, url)
        faviconUrls.value = m
      }
    }
  }
}

// ---- 分类管理 ----
const selectedCatId = ref('all')
const expandedCat = ref(null)
const dragOverCat = ref(null)
const searchQ = ref('')
const statusFilter = ref('all')
const selectedIds = ref(new Set())
const batchCatId = ref('')
const tagInputs = ref({})
const tagInputVals = ref({})

const unclassifiedCount = computed(() => bm.bookmarks.filter(b => !b.categoryId && !b.recycled && !b.archived).length)

function catCount(catId) {
  return bm.bookmarks.filter(b => b.categoryId === catId && !b.recycled && !b.archived).length
}

function catRowClass(id) {
  return ['w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition cursor-pointer',
          selectedCatId.value === id ? 'bg-accent text-white' : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50']
}

const filteredList = computed(() => {
  let list = bm.bookmarks.filter(b => !b.recycled && !b.archived)
  if (selectedCatId.value === 'unclassified') {
    list = list.filter(b => !b.categoryId)
  } else if (selectedCatId.value !== 'all') {
    list = list.filter(b => b.categoryId === selectedCatId.value)
  }
  if (statusFilter.value !== 'all') {
    list = list.filter(b => (b.status || 'unknown') === statusFilter.value)
  }
  const q = searchQ.value.trim().toLowerCase()
  if (q) {
    list = list.filter(b =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.url || '').toLowerCase().includes(q) ||
      (b.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }
  return [...list].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return (b.addedAt || 0) - (a.addedAt || 0)
  })
})
watch(filteredList, (list) => loadFavicons(list.slice(0, 30)), { immediate: true })

function toggleSelect(id) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function onDragStart(e, id) {
  e.dataTransfer.setData('text/bookmark-id', id)
  e.dataTransfer.effectAllowed = 'move'
  window.__dragBookmarkId = id
}
function onDragEnd() {
  dragOverCat.value = null
  window.__dragBookmarkId = null
}
function onDropToCat(e, catId) {
  e.preventDefault()
  dragOverCat.value = null
  const bmId = e.dataTransfer.getData('text/bookmark-id') || window.__dragBookmarkId
  window.__dragBookmarkId = null
  if (bmId) {
    bm.moveToCategory(bmId, catId, { manual: true })
    window.$toast('已移动到分类', 'success')
  }
}

async function onCatChange(id, catId) {
  await bm.moveToCategory(id, catId || null, { manual: true })
  window.$toast('分类已更新', 'success')
}

async function doBatchMove() {
  if (!batchCatId.value) return
  const ids = [...selectedIds.value]
  const target = batchCatId.value === '__unclassified__' ? null : batchCatId.value
  for (const id of ids) {
    await bm.moveToCategory(id, target, { manual: true })
  }
  window.$toast(`已分类 ${ids.length} 个书签`, 'success')
  selectedIds.value = new Set()
  batchCatId.value = ''
}

// ---- 分类 CRUD ----
async function onNewCategory() {
  const newCat = await cats.add({ name: '新分类', icon: '📁', color: '#64748b', tags: [] })
  expandedCat.value = newCat.id
  selectedCatId.value = newCat.id
  window.$toast('已创建新分类', 'success')
}

async function onCatUpdate(c) {
  await cats.update(c.id, { icon: c.icon, name: c.name, color: c.color })
}

function addCatTag(c) {
  const val = (tagInputVals.value[c.id] || '').trim()
  if (!val) return
  if (!c.tags) c.tags = []
  if (!c.tags.includes(val)) c.tags.push(val)
  tagInputVals.value[c.id] = ''
  cats.update(c.id, { tags: [...c.tags] })
}

function removeCatTag(c, ti) {
  c.tags.splice(ti, 1)
  cats.update(c.id, { tags: [...(c.tags || [])] })
}

async function deleteCategory(c) {
  if (!confirm(`删除分类「${c.name}」？该分类下的书签将变为未分类。`)) return
  await cats.remove(c.id)
  for (const b of bm.bookmarks) {
    if (b.categoryId === c.id) {
      bm.update(b.id, { categoryId: null, manualCategoryId: null, manualSet: false }).catch(() => {})
    }
  }
  if (selectedCatId.value === c.id) selectedCatId.value = 'all'
  window.$toast('已删除分类', 'info')
}

// ---- 镜像分类 ----
const mirrorDialog = reactive({ visible: false, sourceId: '', sourceName: '', name: '', targetId: '', copyBookmarks: false })

function mirrorCategory(c) {
  mirrorDialog.visible = true
  mirrorDialog.sourceId = c.id
  mirrorDialog.sourceName = c.name
  mirrorDialog.name = c.name + ' (镜像)'
  mirrorDialog.targetId = ''
  mirrorDialog.copyBookmarks = false
}

async function doMirror() {
  const source = cats.byId[mirrorDialog.sourceId]
  if (!source) return
  let targetId = mirrorDialog.targetId
  // 如果未选目标，创建新分类
  if (!targetId) {
    const newCat = await cats.add({
      name: mirrorDialog.name || source.name + ' (镜像)',
      icon: source.icon,
      color: source.color,
      tags: [...(source.tags || [])]
    })
    targetId = newCat.id
  } else {
    // 已有目标分类：同步标签
    const target = cats.byId[targetId]
    if (target) {
      const mergedTags = new Set([...(target.tags || []), ...(source.tags || [])])
      await cats.update(targetId, { tags: [...mergedTags] })
    }
  }
  // 复制书签
  if (mirrorDialog.copyBookmarks) {
    const sourceBms = bm.bookmarks.filter(b => b.categoryId === source.id && !b.recycled)
    for (const b of sourceBms) {
      await bm.moveToCategory(b.id, targetId, { manual: true })
    }
    window.$toast(`已镜像 ${sourceBms.length} 个书签`, 'success')
  } else {
    window.$toast('已镜像分类结构（含标签）', 'success')
  }
  mirrorDialog.visible = false
}

// ---- 分类状态保存/恢复（快照）----
const showSnapshots = ref(false)
const snapshots = ref([])

async function loadSnapshots() {
  try { snapshots.value = await window.api.invoke('snap:list') || [] } catch { snapshots.value = [] }
}

async function saveCategoryState() {
  const active = bm.bookmarks.filter(b => !b.recycled)
  if (active.length === 0) { window.$toast('没有书签可保存', 'warn'); return }
  const name = '分类状态 ' + new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  try {
    const snap = await window.api.invoke('snap:create', JSON.parse(JSON.stringify(active)), { name, kind: 'manual' })
    window.$toast(`已保存当前分类状态（${snap.count} 个书签）`, 'success')
    await loadSnapshots()
    showSnapshots.value = true
  } catch (e) { window.$toast('保存失败: ' + (e.message || e), 'error') }
}

async function restoreCategoryState(snapId) {
  if (!confirm('恢复分类状态将覆盖当前所有书签的分类，是否继续？')) return
  const r = await window.api.invoke('snap:restore', snapId)
  if (r && r.restored) {
    await bm.load()
    window.$toast(`已恢复 ${r.restored} 个书签的分类状态`, 'success')
  }
}

async function deleteSnapshot(id) {
  await window.api.invoke('snap:delete', id)
  await loadSnapshots()
  window.$toast('快照已删除', 'info')
}

// ---- 阅读状态 ----
async function cycleReadStatus(id) {
  const b = bm.getById(id)
  if (!b) return
  const next = { unread: 'reading', reading: 'done', done: 'unread' }[b.readStatus || 'unread'] || 'unread'
  await bm.setReadStatus(id, next)
}
function readStatusIcon(s) { return { unread: '📖', reading: '👓', done: '✅' }[s || 'unread'] || '📖' }
function readStatusText(s) { return { unread: '未读', reading: '读中', done: '已读' }[s || 'unread'] || '未读' }
function readStatusClass(s) {
  return { unread: 'text-slate-400 bg-slate-100 dark:bg-slate-700', reading: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', done: 'text-green-600 bg-green-100 dark:bg-green-900/30' }[s || 'unread']
}

// ---- 导入 ----
const ioLoading = ref(false)
const ioLoadingText = ref('')
const detectedBrowsers = ref([])
const importResult = ref(null)

async function doImport(type, browser) {
  ioLoading.value = true
  const channels = { html: 'io:importHtml', json: 'io:importJson', csv: 'io:importCsv', pocket: 'io:importPocketCsv', browser: 'io:importFromBrowser' }
  ioLoadingText.value = type === 'browser' ? `正在从 ${browser.name} 导入…` : '正在导入…'
  try {
    const r = type === 'browser' ? await window.api.invoke(channels.browser, browser.path) : await window.api.invoke(channels[type])
    ioLoading.value = false
    if (!r || r.canceled) return
    if (r.error) { showResult('导入失败', '❌', r.error); return }
    if (r.imported > 0) {
      await bm.load()
      await cats.load()
      importResult.value = { source: type === 'browser' ? browser.name : type.toUpperCase(), imported: r.imported, skipped: r.skipped || 0 }
      window.$toast(`成功导入 ${r.imported} 个书签`, 'success')
    } else if (r.parsed === 0) {
      showResult('导入结果', '📭', '未找到有效的书签')
    }
  } catch (e) { ioLoading.value = false; showResult('错误', '❌', '导入失败: ' + (e.message || e)) }
}

// ---- 导出 ----
async function exportCategory(c) {
  ioLoadingText.value = `正在导出分类「${c.name}」…`
  ioLoading.value = true
  try {
    const r = await window.api.invoke('io:exportCategory', c.id, cats.categories)
    ioLoading.value = false
    if (!r || r.canceled) return
    if (r.error) { showResult('导出失败', '❌', r.error); return }
    if (r.exported) {
      showResult('导出完成', '📤', `已导出分类「${c.name}」`, [`文件: ${r.path}`, `共 ${r.count} 个书签`])
    }
  } catch (e) { ioLoading.value = false; showResult('错误', '❌', '导出失败: ' + (e.message || e)) }
}

async function exportHtml() {
  ioLoadingText.value = '正在导出 Chrome 书签 HTML…'
  ioLoading.value = true
  try {
    const r = await window.api.invoke('io:exportHtml')
    ioLoading.value = false
    if (!r || r.canceled) return
    if (r.error) { showResult('导出失败', '❌', r.error); return }
    if (r.exported) showResult('导出完成', '📤', '已导出为 Chrome 书签 HTML', [`文件: ${r.path || 'bookmarks.html'}`, `共 ${bm.bookmarks.length} 个书签`])
  } catch (e) { ioLoading.value = false; showResult('错误', '❌', '导出失败: ' + (e.message || e)) }
}

async function exportJson() {
  ioLoadingText.value = '正在导出 JSON 备份…'
  ioLoading.value = true
  try {
    const r = await window.api.invoke('io:exportJson')
    ioLoading.value = false
    if (!r || r.canceled) return
    if (r.error) { showResult('导出失败', '❌', r.error); return }
    if (r.exported) showResult('导出完成', '💾', '已导出 JSON 备份', [`文件: ${r.path || 'backup.json'}`, `共 ${bm.bookmarks.length} 个书签`])
  } catch (e) { ioLoading.value = false; showResult('错误', '❌', '导出失败: ' + (e.message || e)) }
}

async function exportStyledHtml() {
  ioLoadingText.value = '正在生成带样式网页…'
  ioLoading.value = true
  try {
    const r = await window.api.invoke('io:exportStyledHtml')
    if (r && r.html) {
      downloadBlob(r.html, 'bookmarks-' + today() + '.html', 'text/html')
      showResult('导出完成', '🌐', '已导出为带样式的网页文件', [`共 ${bm.bookmarks.length} 个书签`])
    }
  } catch (e) { showResult('错误', '❌', '导出失败: ' + (e.message || e)) }
  ioLoading.value = false
}

async function exportMarkdown() {
  ioLoadingText.value = '正在生成 Markdown…'
  ioLoading.value = true
  try {
    const r = await window.api.invoke('io:exportMarkdown')
    if (r && r.markdown) {
      downloadBlob(r.markdown, 'bookmarks-' + today() + '.md', 'text/markdown')
      showResult('导出完成', '📝', '已导出为 Markdown', [`共 ${bm.bookmarks.length} 个书签`])
    }
  } catch (e) { showResult('错误', '❌', '导出失败: ' + (e.message || e)) }
  ioLoading.value = false
}

// ---- 工具函数 ----
const resultDialog = reactive({ visible: false, title: '', icon: '', message: '', details: [] })
function showResult(title, icon, message, details = []) {
  Object.assign(resultDialog, { visible: true, title, icon, message, details })
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function today() { return new Date().toISOString().slice(0, 10) }

function browserIcon(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('chrome')) return '🌐'
  if (n.includes('edge')) return '🟦'
  if (n.includes('firefox')) return '🦊'
  return '🌐'
}

async function openUrl(url) { await window.api.invoke('browser:open', url) }

function host(url) { try { return new URL(url).hostname } catch { return url || '' } }
function letter(s) { return (s || '?').charAt(0).toUpperCase() }
function letterColor(s) {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444']
  let hash = 0
  for (let i = 0; i < (s || '').length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}
function statusDotClass(status) {
  return { ok: 'bg-green-500', warn: 'bg-amber-500', dead: 'bg-red-500', redirect: 'bg-blue-500', unknown: 'bg-slate-400' }[status || 'unknown'] || 'bg-slate-400'
}
function statusText(status) {
  return { ok: '正常', warn: '异常', dead: '失效', redirect: '重定向', unknown: '未知' }[status || 'unknown'] || '未知'
}

// ---- 初始化 ----
onMounted(async () => {
  if (!bm.loaded) await bm.load()
  if (!cats.loaded) await cats.load()
  await loadSnapshots()
  try {
    const r = await window.api.invoke('io:detectBrowsers')
    detectedBrowsers.value = (r || []).filter(b => b.path)
  } catch { /* ignore */ }
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.io-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  border-radius: 0.75rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  transition: all 0.2s;
  text-align: left;
}
.io-card:hover { border-color: var(--accent-500); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.io-card:disabled { opacity: 0.5; }
.step-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.75rem;
  padding: 0.75rem;
  background: rgba(248, 250, 252, 0.8);
}
.dark .step-item { background: rgba(51, 65, 85, 0.3); }
.step-num {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--accent-500);
  color: white;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
