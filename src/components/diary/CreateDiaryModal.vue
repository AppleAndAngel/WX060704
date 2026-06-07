<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useDiaryStore } from '@/stores/diary'
import { pluginLoader } from '@/engine/PluginLoader'
import { renderPipeline } from '@/engine/RenderPipeline'
import type { PipelineStep, DiaryType } from '@/types'

const emit = defineEmits<{
  close: []
  created: []
}>()

const userStore = useUserStore()
const diaryStore = useDiaryStore()

const title = ref('')
const content = ref('')
const selectedType = ref('base')
const selectedMethods = ref<string[]>(['blur', 'chroma'])
const isCreating = ref(false)

const diaryTypes = ref<[string, DiaryType][]>([])
const decayMethods = computed(() => Array.from(pluginLoader.getDecayMethods().entries()))

onMounted(async () => {
  await pluginLoader.loadAll()
  diaryTypes.value = Array.from(pluginLoader.getDiaryTypes().entries())
})

const canCreate = computed(() => {
  return title.value.trim() && content.value.trim()
})

async function handleCreate() {
  if (!canCreate.value || !userStore.currentUserId) return
  
  isCreating.value = true
  
  const pipeline: PipelineStep[] = selectedMethods.value.map((methodId, index) => {
    const methodEntry = decayMethods.value.find(([id]) => id === methodId)
    const method = methodEntry ? methodEntry[1] : null
    if (!method) return null
    
    const params: Record<string, number> = {}
    Object.entries(method.params).forEach(([key, def]) => {
      params[key] = (def as { default: number }).default
    })
    
    return {
      methodId,
      enabled: true,
      params,
      order: index
    }
  }).filter(Boolean) as PipelineStep[]
  
  diaryStore.createDiary(
    userStore.currentUserId,
    selectedType.value,
    title.value.trim(),
    content.value.trim(),
    pipeline
  )
  
  setTimeout(() => {
    emit('created')
  }, 300)
}

function toggleMethod(methodId: string) {
  const index = selectedMethods.value.indexOf(methodId)
  if (index === -1) {
    selectedMethods.value.push(methodId)
  } else {
    selectedMethods.value.splice(index, 1)
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
    <div class="bg-gray-900 rounded-lg border-2 border-diary-fresh w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="font-vt323 text-2xl text-diary-fresh glow-text">
            ✏️ 写新日记
          </h2>
          <button
            class="text-gray-400 hover:text-white text-2xl"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block font-vt323 text-diary-fresh mb-2">
              > 标题
            </label>
            <input
              v-model="title"
              type="text"
              class="w-full bg-gray-800 border-2 border-gray-700 rounded px-4 py-2 text-white font-jetbrains outline-none focus:border-diary-fresh transition-colors"
              placeholder="给日记起个名字..."
              maxlength="50"
            />
          </div>
          
          <div>
            <label class="block font-vt323 text-diary-fresh mb-2">
              > 日记类型
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="[id, type] in diaryTypes"
                :key="id"
                class="px-4 py-2 rounded font-vt323 transition-all border-2"
                :class="[
                  selectedType === id 
                    ? 'bg-diary-fresh/20 border-diary-fresh text-diary-fresh' 
                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'
                ]"
                @click="selectedType = id"
              >
                {{ type.name }}
                <span class="text-xs ml-1 opacity-60">
                  (x{{ type.decayRate }})
                </span>
              </button>
            </div>
            <p class="text-gray-500 text-xs mt-1 font-vt323">
              不同类型的日记衰变速率不同
            </p>
          </div>
          
          <div>
            <label class="block font-vt323 text-diary-fresh mb-2">
              > 内容
            </label>
            <textarea
              v-model="content"
              class="w-full bg-gray-800 border-2 border-gray-700 rounded px-4 py-3 text-white font-jetbrains outline-none focus:border-diary-fresh transition-colors resize-none"
              placeholder="写下你想记录的内容..."
              rows="6"
              maxlength="1000"
            ></textarea>
            <p class="text-right text-gray-500 text-xs mt-1 font-vt323">
              {{ content.length }}/1000
            </p>
          </div>
          
          <div>
            <label class="block font-vt323 text-diary-fresh mb-2">
              > 选择烂法 (可多选，按顺序渲染)
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="[id, method] in decayMethods"
                :key="id"
                class="px-3 py-1 rounded font-vt323 text-sm transition-all border-2"
                :class="[
                  selectedMethods.includes(id)
                    ? 'bg-diary-fresh/20 border-diary-fresh text-diary-fresh' 
                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'
                ]"
                @click="toggleMethod(id)"
              >
                {{ method.name }}
              </button>
            </div>
            <p class="text-gray-500 text-xs mt-1 font-vt323">
              渲染顺序会影响最终效果，之后可以在管线编辑器中调整
            </p>
          </div>
        </div>
        
        <div class="ascii-divider text-center my-6">
          ----------------------------------------------------------------
        </div>
        
        <div class="flex gap-3 justify-end">
          <button
            class="btn-pixel text-gray-400 border-gray-600"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            class="btn-pixel text-diary-fresh border-diary-fresh"
            :disabled="!canCreate || isCreating"
            @click="handleCreate"
          >
            {{ isCreating ? '保存中...' : '💾 保存日记' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
