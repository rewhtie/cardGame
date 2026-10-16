import { ref, shallowRef } from 'vue'
import { pushFx } from './useFx'
import { cards, rewardCardIds, starterDeck } from '@/data/cards'
import { slime, slimeGroup } from '@/data/enemies'
import { potions, relics } from '@/data/items'
import {
  ANCIENT_RELIC_IDS,
  createRun,
  dispatchRun,
  grantRelic,
  type RunAction,
  type RunState,
} from '@/engine/run'
import type { GameEvent } from '@/engine/types'
import { generateSeed, normalizeSeed } from '@/engine/seed'

// 模块级单例：整个应用共享一局游戏；null 表示在主菜单
const run = shallowRef<RunState | null>(null)
/** 下一局使用的种子（设置里填写）；留空则随机生成 */
const seedInput = ref('')

function begin(seed: string) {
  let state = createRun({
    seed,
    cards,
    deck: starterDeck,
    enemy: slime,
    enemies: slimeGroup,
    rewardCards: rewardCardIds,
    potionIds: Object.keys(potions),
    relicIds: Object.keys(relics).filter((id) => !ANCIENT_RELIC_IDS.includes(id)),
  })
  // 调试：初始即拥有所有已设计的遗物（含"获得时"效果）；先古遗物留给先古房选择，避免被预先占掉
  const events: GameEvent[] = []
  for (const id of Object.keys(relics).filter((id) => !ANCIENT_RELIC_IDS.includes(id))) {
    const r = grantRelic(state, id)
    state = r.state
    events.push(...r.events)
  }
  run.value = state
  pushFx(events)
}

/** 与 BattleView 的 playFx 节奏一致：估算敌人回合动画的时长（毫秒） */
function enemyPhaseMs(events: GameEvent[]) {
  let t = 0
  for (const e of events) {
    if (e.type === 'turnStarted') break // 之后属于玩家新回合
    if (e.type === 'enemyActed') t += 380 + (e.intent.type === 'attack' ? 160 : 0)
    else if (e.type === 'damageDealt') t += 130
    else if (e.type === 'statusApplied') t += 90
  }
  return t + 500
}

/** 引擎与 Vue 的桥接层：状态用 shallowRef 持有，每次 dispatch 整体替换 */
export function useRun() {
  return {
    run,
    seedInput,
    /** 开始新的一局；种子取设置里填写的，留空则随机生成 */
    start() {
      begin(normalizeSeed(seedInput.value) || generateSeed())
    },
    /** 用同一个种子重开 */
    retry() {
      if (run.value) begin(run.value.seed)
    },
    send(action: RunAction) {
      if (!run.value) return
      const { state, events, pre } = dispatchRun(run.value, action)
      pushFx(events)
      if (!pre) {
        run.value = state
        return
      }
      // 回合结束：先显示"敌人行动完、还没抽牌"的状态，等敌人动作演完再进入新回合抽牌
      run.value = pre
      setTimeout(() => {
        if (run.value === pre) run.value = state
      }, enemyPhaseMs(events))
    },
    quit() {
      run.value = null
    },
  }
}
