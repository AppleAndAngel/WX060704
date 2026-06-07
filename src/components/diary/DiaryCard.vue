<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Diary } from '@/types'
import { STATE_NAMES, STATE_COLORS } from '@/types'
import { renderPipeline } from '@/engine/RenderPipeline'
import { globalTimeline } from '@/engine/Timeline'
import { pluginLoader } from '@/engine/PluginLoader'
import { StateMachine } from '@/engine/StateMachine'

interface Props {
  diary: Diary
  isOwner: boolean
}

const props = defineProps<Props>()
const router = useRouter()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isHovered = ref(false)
const stateMachine = new StateMachine()

const stateColor = computed(() => STATE_COLORS[props.diary.state])
const stateName = computed(() => STATE_NAMES[props.diary.state])

const diaryType = computed(() => {
  return pluginLoader.getDiaryType(props.diary.type)
})

const cardClass = computed(() => {
  return [
    'diary-card',
    {
      'frozen': props.diary.frozen,
      'dead': props.diary.state === 'dead'
    }
  ]
})

function render() {
  if (!canvasRef.value) return
  
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return
  
  const decayRate = diaryType.value?.decayRate || 1
  renderPipeline.render(props.diary, ctx, undefined, decayRate)
}

let unsubscribe: (() => void) | null = null
let renderInterval: number | null = null

onMounted(() => {
  if (diaryType.value) {
    stateMachine.addTransitions(diaryType.value.transitions)
  }
  
  render()
  
  unsubscribe = globalTimeline.subscribe(() => {
    if (!props.diary.frozen) {
      render()
    }
  })
  
  renderInterval = window.setInterval(render, 500)
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
  if (renderInterval) {
    clearInterval(renderInterval)
  }
})

watch(() => props.diary, () => {
  render()
}, { deep: true })

function goToDetail() {
  router.push(`/diary/${props.diary.id}`)
}
</script>

<template>
  <div 
    :class="cardClass"
    class="rounded-lg cursor-pointer"
    :style="{ borderColor: diary.frozen ? '#00d4ff' : stateColor }"
    @click="goToDetail"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div class="relative">
      <canvas 
        ref="canvasRef"
        width="320"
        height="200"
        class="w-full h-48 block"
      ></canvas>
      
      <div 
        v-if="diary.frozen"
        class="absolute top-2 right-2 bg-diary-frozen/80 text-white px-2 py-1 rounded text-xs font-vt323"
      >
        ❄️ 已冻结
      </div>
      
      <div 
        v-if="diary.state === 'dead'"
        class="absolute inset-0 flex items-center justify-center bg-black/50"
      >
        <span class="text-4xl">🪦</span>
      </div>
    </div>
    
    <div class="p-3">
      <div class="flex items-center justify-between mb-2">
        <h3 
          class="font-vt323 text-lg truncate flex-1"
          :style="{ color: isHovered ? stateColor : '#fff' }"
        >
          {{ diary.title }}
        </h3>
        <span 
          class="state-indicator ml-2 whitespace-nowrap"
          :style="{ color: stateColor, borderColor: stateColor }"
        >
          {{ stateName }}
        </span>
      </div>
      
      <div class="flex items-center justify-between text-xs text-gray-500">
        <span class="font-vt323">
          {{ diaryType?.name || '未知类型' }}
        </span>
        <span class="font-vt323">
          管线: {{ diary.pipeline.filter(p => p.enabled).length }} 种
        </span>
      </div>
    </div>
  </div>
</template>
