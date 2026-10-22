import { cards, starterDeck } from '@/data/cards'
import { drainer, encounterList, monsterPool, slime, slimeBoss, slimeGroup, splitSlime, summoner, goblin } from '@/data/enemies'
import { potions, relics } from '@/data/items'
import { dispatch } from '@/engine/battle'
import { resolveCards, upgradedId, withEnchant } from '@/engine/enchant'
import { createRun, type RunState } from '@/engine/run'
import { generateShop } from '@/engine/shop'
import type { Action, BattleState, EnemyDef, GameEvent } from '@/engine/types'
import { setupScenario, type ScenarioOpts } from '@/testing/cardHarness'

/** 战斗场景：before 是动画开始前的状态，state 是 dispatch 后的终态（游戏里界面拿到的就是终态，数值靠演出队列回退） */
export interface BattlePlan {
  before: BattleState
  state: BattleState
  events: GameEvent[]
}

export type RunComponent = 'hud-gold' | 'relic-reveal' | 'card-add' | 'hurt' | 'shop'

export type Scene =
  | { kind: 'battle'; build: () => BattlePlan }
  | {
      kind: 'run'
      component: RunComponent | 'none'
      /** 场景用的局内状态：临时构造，不读存档、不碰 useRun 的单例 */
      run: () => RunState
      /** 重播时发给演出层的事件（战斗外不进演出队列） */
      events?: GameEvent[]
      /** hud-gold：重播时金币变到这个值 */
      goldTo?: number
    }

type Step =
  | { play: string; target?: number }
  | { potion: string; target?: number }
  | { act: Action }
  | 'end'

type Tweak = (s: BattleState) => void

interface BattleOpts extends ScenarioOpts {
  tweak?: Tweak
}

/** 从某类事件起取连续 n 个：结束回合会一次产出弃牌、敌人行动、新回合抽牌，面板只演示槽位相关的那一小段 */
const window =
  (from: GameEvent['type'], n: number) =>
  (events: GameEvent[]): GameEvent[] => {
    const i = events.findIndex((e) => e.type === from)
    return i < 0 ? [] : events.slice(i, i + n)
  }
type Pick = (events: GameEvent[]) => GameEvent[]

function prepare(opts: BattleOpts): BattleState {
  const s = setupScenario(opts)
  opts.tweak?.(s)
  return s
}

/** 用真实的 dispatch 跑一串操作，事件序列和游戏里一模一样 */
function scripted(opts: BattleOpts, steps: Step[], pick?: Pick): Scene {
  return {
    kind: 'battle',
    build() {
      const before = prepare(opts)
      let state = before
      const events: GameEvent[] = []
      for (const step of steps) {
        let action: Action
        if (step === 'end') action = { type: 'endTurn' }
        else if ('play' in step) {
          const handIndex = state.hand.indexOf(step.play)
          if (handIndex < 0) throw new Error(`手牌里没有 ${step.play}`)
          action = { type: 'playCard', handIndex, target: step.target }
        } else if ('potion' in step) action = { type: 'usePotion', potionId: step.potion, target: step.target }
        else action = step.act
        const r = dispatch(state, action)
        state = r.state
        events.push(...r.events)
      }
      return { before, state, events: pick ? pick(events) : events }
    },
  }
}

/** 引擎里没有现成触发路径的事件：在预设状态上直接放一个手写事件（调用处注明原因） */
function staged(opts: BattleOpts, events: GameEvent[]): Scene {
  return {
    kind: 'battle',
    build() {
      const before = prepare(opts)
      return { before, state: before, events }
    },
  }
}

const withEnemy = (def: EnemyDef, patch: Partial<BattleState['enemies'][number]> = {}): BattleOpts => ({
  enemies: [def],
  tweak: (s) => Object.assign(s.enemies[0]!, patch),
})

