import { describe, expect, it } from 'vitest'
import { cards, colorlessRewardIds } from '@/data/cards'
import { characterById, CHARACTER_RELIC_IDS } from '@/data/characters'
import { encounterList, monsterPool, drainer, slime, slimeBoss, slimeGroup } from '@/data/enemies'
import { events as eventDefs } from '@/data/events'
import { potions, relics } from '@/data/items'
import { ANCIENT_RELIC_IDS, createRun, dispatchRun, reachableIds, type RunState } from '@/engine/run'
import { findNode } from '@/engine/map'
import type { BattleState } from '@/engine/types'

/**
 * 参天古树整局对战（机器人自动打）：验证运转端不卡死、不抛错，并打印每局的表现。
 * 机器人只做合法操作，不用作弊；节点选择、奖励、商店、事件都走真实引擎。
 */
const character = characterById('ancientTree')
const newRun = (seed: string): RunState =>
  createRun({
    seed,
    cards,
    deck: character.deck,
    character: character.id,
    startRelics: character.relics,
    enemy: slime,
    enemies: slimeGroup,
    monsters: monsterPool,
    encounters: encounterList,
    boss: slimeBoss,
    elite: drainer,
    rewardCards: character.rewardCards,
    colorlessCards: colorlessRewardIds,
    potionIds: Object.keys(potions),
    events: eventDefs,
    relicIds: Object.keys(relics).filter(
      (id) => !ANCIENT_RELIC_IDS.includes(id) && !CHARACTER_RELIC_IDS.includes(id),
    ),
  })

interface BattleLog {
  node: string
  kind: string
  enemies: string
  turns: number
  hpLost: number
  won: boolean
  maxParasite: number
  maxMinions: number
  cardsPlayed: number
  played: Record<string, number>
}
interface RunLog {
  seed: string
  result: string
  floors: number
  battles: BattleLog[]
  deckSize: number
  relics: string[]
  maxHp: number
  steps: number
}

const RARITY_SCORE: Record<string, number> = { gold: 3, blue: 2, white: 1 }
/** 出牌优先级：先铺寄生 / 过牌 / 回能，再收割（引爆、转化、蚕食），最后才是格挡和普通伤害 */
const SETUP = ['gainEnergy', 'draw', 'applyStatus', 'parasiteStatus', 'spreadParasite', 'drawIfParasite']
const HARVEST = ['parasiteBurst', 'convertCorpse', 'devourParasite', 'consumeParasite']
function cardScore(def: { effects: { type: string }[]; cost: number | 'X' } | undefined): number {
  if (!def) return 0
  const types = def.effects.map((e) => e.type)
  let score = types.some((t) => SETUP.includes(t)) ? 30 : types.some((t) => HARVEST.includes(t)) ? 20 : 10
  if (def.cost === 0) score += 5
  return score
}
const living = (s: BattleState) => s.enemies.map((e, i) => (e.hp > 0 && !e.fled ? i : -1)).filter((i) => i >= 0)

