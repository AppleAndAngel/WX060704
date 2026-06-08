import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Diary, DiaryState, PipelineStep, ArchivedDiary, ArchiveReason, RepairRecord, User } from '@/types'
import { DiaryState as DS, ArchiveReason as AR } from '@/types'
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
  const archivedDiaries = ref<ArchivedDiary[]>([])
  const stateMachines = ref<Map<string, StateMachine>>(new Map())

  const currentUserDiaries = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId || userStore.visitingUserId
    return diaries.value.filter(d => d.ownerId === userId)
  })

  const currentUserArchivedDiaries = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId || userStore.visitingUserId
    return archivedDiaries.value.filter(ad => ad.diary.ownerId === userId)
  })

  function init() {
    diaries.value = storage.getDiaries()
    archivedDiaries.value = storage.getArchivedDiaries()
    
    const userStore = getUserStore()
    if (userStore.currentUserId && diaries.value.length === 0 && archivedDiaries.value.length === 0) {
      setTimeout(() => createSampleDiaries(), 100)
    }
  }

  function archiveDiary(diaryId: string, reason: ArchiveReason): void {
    const diary = getDiaryById(diaryId)
    if (!diary) return

    const existingArchive = archivedDiaries.value.find(ad => ad.diary.id === diaryId)
    if (existingArchive) return

    const now = globalTimeline.getTime()
    const archivedDiary: ArchivedDiary = {
      id: generateId(),
      diary: { ...diary },
      archiveReason: reason,
      archivedAt: now,
      lastRepairAt: null,
      repairCount: 0,
      repairRecords: []
    }

    diaries.value = diaries.value.filter(d => d.id !== diaryId)
    archivedDiaries.value.push(archivedDiary)

    storage.saveDiaries(diaries.value)
    storage.saveArchivedDiaries(archivedDiaries.value)
  }

  function restoreDiary(archivedId: string): Diary | null {
    const archivedIndex = archivedDiaries.value.findIndex(ad => ad.id === archivedId)
    if (archivedIndex === -1) return null

    const archived = archivedDiaries.value[archivedIndex]
    const restoredDiary = { ...archived.diary }

    if (restoredDiary.state === DS.DEAD) {
      restoredDiary.state = DS.DYING
      restoredDiary.frozen = false
    }

    diaries.value.push(restoredDiary)
    archivedDiaries.value.splice(archivedIndex, 1)

    storage.saveDiaries(diaries.value)
    storage.saveArchivedDiaries(archivedDiaries.value)

    return restoredDiary
  }

  function addRepairRecord(archivedId: string, record: Omit<RepairRecord, 'timestamp'>): void {
    const archived = archivedDiaries.value.find(ad => ad.id === archivedId)
    if (!archived) return

    const now = globalTimeline.getTime()
    const fullRecord: RepairRecord = {
      ...record,
      timestamp: now
    }

    archived.repairRecords.push(fullRecord)
    archived.repairCount++
    archived.lastRepairAt = now

    storage.saveArchivedDiaries(archivedDiaries.value)
  }

  function getArchivedById(archivedId: string): ArchivedDiary | undefined {
    return archivedDiaries.value.find(ad => ad.id === archivedId)
  }

  function getArchivedDiariesByUser(userId: string): ArchivedDiary[] {
    return archivedDiaries.value.filter(ad => ad.diary.ownerId === userId)
  }

  function searchArchivedDiaries(
    filters: {
      ownerId?: string
      diaryType?: string
      archiveReason?: ArchiveReason
      archivedBefore?: number
      archivedAfter?: number
      repairedBefore?: number
      repairedAfter?: number
      keyword?: string
    } = {}
  ): ArchivedDiary[] {
    let results = [...archivedDiaries.value]

    if (filters.ownerId) {
      results = results.filter(ad => ad.diary.ownerId === filters.ownerId)
    }

    if (filters.diaryType) {
      results = results.filter(ad => ad.diary.type === filters.diaryType)
    }

    if (filters.archiveReason) {
      results = results.filter(ad => ad.archiveReason === filters.archiveReason)
    }

    if (filters.archivedBefore !== undefined) {
      results = results.filter(ad => ad.archivedAt <= filters.archivedBefore!)
    }

    if (filters.archivedAfter !== undefined) {
      results = results.filter(ad => ad.archivedAt >= filters.archivedAfter!)
    }

    if (filters.repairedBefore !== undefined) {
      results = results.filter(ad => ad.lastRepairAt !== null && ad.lastRepairAt <= filters.repairedBefore!)
    }

    if (filters.repairedAfter !== undefined) {
      results = results.filter(ad => ad.lastRepairAt !== null && ad.lastRepairAt >= filters.repairedAfter!)
    }

    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase()
      results = results.filter(ad =>
        ad.diary.title.toLowerCase().includes(keyword) ||
        ad.diary.content.text.toLowerCase().includes(keyword)
      )
    }

    return results.sort((a, b) => b.archivedAt - a.archivedAt)
  }

  async function createSampleDiaries() {
    const userStore = getUserStore()
    await pluginLoader.loadAll()
    
    if (userStore.users.length === 0) return
    
    const methods = pluginLoader.getDecayMethods()
    
    const sampleContentsByUser: Record<string, Array<{
      title: string
      type: string
      text: string
      pipeline: string[]
      createdAtOffset: number
    }>> = {
      '故障收藏家': [
        {
          title: '第一封情书',
          type: 'loveLetter',
          text: '亲爱的你，今天是我们相识的第100天。阳光洒在窗台上，像你微笑时的弧度。我想把这一刻永远保存下来，虽然我知道，时间会带走一切。但至少，在这数字的世界里，我们的故事曾经鲜活过。',
          pipeline: ['blur', 'wave'],
          createdAtOffset: 50
        },
        {
          title: '噩梦记录',
          type: 'nightmare',
          text: '昨晚又做了那个梦。无尽的走廊，闪烁的灯光，墙上的文字在我靠近时变成乱码。我跑啊跑，却始终找不到出口。醒来时，枕头已经湿透。我为什么要记录这些？也许记录本身就是一种解脱。',
          pipeline: ['garble', 'chroma', 'pixelate'],
          createdAtOffset: 150
        },
        {
          title: '普通的一天',
          type: 'base',
          text: '今天天气很好。早上喝了一杯咖啡，看了几页书。下午去公园散步，看到一只猫在晒太阳。没有什么特别的事情发生，但这样平静的日子，也许就是幸福吧。',
          pipeline: ['blur', 'chroma'],
          createdAtOffset: 30
        }
      ],
      '时间旅人': [
        {
          title: '时间旅行日志 #001',
          type: 'base',
          text: '我是时间旅人，在时间轴上漫步。今天我访问了2025年的春天，那里的樱花开得很美。我试图记录下这一刻，但我知道，这些文字最终也会在时间的长河中腐烂。',
          pipeline: ['wave', 'garble'],
          createdAtOffset: 200
        },
        {
          title: '写给未来的信',
          type: 'loveLetter',
          text: '致未来的我：当你读到这封信时，它可能已经面目全非。但请记住，写这封信时的心情是真挚的。时间会改变一切，但有些东西值得被铭记。',
          pipeline: ['blur', 'chroma'],
          createdAtOffset: 100
        },
        {
          title: '量子梦境',
          type: 'nightmare',
          text: '在量子的世界里，一切可能性同时存在。我梦见自己同时出现在过去和未来，所有的记忆交织在一起，变成了无法辨认的乱码。这就是数字存在的本质吗？',
          pipeline: ['pixelate', 'garble', 'wave'],
          createdAtOffset: 800
        }
      ]
    }
    
    userStore.users.forEach((user: User) => {
      const userSamples = sampleContentsByUser[user.name] || sampleContentsByUser['故障收藏家']
      
      userSamples.forEach(content => {
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
          createdAt: now - content.createdAtOffset,
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
    archiveDiary(diaryId, AR.DELETED)
  }

  function getDiaryById(diaryId: string): Diary | undefined {
    return diaries.value.find(d => d.id === diaryId)
  }

  function toggleFreeze(diaryId: string): void {
    const diary = getDiaryById(diaryId)
    if (diary) {
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
      
      if (newDiary.state === DS.DEAD) {
        if (diaryType.deathEffect) {
          diaryType.deathEffect(newDiary)
        }
        updateDiary(diaryId, newDiary)
        setTimeout(() => archiveDiary(diaryId, AR.DEAD), 100)
      } else {
        updateDiary(diaryId, newDiary)
      }
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
    archivedDiaries,
    currentUserDiaries,
    currentUserArchivedDiaries,
    init,
    createDiary,
    updateDiary,
    deleteDiary,
    getDiaryById,
    toggleFreeze,
    checkAndTransition,
    rewindState,
    getDecayLevel,
    getDiariesByUser,
    archiveDiary,
    restoreDiary,
    addRepairRecord,
    getArchivedById,
    getArchivedDiariesByUser,
    searchArchivedDiaries
  }
})
