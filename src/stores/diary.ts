import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Diary, DiaryState, PipelineStep } from '@/types'
import { DiaryState as DS } from '@/types'
import { storage } from '@/utils/storage'
import { generateId } from '@/utils/id'
import { pluginLoader } from '@/engine/PluginLoader'
import { globalTimeline } from '@/engine/Timeline'
import { StateMachine } from '@/engine/StateMachine'
import { useUserStore } from './user'

let _userStore: any = null

const getUserStore = () => {
  if (!_userStore) {
    _userStore = useUserStore()
  }
  return _userStore
}

export const useDiaryStore = defineStore('diary', () => {
  const diaries = ref<Diary[]>([])
  const stateMachines = ref<Map<string, StateMachine>>(new Map())

  const currentUserDiaries = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId || userStore.visitingUserId
    return diaries.value.filter(d => d.ownerId === userId)
  })

  function init() {
    diaries.value = storage.getDiaries()
    
    const userStore = getUserStore()
    if (userStore.currentUserId && diaries.value.length === 0) {
      setTimeout(() => createSampleDiaries(), 100)
    }
  }

  async function createSampleDiaries() {
    const userStore = getUserStore()
    await pluginLoader.loadAll()
    
    if (!userStore.currentUserId || userStore.users.length === 0) return
    
    const user = userStore.currentUser
    if (!user) return
    
    const sampleContents = [
      {
        title: '第一封情书',
        type: 'loveLetter',
        text: '亲爱的你，今天是我们相识的第100天。阳光洒在窗台上，像你微笑时的弧度。我想把这一刻永远保存下来，虽然我知道，时间会带走一切。但至少，在这数字的世界里，我们的故事曾经鲜活过。',
        pipeline: ['blur', 'wave']
      },
      {
        title: '噩梦记录',
        type: 'nightmare',
        text: '昨晚又做了那个梦。无尽的走廊，闪烁的灯光，墙上的文字在我靠近时变成乱码。我跑啊跑，却始终找不到出口。醒来时，枕头已经湿透。我为什么要记录这些？也许记录本身就是一种解脱。',
        pipeline: ['garble', 'chroma', 'pixelate']
      },
      {
        title: '普通的一天',
        type: 'base',
        text: '今天天气很好。早上喝了一杯咖啡，看了几页书。下午去公园散步，看到一只猫在晒太阳。没有什么特别的事情发生，但这样平静的日子，也许就是幸福吧。',
        pipeline: ['blur', 'chroma']
      }
    ]
    
    const methods = pluginLoader.getDecayMethods()
    
    sampleContents.forEach(content => {
      const diaryType = pluginLoader.getDiaryType(content.type)
      if (!diaryType) return
      
      const pipeline: PipelineStep[] = content.pipeline.map((methodId, index) => {
        const method = methods.get(methodId)
        if (!method) return null
        
        const params: Record<string, number> = {}
        Object.entries(method.params).forEach(([key, def]) => {
          params[key] = def.default
        })
        
        return {
          methodId,
          enabled: true,
          params,
          order: index
        }
      }).filter(Boolean) as PipelineStep[]
      
      const sm = new StateMachine()
      sm.addTransitions(diaryType.transitions)
      stateMachines.value.set(content.type, sm)
      
      const now = globalTimeline.getTime()
      const diary: Diary = {
        id: generateId(),
        ownerId: user.id,
        type: content.type,
        title: content.title,
        content: { text: content.text },
        state: DS.FRESH,
        frozen: false,
        createdAt: now - Math.random() * 200,
        stateTimestamps: {
          [DS.FRESH]: now,
          [DS.ROTTING]: 0,
          [DS.ROTTED]: 0,
          [DS.DYING]: 0,
          [DS.DEAD]: 0
        },
        pipeline,
        isPublic: true
      }
      
      diaries.value.push(diary)
    })
    
    storage.saveDiaries(diaries.value)
  }

  function createDiary(
    ownerId: string,
    type: string,
    title: string,
    text: string,
    pipeline: PipelineStep[] = []
  ): Diary {
    const now = globalTimeline.getTime()
    
    const diary: Diary = {
      id: generateId(),
      ownerId,
      type,
      title,
      content: { text },
      state: DS.FRESH,
      frozen: false,
      createdAt: now,
      stateTimestamps: {
        [DS.FRESH]: now,
        [DS.ROTTING]: 0,
        [DS.ROTTED]: 0,
        [DS.DYING]: 0,
        [DS.DEAD]: 0
      },
      pipeline,
      isPublic: true
    }
    
    diaries.value.push(diary)
    storage.saveDiaries(diaries.value)
    
    return diary
  }

  function updateDiary(diaryId: string, updates: Partial<Diary>): void {
    const index = diaries.value.findIndex(d => d.id === diaryId)
    if (index !== -1) {
      diaries.value[index] = { ...diaries.value[index], ...updates }
      storage.saveDiaries(diaries.value)
    }
  }

  function deleteDiary(diaryId: string): void {
    diaries.value = diaries.value.filter(d => d.id !== diaryId)
    storage.saveDiaries(diaries.value)
  }

  function getDiaryById(diaryId: string): Diary | undefined {
    return diaries.value.find(d => d.id === diaryId)
  }

  function toggleFreeze(diaryId: string): void {
    const diary = getDiaryById(diaryId)
    if (diary && diary.state !== DS.DEAD) {
      updateDiary(diaryId, { frozen: !diary.frozen })
    }
  }

  function checkAndTransition(diaryId: string): void {
    const diary = getDiaryById(diaryId)
    if (!diary || diary.frozen || diary.state === DS.DEAD) return
    
    const diaryType = pluginLoader.getDiaryType(diary.type)
    if (!diaryType) return
    
    let sm = stateMachines.value.get(diary.type)
    if (!sm) {
      sm = new StateMachine()
      sm.addTransitions(diaryType.transitions)
      stateMachines.value.set(diary.type, sm)
    }
    
    const elapsed = globalTimeline.getElapsedSince(diary.createdAt)
    const adjustedElapsed = elapsed * diaryType.decayRate
    
    if (sm.canTransition(diary, adjustedElapsed)) {
      const currentTime = globalTimeline.getTime()
      const newDiary = sm.transition(diary, adjustedElapsed, currentTime)
      
      if (newDiary.state === DS.DEAD && diaryType.deathEffect) {
        diaryType.deathEffect(newDiary)
      }
      
      updateDiary(diaryId, newDiary)
    }
  }

  function rewindState(diaryId: string): void {
    const diary = getDiaryById(diaryId)
    if (!diary) return
    
    const diaryType = pluginLoader.getDiaryType(diary.type)
    if (!diaryType) return
    
    let sm = stateMachines.value.get(diary.type)
    if (!sm) {
      sm = new StateMachine()
      sm.addTransitions(diaryType.transitions)
      stateMachines.value.set(diary.type, sm)
    }
    
    const currentTime = globalTimeline.getTime()
    const newDiary = sm.rewindState(diary, currentTime)
    updateDiary(diaryId, newDiary)
  }

  function getDecayLevel(diary: Diary): number {
    const diaryType = pluginLoader.getDiaryType(diary.type)
    if (!diaryType) return 0
    
    let sm = stateMachines.value.get(diary.type)
    if (!sm) {
      sm = new StateMachine()
      sm.addTransitions(diaryType.transitions)
      stateMachines.value.set(diary.type, sm)
    }
    
    const elapsed = globalTimeline.getElapsedSince(diary.createdAt)
    return sm.getDecayLevel(diary, elapsed, diaryType.decayRate)
  }

  function getDiariesByUser(userId: string): Diary[] {
    return diaries.value.filter(d => d.ownerId === userId)
  }

  return {
    diaries,
    currentUserDiaries,
    init,
    createDiary,
    updateDiary,
    deleteDiary,
    getDiaryById,
    toggleFreeze,
    checkAndTransition,
    rewindState,
    getDecayLevel,
    getDiariesByUser
  }
})