function runScene(
  component: RunComponent,
  extra: { events?: GameEvent[]; goldTo?: number; gold?: number; screen?: RunState['screen'] } = {},
): Scene {
  return {
    kind: 'run',
    component,
    events: extra.events,
    goldTo: extra.goldTo,
    run() {
      const base = createRun({
        seed: 'sfx-editor',
        cards,
        deck: [...starterDeck],
        enemy: slime,
        enemies: slimeGroup,
        monsters: monsterPool,
        encounters: encounterList,        boss: slimeBoss,
        elite: drainer,
        rewardCards: [],
        potionIds: Object.keys(potions),
        relicIds: Object.keys(relics),
      })
      const run: RunState = { ...base, gold: extra.gold ?? 0, screen: extra.screen ?? 'rest' }
      return component === 'shop' ? { ...run, screen: 'shop', shop: generateShop(run) } : run
    },
  }
}

/** 按招式类型找意图下标，避免敌人改了出招顺序后场景失效 */
const intentOf = (enemy: EnemyDef, type: string) => enemy.intents.findIndex((i) => i.type === type)

const poison = (n: number): BattleOpts => ({ tweak: (s) => void (s.enemies[0]!.statuses.poison = n) })

/**
 * 槽位 -> 复现场景。战斗类尽量用真实 dispatch 产生事件；手写事件的有：
 * - battle.heal.enemy：没有现成的"敌人回血"卡牌 / 敌人招式
 * - battle.energyGained 用冥想牌（真实）
 * 战斗外的槽位直接挂真实界面组件（RunView / ShopView），由 SfxScene 重播时发事件或改金币。
 */
