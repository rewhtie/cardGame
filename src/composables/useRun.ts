import { ref, shallowRef } from 'vue'
import { enqueueFx, pushFx, resetFx } from './useFx'
import { cards, colorlessRewardIds } from '@/data/cards'
import { CHARACTER_RELIC_IDS, characterById } from '@/data/characters'
import { drainer, encounterList, monsterPool, slime, slimeBoss, slimeGroup } from '@/data/enemies'
import { events as eventDefs } from '@/data/events'
import { potions, relics } from '@/data/items'
import {
  ANCIENT_RELIC_IDS,
  createRun,
  dispatchRun,
  type RunAction,
  type RunConfig,
  type RunState,
} from '@/engine/run'
import { fromSave, loadSave, persistRun, type NodeEntry } from '@/engine/save'
import { generateSeed, normalizeSeed } from '@/engine/seed'

// 模块级单例：整个应用共享一局游戏；null 表示在主菜单
const run = shallowRef<RunState | null>(null)
/** 下一局使用的种子（设置里填写）；留空则随机生成 */
const seedInput = ref('')
/** 唯一的存档位：主菜单据此显示"继续游戏" */
const savedGame = shallowRef(loadSave(localStorage))

/** 引擎之外的静态内容（卡牌、敌人、事件池等），开局和读档共用 */
function content(characterId?: string): Omit<RunConfig, 'seed'> {
  const character = characterById(characterId)
  return {
    cards,
    deck: character.deck,
    character: character.id,
    startRelics: character.relics,
    ...(character.maxHp && { playerMaxHp: character.maxHp }),
    enemy: slime,
    enemies: slimeGroup,
    monsters: monsterPool,
    encounters: encounterList,    boss: slimeBoss,
    elite: drainer,
    rewardCards: character.rewardCards,
    colorlessCards: colorlessRewardIds,
    potionIds: Object.keys(potions),
    events: eventDefs,
    relicIds: [
      ...Object.keys(relics).filter(
        (id) => !ANCIENT_RELIC_IDS.includes(id) && !CHARACTER_RELIC_IDS.includes(id),
      ),
      ...(character.exclusiveRelics ?? []),
    ],
  }
}

/**
 * 设置当前一局，并按存档规则写入存档。
 * entry：刚选中的地图节点，存档记为"选节点之前的地图 + 该节点"，读档时重新进入。
 */
function setRun(state: RunState | null, entry?: { from: RunState; node: NodeEntry }) {
  run.value = state
  if (!state) return
  if (entry) persistRun(localStorage, entry.from, entry.node)
  else persistRun(localStorage, state)
  savedGame.value = loadSave(localStorage)
}

function begin(seed: string, characterId?: string) {
  resetFx()
  setRun(createRun({ seed, ...content(characterId) }))
}

/** 引擎与 Vue 的桥接层：状态用 shallowRef 持有，每次 dispatch 整体替换 */
export function useRun() {
  return {
    run,
    seedInput,
    savedGame,
    /** 开始新的一局（覆盖存档）；种子取设置里填写的，留空则随机生成 */
    start(characterId?: string) {
      begin(normalizeSeed(seedInput.value) || generateSeed(), characterId)
    },
    /** 从存档继续；若存档停在"刚选中某个节点"，重新进入该节点（存档本身不变） */
    continueGame() {
      const save = savedGame.value
      if (!save) return
      const state = fromSave(save, content(save.run.character))
      resetFx()
      if (!save.enter) {
        run.value = state
        return
      }
      const r = dispatchRun(state, { type: 'chooseNode', ...save.enter })
      run.value = r.state
      pushFx(r.events)
    },
    /** 用同一个种子重开 */
    retry() {
      if (run.value) begin(run.value.seed, run.value.character)
    },
    send(action: RunAction) {
      if (!run.value) return
      const prev = run.value
      // 敌人阶段的演出期间：忽略一切操作。否则无效操作会换掉 run.value，
      // 演出结束的回调发现状态变了就直接返回，新回合永远不开始
      if (prev.screen === 'battle' && prev.battle?.phase === 'enemy') return
      const { state, events, pre } = dispatchRun(prev, action)
      if (!pre) pushFx(events)
      if (!pre) {
        // 成功进入地图节点（离开了地图界面）：存档记在这一刻，直到选下一个节点才更新
        const entered = action.type === 'chooseNode' && state.screen !== 'map'
        if (entered) {
          setRun(state, { from: prev, node: { id: action.id, god: action.god } })
        } else if (state.screen === 'reward' && prev.screen === 'reward') {
          // 领取奖励的每一步都不覆盖存档：读档回到刚结算完、尚未选择任何奖励的那一刻
          run.value = state
        } else if (state.screen === 'map' && prev.screen !== 'reward') {
          // 休息、锻造、事件结束后回到地图：不覆盖存档，读档仍回到选节点时，可重新选择
          run.value = state
        } else {
          setRun(state)
        }
        return
      }
      // 回合结束：先显示"敌人行动完、还没抽牌"的状态，敌人阶段的演出队列放空后再进入新回合抽牌
      const split = events.findIndex((e) => e.type === 'turnStarted')
      const enemyPhase = split < 0 ? events : events.slice(0, split)
      pushFx(events, false)
      run.value = pre
      enqueueFx(enemyPhase).done.then(() => {
        if (run.value !== pre) return // 期间读档 / 重开 / 退出
        run.value = state
        if (split >= 0) enqueueFx(events.slice(split))
      })
    },
    quit() {
      resetFx()
      run.value = null
    },
  }
}
