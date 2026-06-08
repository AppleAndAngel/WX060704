<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDiary } from '@/composables/useDiary'
import { useItems } from '@/composables/useItems'
import { useDiaryStore } from '@/stores/diary'
import { pluginLoader } from '@/engine/PluginLoader'
import { STATE_ORDER, STATE_COLORS } from '@/types'
import type { Item } from '@/types'

const route = useRoute()
const router = useRouter()
const diaryStore = useDiaryStore()

const diaryId = computed(() => route.params.id as string)

const {
  currentDiary,
  decayLevel,
  stateName,
  stateColor,
  diaryType,
  isOwner,
  isDead,
  isFrozen,
  renderToCanvas,
  toggleFreeze,
  rewindState
} = useDiary(diaryId.value)

const { itemsByRarity, useItem } = useItems()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const showItemSelector = ref(false)
const showDeleteConfirm = ref(false)
const itemTargetDiaryId = ref<string | null>(null)
const previewTime = ref<number | null>(null)

const stateProgress = computed(() => {
  if (!currentDiary.value) return 0
  const currentIndex = STATE_ORDER.indexOf(currentDiary.value.state)
  return (currentIndex / (STATE_ORDER.length - 1)) * 100
})

const availableItems = computed(() => {
  const items: { item: Item; count: number }[] = []
  Object.values(itemsByRarity.value).forEach(rarityItems => {
    rarityItems.forEach(({ item, count }) => {
      if (currentDiary.value && item.targetTypes.includes(currentDiary.value.type)) {
        items.push({ item, count })
      }
    })
  })
  return items
})

function render() {
  if (!canvasRef.value || !currentDiary.value) return
  renderToCanvas(canvasRef.value, previewTime.value ?? undefined)
}

let renderInterval: number | null = null

onMounted(() => {
  render()
  renderInterval = window.setInterval(render, 500)
})

watch(() => currentDiary.value, () => {
  render()
}, { deep: true })

watch([previewTime, diaryId], () => {
  render()
})

function handleRewind() {
  if (!currentDiary.value) return
  rewindState()
}

function handleUseItem(itemId: string) {
  if (!currentDiary.value) return
  const success = useItem(itemId, currentDiary.value.id)
  if (success) {
    showItemSelector.value = false
  }
}

function goToPipelineEditor() {
  router.push(`/pipeline/${diaryId.value}`)
}

function goBack() {
  router.back()
}

function handleTimePreview(time: number | null) {
  previewTime.value = time
}

function handleDelete() {
  if (!currentDiary.value) return
  diaryStore.deleteDiary(currentDiary.value.id)
  showDeleteConfirm.value = false
  router.push('/archive')
}
</script>

