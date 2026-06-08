export enum DiaryState {
  FRESH = 'fresh',
  ROTTING = 'rotting',
  ROTTED = 'rotted',
  DYING = 'dying',
  DEAD = 'dead'
}

export const STATE_NAMES: Record<DiaryState, string> = {
  [DiaryState.FRESH]: '新鲜',
  [DiaryState.ROTTING]: '烂中',
  [DiaryState.ROTTED]: '已烂',
  [DiaryState.DYING]: '快死',
  [DiaryState.DEAD]: '死了'
}

export const STATE_COLORS: Record<DiaryState, string> = {
  [DiaryState.FRESH]: '#39ff14',
  [DiaryState.ROTTING]: '#ff6b35',
  [DiaryState.ROTTED]: '#6b3fa0',
  [DiaryState.DYING]: '#ff0040',
  [DiaryState.DEAD]: '#000000'
}

export const STATE_ORDER: DiaryState[] = [
  DiaryState.FRESH,
  DiaryState.ROTTING,
  DiaryState.ROTTED,
  DiaryState.DYING,
  DiaryState.DEAD
]

export enum ItemRarity {
  COMMON = 'common',
  RARE = 'rare',
  EPIC = 'epic'
}

export const RARITY_NAMES: Record<ItemRarity, string> = {
  [ItemRarity.COMMON]: '低级',
  [ItemRarity.RARE]: '中级',
  [ItemRarity.EPIC]: '高级'
}

export const RARITY_COLORS: Record<ItemRarity, string> = {
  [ItemRarity.COMMON]: '#9ca3af',
  [ItemRarity.RARE]: '#3b82f6',
  [ItemRarity.EPIC]: '#ffd700'
}

export interface DiaryContent {
  text: string
  images?: string[]
}

export interface StateTransition {
  from: DiaryState
  to: DiaryState
  condition: (diary: Diary, elapsed: number) => boolean
  onTransition?: (diary: Diary) => void
}

export interface DecayMethod {
  id: string
  name: string
  description: string
  version: string
  render: (
    ctx: CanvasRenderingContext2D,
    content: DiaryContent,
    decayLevel: number,
    params: Record<string, number>
  ) => void
  params: Record<string, { min: number; max: number; default: number }>
}

export interface DiaryType {
  id: string
  name: string
  extends?: string
  decayRate: number
  transitions: StateTransition[]
  deathEffect?: (diary: Diary) => void
  itemEffectModifiers: Record<string, number>
}

export interface Item {
  id: string
  name: string
  rarity: ItemRarity
  description: string
  icon: string
  effect: (diary: Diary) => Diary
  targetTypes: string[]
  effectiveness: Record<string, number>
}

export interface TombstoneStyle {
  id: string
  name: string
  render: (ctx: CanvasRenderingContext2D, diary: Diary) => void
}

export interface PipelineStep {
  methodId: string
  enabled: boolean
  params: Record<string, number>
  order: number
}

export interface Diary {
  id: string
  ownerId: string
  type: string
  title: string
  content: DiaryContent
  state: DiaryState
  frozen: boolean
  createdAt: number
  stateTimestamps: Record<DiaryState, number>
  pipeline: PipelineStep[]
  tombstone?: string
  isPublic: boolean
}

export interface User {
  id: string
  name: string
  avatar?: string
  bio?: string
  isPublic: boolean
  tombstoneStyle: string
}

export interface Recipe {
  inputs: { itemId: string; count: number }[]
  output: { itemId: string; count: number }
}

export interface InventoryItem {
  itemId: string
  count: number
}

export enum ArchiveReason {
  DEAD = 'dead',
  DELETED = 'deleted'
}

export const ARCHIVE_REASON_NAMES: Record<ArchiveReason, string> = {
  [ArchiveReason.DEAD]: '自然死亡',
  [ArchiveReason.DELETED]: '用户删除'
}

export interface RepairRecord {
  timestamp: number
  itemId: string
  itemName: string
  fromState: DiaryState
  toState: DiaryState
}

export interface ArchivedDiary {
  id: string
  diary: Diary
  archiveReason: ArchiveReason
  archivedAt: number
  lastRepairAt: number | null
  repairCount: number
  repairRecords: RepairRecord[]
}