function playBattle(run: RunState, log: BattleLog): RunState {
  let state = run
  let guard = 0
  const send = (action: Parameters<typeof dispatchRun>[1] & { type: 'battle' }) => {
    const r = dispatchRun(state, action)
    const ok = !r.events.some((e) => e.type === 'invalidAction')
    if (ok) state = r.state
    return ok
  }
  while (state.screen === 'battle' && state.battle && guard++ < 600) {
    const b = state.battle
    if (b.phase !== 'player') break
    log.turns = b.turn
    log.maxParasite = Math.max(log.maxParasite, ...b.enemies.map((e) => e.statuses.parasite ?? 0))
    log.maxMinions = Math.max(log.maxMinions, (b.minions ?? []).filter((m) => m.hp > 0).length)

    if (b.pending) {
      const p = b.pending
      const picks =
        p.kind === 'exhaust' ? Array.from({ length: Math.min(p.count, b.hand.length) }, (_, i) => i)
        : p.kind === 'copy' ? [0]
        : p.kind === 'scry' ? []
        : [0]
      if (!send({ type: 'battle', action: { type: 'resolve', picks } })) {
        send({ type: 'battle', action: { type: 'resolve', picks: [] } })
      }
      continue
    }

    const targets = living(b)
    let acted = false
    // 先打便宜的、再打贵的；每次只要成功就重新评估
    const order = b.hand
      .map((id, i) => ({ id, i, def: b.cards[id.replace(/[+*~#].*$/, '')] }))
      .sort((a, z) => cardScore(z.def) - cardScore(a.def))
    for (const c of order) {
      for (const t of targets) {
        if (send({ type: 'battle', action: { type: 'playCard', handIndex: c.i, target: t } })) {
          log.cardsPlayed++
          const pid = c.id.replace(/[+*~#].*$/, '')
          log.played[pid] = (log.played[pid] ?? 0) + 1
          acted = true
          break
        }
      }
      if (acted) break
    }
    if (acted) continue

    // 没有牌可打：指挥随从（攻击），然后结束回合
    const ms = b.minions ?? []
    const mi = ms.findIndex((m, i) => m.hp > 0 && !b.commanded?.includes(i))
    if (mi >= 0 && send({ type: 'battle', action: { type: 'command', minion: mi, choice: 'attack' } })) continue
    if (!send({ type: 'battle', action: { type: 'endTurn' } })) break
  }
  return state
}

function playRun(seed: string): RunLog {
  let run = newRun(seed)
  const battles: BattleLog[] = []
  let steps = 0
  const go = (a: Parameters<typeof dispatchRun>[1]) => {
    const r = dispatchRun(run, a)
    const ok = !r.events.some((e) => e.type === 'invalidAction')
    if (ok) run = r.state
    return ok
  }

  while (run.screen !== 'victory' && run.screen !== 'defeat' && steps++ < 3000) {
    // 不变量：生命值合法
    expect(Number.isFinite(run.player.hp), `hp NaN @${run.screen}`).toBe(true)
    expect(run.player.hp).toBeLessThanOrEqual(run.player.maxHp)
    if (run.potionOffer?.length) {
      if (!go({ type: 'takePotion', index: 0 })) go({ type: 'skipPotion' })
      continue
    }
    switch (run.screen) {
      case 'map': {
        const ids = reachableIds(run)
        expect(ids.length, `地图死路 @${run.current}`).toBeGreaterThan(0)
        const lowHp = run.player.hp < run.player.maxHp * 0.5
        const rank = (id: string) => {
          const t = findNode(run.map, id)?.type
          if (lowHp) return t === 'rest' ? 0 : t === 'elite' ? 9 : 5
          return t === 'elite' ? 1 : t === 'monster' ? 2 : t === 'rest' ? 3 : 4
        }
        const pick = [...ids].sort((a, z) => rank(a) - rank(z))[0]!
        expect(go({ type: 'chooseNode', id: pick })).toBe(true)
        break
      }
      case 'ancient':
        expect(go({ type: 'chooseAncient', id: run.ancientChoices[0]! })).toBe(true)
        break
      case 'pick':
        if (!go({ type: 'pickCards', deckIndexes: [0] })) go({ type: 'pickCards', deckIndexes: [] })
        break
      case 'battle': {
        const node = run.current ?? '?'
        const type = findNode(run.map, node)?.type ?? 'event'
        const hp0 = run.player.hp
        const log: BattleLog = {
          node,
          kind: type,
          enemies: run.battle!.enemies.map((e) => e.def.name).join('+'),
          turns: 1,
          hpLost: 0,
          won: false,
          maxParasite: 0,
          maxMinions: 0,
          cardsPlayed: 0,
          played: {},
        }
        run = playBattle(run, log)
        const phase = run.battle?.phase
        expect(['won', 'lost'], `战斗没有结束 @${node}（phase=${phase}）`).toContain(phase)
        go({ type: 'continue' })
        log.won = phase === 'won'
        log.hpLost = hp0 - run.player.hp
        battles.push(log)
        expect(run.screen, `战斗卡住 @${node}`).not.toBe('battle')
        break
      }
      case 'reward': {
        for (let i = run.rewards.length - 1; i >= 0; i--) {
          const r = run.rewards[i]!
          if (r.type === 'cards') {
            const best = r.choices
              .map((id, idx) => ({ idx, s: RARITY_SCORE[cards[id.replace(/[+*~#].*$/, '')]?.rarity ?? ''] ?? 0 }))
              .sort((a, z) => z.s - a.s)[0]!
            go({ type: 'claimReward', index: i, pick: best.idx })
          } else go({ type: 'claimReward', index: i })
        }
        if (!go({ type: 'finishRewards' })) go({ type: 'continue' })
        break
      }
      case 'rest': {
        if (run.player.hp < run.player.maxHp * 0.6) go({ type: 'rest' })
        else if (!go({ type: 'campfireSpecial' })) go({ type: 'rest' })
        if (run.screen === 'rest') go({ type: 'leave' })
        break
      }
      case 'forge':
        if (!go({ type: 'forgeCard', deckIndex: 0 })) go({ type: 'leave' })
        break
      case 'shop': {
        const sh = run.shop
        let bought = true
        while (sh && bought) {
          bought =
            go({ type: 'buyShop', kind: 'relic', index: 0 }) ||
            go({ type: 'buyShop', kind: 'card', index: 0 }) ||
            go({ type: 'buyShop', kind: 'potion', index: 0 })
          if (bought) break
        }
        go({ type: 'leave' })
        break
      }
      case 'event': {
        const ev = run.event
        if (ev && ev.optionIndex === null) {
          const def = run.content.events!.find((e) => e.id === ev.id)!
          let ok = false
          for (let i = 0; i < def.options.length && !ok; i++) ok = go({ type: 'chooseEventOption', index: i })
          if (!ok) go({ type: 'leave' })
        } else if (!go({ type: 'continue' })) go({ type: 'leave' })
        break
      }
      case 'eventPick':
        if (!go({ type: 'eventPickCard', deckIndex: 0 })) go({ type: 'leave' })
        break
      default:
        if (!go({ type: 'leave' })) go({ type: 'continue' })
    }
  }

  const floors = run.visited.length
  return {
    seed,
    result: run.screen,
    floors,
    battles,
    deckSize: run.content.deck.length,
    relics: run.relics,
    maxHp: run.player.maxHp,
    steps,
  }
}

const SEEDS = ['TREE1', 'TREE2', 'TREE3']

describe('参天古树 · 3 局整局对战', () => {
  for (const seed of SEEDS) {
    it(`种子 ${seed}：能打到终局，且全程不抛错`, () => {
      const log = playRun(seed)
      const lines = [
        `\n=== ${seed}: ${log.result}  节点 ${log.floors}  战斗 ${log.battles.length}  牌组 ${log.deckSize}  最大生命 ${log.maxHp}  步数 ${log.steps}`,
        `遗物: ${log.relics.join(', ')}`,
        `用过的牌: ${Object.entries(log.battles.reduce<Record<string, number>>((m, b) => (Object.entries(b.played).forEach(([k, v]) => (m[k] = (m[k] ?? 0) + v)), m), {})).map(([k, v]) => `${k}×${v}`).join(' ')}`,
        ...log.battles.map(
          (b) =>
            `  [${b.node} ${b.kind}] ${b.enemies}  ${b.won ? '胜' : '负'}  ${b.turns}回合  出牌${b.cardsPlayed}  掉血${b.hpLost}  寄生峰值${b.maxParasite}  随从峰值${b.maxMinions}`,
        ),
      ]
      console.log(lines.join('\n'))
      expect(['victory', 'defeat']).toContain(log.result)
      expect(log.battles.length).toBeGreaterThan(0)
    })
  }
})