const SCENES: Record<string, () => Scene> = {
  'battle.cardPlayed.attack': () => scripted({ hand: ['strike'] }, [{ play: 'strike' }]),
  'battle.cardPlayed.skill': () => scripted({ hand: ['defend'] }, [{ play: 'defend' }]),
  'battle.cardPlayed.power': () => scripted({ hand: ['inflame'] }, [{ play: 'inflame' }]),

  'battle.cardDrawn': () => scripted({ hand: ['deepBreath'] }, [{ play: 'deepBreath' }]),
  'battle.reshuffled': () =>
    scripted(
      { hand: ['deepBreath'], tweak: (s) => ((s.drawPile = []), (s.discardPile = ['strike', 'strike', 'defend'])) },
      [{ play: 'deepBreath' }],
    ),
  'battle.handDiscarded': () => scripted({ hand: ['strike', 'defend'] }, ['end'], window('handDiscarded', 1)),
  'battle.energyGained': () => scripted({ hand: ['meditate'] }, [{ play: 'meditate' }]),
  'battle.turnStarted': () => scripted(withEnemy(slime, { intentIndex: 1 }), ['end'], window('turnStarted', 6)),

  'battle.damage.enemy': () => scripted({ hand: ['strike'] }, [{ play: 'strike' }]),
  'battle.damage.player': () => scripted({}, ['end'], window('enemyActed', 2)),
  'battle.damage.poison': () => scripted(poison(5), ['end'], window('statusTriggered', 2)),
  'battle.damage.trigger': () => scripted({ hand: ['burn'] }, ['end'], window('cardTriggered', 2)),
  'battle.damage.blocked': () =>
    scripted({ tweak: (s) => void (s.player.block = 20) }, ['end'], window('enemyActed', 3)),
  'battle.perfectBlock': () =>
    scripted({ tweak: (s) => void (s.player.block = 8) }, ['end'], window('enemyActed', 3)),

  'battle.block.player': () => scripted({ hand: ['defend'] }, [{ play: 'defend' }]),
  'battle.block.enemy': () => scripted(withEnemy(slime, { intentIndex: 1 }), ['end'], window('enemyActed', 2)),
  'battle.heal.player': () => scripted({ playerHp: 40 }, [{ potion: 'healPotion' }]),
  'battle.heal.enemy': () =>
    staged({ tweak: (s) => void (s.enemies[0]!.hp = 20) }, [
      { type: 'healed', target: 'enemy', amount: 8, enemyIndex: 0 },
    ]),

  'battle.status.buff': () => scripted({ hand: ['inflame'] }, [{ play: 'inflame' }]),
  'battle.status.debuff': () => scripted({ hand: ['weakenAll'] }, [{ play: 'weakenAll' }]),
  'battle.status.removed': () =>
    scripted({ tweak: (s) => void (s.enemies[0]!.statuses.weak = 1) }, ['end'], window('statusRemoved', 1)),
  'battle.status.triggered': () => scripted(poison(5), ['end'], window('statusTriggered', 2)),
  'battle.cardTriggered': () => scripted({ hand: ['burn'] }, ['end'], window('cardTriggered', 2)),
  'battle.enchantGrew': () => {
    const id = withEnchant('strike', 'grow')
    return scripted(
      {
        hand: [id],
        tweak: (s) => void (s.cards = { ...s.cards, ...resolveCards(cards, [id]) }),
      },
      [{ play: id }],
    )
  },

  'battle.cardAdded.bad': () => runScene('card-add', { events: [{ type: 'cardAdded', cardId: 'wound', count: 1 }] }),
  'battle.cardAdded.normal': () => runScene('card-add', { events: [{ type: 'cardAdded', cardId: 'strike', count: 1 }] }),

  'battle.potion': () => scripted({ hand: [], tweak: (s) => void (s.enemies[0]!.hp = 40) }, [{ potion: 'firePotion', target: 0 }]),

  'battle.enemy.attack': () => scripted({}, ['end'], window('enemyActed', 2)),
  'battle.enemy.act': () => scripted(withEnemy(slime, { intentIndex: 1 }), ['end'], window('enemyActed', 2)),
  'battle.enemy.spawn': () => scripted(withEnemy(summoner, { intentIndex: 1 }), ['end'], window('enemyActed', 2)),
  'battle.enemy.split': () =>
    scripted(withEnemy(splitSlime, { hp: 20, statuses: { split: 1 } }), ['end'], window('enemySpawned', 3)),
  'battle.enemy.flee': () => scripted(withEnemy(goblin, { intentIndex: intentOf(goblin, 'flee') }), ['end'], window('enemyActed', 3)),

  'battle.gold.stolen': () =>
    scripted(
      { enemies: [goblin], tweak: (s) => ((s.gold = 30), (s.enemies[0]!.intentIndex = intentOf(goblin, 'steal'))) },
      ['end'],
      window('enemyActed', 2),
    ),
  'battle.gold.returned': () =>
    scripted(
      {
        hand: ['strike'],
        enemies: [goblin],
        tweak: (s) => ((s.gold = 15), Object.assign(s.enemies[0]!, { hp: 5, stolenGold: 15 })),
      },
      [{ play: 'strike' }],
    ),

  'battle.end.won': () =>
    scripted({ hand: ['strike'], tweak: (s) => void (s.enemies[0]!.hp = 3) }, [{ play: 'strike' }]),
  'battle.end.lost': () => scripted({ playerHp: 1 }, ['end'], window('enemyActed', 3)),

  'run.gold.gain': () => runScene('hud-gold', { gold: 0, goldTo: 50 }),
  'run.gold.spend': () => runScene('hud-gold', { gold: 80, goldTo: 30 }),
  'run.shop.poor': () => runScene('shop', { gold: 0 }),
  'run.forge.upgrade': () =>
    runScene('relic-reveal', {
      events: [{ type: 'cardsUpgraded', cards: [{ from: 'strike', to: upgradedId('strike') }] }],
    }),
  'run.enchant': () =>
    runScene('relic-reveal', {
      events: [
        { type: 'relicGained', id: 'trainingGuide', cards: [{ from: 'strike', to: withEnchant('strike', 'grow') }] },
      ],
    }),
  'run.relic.gained': () =>
    runScene('relic-reveal', { events: [{ type: 'relicGained', id: 'ancientCoin' }] }),
  'run.hpLost': () => runScene('hurt', { events: [{ type: 'hpLost', amount: 8 }] }),
}

export function sceneFor(slot: string): Scene {
  const make = SCENES[slot]
  if (!make) throw new Error(`没有为槽位 ${slot} 登记复现场景`)
  return make()
}