<template>
  <div class="space-y-6" v-if="currentDiary">
    <div class="flex items-center justify-between">
      <button
        class="btn-pixel text-gray-400 border-gray-600 text-sm"
        @click="goBack"
      >
        ← 返回
      </button>
      
      <div class="flex items-center gap-2" v-if="isOwner">
        <button
          v-if="!isDead"
          class="btn-pixel text-diary-fresh border-diary-fresh text-sm"
          @click="goToPipelineEditor"
        >
          ⚙️ 编辑管线
        </button>
        <button
          v-if="!isDead"
          class="btn-pixel text-sm"
          :class="isFrozen ? 'text-diary-frozen border-diary-frozen' : 'text-gray-400 border-gray-600'"
          @click="toggleFreeze"
        >
          {{ isFrozen ? '❄️ 已冻结' : '🥶 冻结' }}
        </button>
        <button
          v-if="isDead"
          class="btn-pixel text-diary-dying border-diary-dying text-sm"
          @click="handleRewind"
        >
          🔄 捞回
        </button>
        <button
          v-if="!isDead"
          class="btn-pixel text-diary-rotted border-diary-rotted text-sm"
          @click="handleRewind"
        >
          ⏪ 回退
        </button>
        <button
          class="btn-pixel text-diary-gold border-diary-gold text-sm"
          :disabled="!availableItems.length"
          @click="showItemSelector = true"
        >
          🎒 {{ isDead ? '🛠️ 维修' : '使用道具' }}
        </button>
        <button
          class="btn-pixel text-red-500 border-red-500 text-sm"
          @click="showDeleteConfirm = true"
        >
          🗑️ 移入档案馆
        </button>
      </div>
    </div>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <div class="crt-container rounded-lg overflow-hidden border-2" :style="{ borderColor: stateColor }">
          <canvas
            ref="canvasRef"
            width="800"
            height="500"
            class="w-full h-auto block"
          ></canvas>
        </div>
        
        <div v-if="isOwner" class="mt-4">
          <label class="block font-vt323 text-gray-400 mb-2 text-sm">
            {{ isDead ? '时间回溯: 拖动滑块查看过去的状态' : '时间预览: 拖动滑块查看过去或未来的状态' }}
          </label>
          <input
            type="range"
            :min="currentDiary.createdAt - 200"
            :max="isDead ? currentDiary.createdAt + 1000 : currentDiary.createdAt + 2000"
            :value="previewTime ?? currentDiary.createdAt"
            class="w-full accent-diary-fresh"
            @input="handleTimePreview(Number(($event.target as HTMLInputElement).value))"
            @mouseup="handleTimePreview(null)"
            @touchend="handleTimePreview(null)"
          />
          <div class="flex justify-between text-xs text-gray-500 font-vt323 mt-1">
            <span>过去</span>
            <span>{{ previewTime ? `预览时间: ${Math.floor(previewTime)}` : '当前时间' }}</span>
            <span>{{ isDead ? '死亡时间' : '未来' }}</span>
          </div>
        </div>
      </div>
      
      <div class="space-y-4">
        <div class="bg-gray-900/80 rounded-lg p-4 border border-gray-800">
          <h2 class="font-vt323 text-2xl mb-2">{{ currentDiary.title }}</h2>
          
          <div class="flex items-center gap-2 mb-4">
            <span 
              class="state-indicator"
              :style="{ color: stateColor, borderColor: stateColor }"
            >
              {{ stateName }}
            </span>
            <span 
              v-if="isFrozen"
              class="px-2 py-1 rounded text-xs font-vt323 bg-diary-frozen/20 text-diary-frozen border border-diary-frozen"
            >
              ❄️ 已冻结
            </span>
          </div>
          
          <div class="mb-4">
            <div class="flex justify-between text-xs font-vt323 text-gray-500 mb-1">
              <span>状态进度</span>
              <span>{{ Math.floor(stateProgress) }}%</span>
            </div>
            <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div 
                class="h-full transition-all duration-500"
                :style="{ width: `${stateProgress}%`, backgroundColor: stateColor }"
              ></div>
            </div>
            <div class="flex justify-between mt-1">
              <span 
                v-for="state in STATE_ORDER" 
                :key="state"
                class="text-xs font-vt323"
                :style="{ 
                  color: STATE_ORDER.indexOf(state) <= STATE_ORDER.indexOf(currentDiary.state) 
                    ? STATE_COLORS[state] 
                    : '#666' 
                }"
              >
                ●
              </span>
            </div>
          </div>
          
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500 font-vt323">类型:</span>
              <span class="font-vt323">{{ diaryType?.name || '未知' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 font-vt323">衰变率:</span>
              <span class="font-vt323">x{{ diaryType?.decayRate || 1 }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 font-vt323">创建时间:</span>
              <span class="font-vt323">{{ Math.floor(currentDiary.createdAt) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 font-vt323">衰变等级:</span>
              <span class="font-vt323">{{ Math.floor(decayLevel * 100) }}%</span>
            </div>
          </div>
        </div>
        
        <div class="bg-gray-900/80 rounded-lg p-4 border border-gray-800">
          <h3 class="font-vt323 text-lg text-diary-fresh mb-3">
            🧪 渲染管线 ({{ currentDiary.pipeline.filter(p => p.enabled).length }})
          </h3>
          
          <div v-if="currentDiary.pipeline.length === 0" class="text-gray-500 text-sm font-vt323">
            没有应用任何烂法
          </div>
          
          <div v-else class="space-y-2">
            <div
              v-for="(step, index) in [...currentDiary.pipeline].sort((a, b) => a.order - b.order)"
              :key="step.methodId"
              class="flex items-center gap-2 p-2 rounded bg-gray-800/50"
              :class="{ 'opacity-50': !step.enabled }"
            >
              <span class="text-gray-500 font-vt323 text-xs w-6">
                {{ index + 1 }}
              </span>
              <span class="text-sm flex-1">
                {{ pluginLoader.getDecayMethods().get(step.methodId)?.name || step.methodId }}
              </span>
              <span 
                class="w-2 h-2 rounded-full"
                :class="step.enabled ? 'bg-diary-fresh' : 'bg-gray-600'"
              ></span>
            </div>
          </div>
        </div>
        
        <div v-if="isOwner && !isDead" class="space-y-2">
          <button
            class="w-full btn-pixel text-diary-rotting border-diary-rotting"
            :disabled="currentDiary.state === 'fresh'"
            @click="handleRewind"
          >
            🔄 捞一下 (回退状态)
          </button>
        </div>
      </div>
    </div>
    
    <div v-if="showItemSelector" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div class="bg-gray-900 rounded-lg border-2 border-diary-gold w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-vt323 text-xl text-diary-gold glow-text">
              🎒 选择道具
            </h3>
            <button
              class="text-gray-400 hover:text-white text-xl"
              @click="showItemSelector = false"
            >
              ✕
            </button>
          </div>
          
          <div v-if="availableItems.length === 0" class="text-center py-8">
            <p class="text-gray-500 font-vt323">
              没有可用的道具
            </p>
          </div>
          
          <div v-else class="space-y-2">
            <div
              v-for="{ item, count } in availableItems"
              :key="item.id"
              class="flex items-center justify-between p-3 rounded border-2 cursor-pointer transition-all hover:bg-gray-800/50"
              :class="`item-card ${item.rarity}`"
              @click="handleUseItem(item.id)"
            >
              <div class="flex items-center gap-3">
                <span class="text-2xl">{{ item.icon }}</span>
                <div>
                  <div class="font-vt323">{{ item.name }}</div>
                  <div class="text-xs text-gray-500">{{ item.description }}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="font-vt323 text-lg">x{{ count }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showDeleteConfirm" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div class="bg-gray-900 rounded-lg border-2 border-red-500 w-full max-w-md">
        <div class="p-6">
          <h3 class="font-vt323 text-xl text-red-500 mb-4">
            🗑️ 确认移入档案馆
          </h3>
          <p class="text-gray-300 font-vt323 mb-6">
            确定要将「{{ currentDiary?.title }}」移入旧档案馆吗？<br/>
            日记将被标记为「用户删除」并存档，你可以随时在旧档案馆中查看或恢复。
          </p>
          <div class="flex gap-3">
            <button
              class="flex-1 btn-pixel text-gray-400 border-gray-600"
              @click="showDeleteConfirm = false"
            >
              取消
            </button>
            <button
              class="flex-1 btn-pixel text-red-500 border-red-500"
              @click="handleDelete"
            >
              确认移入
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
