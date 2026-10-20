import { describe, expect, it } from 'vitest'
import { cards, starterDeck } from '@/data/cards'
import { slime, slimeBoss } from '@/data/enemies'
import type { GameMap } from './map'
import { createRun, dispatchRun, reachableIds, type RunState } from './run'

/** 手工搭一张小地图，便于精确控制节点类型 */
const testMap: GameMap = {
  seed: 'TEST',
  floors: [
    [{ id: '0-0', floor: 0, col: 0, type: 'monster', next: ['1-0', '1-1'] }],
    [
      { id: '1-0', floor: 1, col: 0, type: 'rest', next: ['2-0'] },
      { id: '1-1', floor: 1, col: 1, type: 'shop', next: ['2-0'] },
    ],
    [{ id: '2-0', floor: 2, col: 0, type: 'monster', next: ['boss'] }],
  ],
  boss: { id: 'boss', floor: 3, col: 3, type: 'boss', next: [] },
}

function newRun(seed = 'TEST'): RunState {
  return { ...createRun({ seed, cards, deck: starterDeck, enemy: slime }), map: testMap }
}

function send(run: RunState, action: Parameters<typeof dispatchRun>[1]) {
  return dispatchRun(run, action).state
}

/** 战斗胜利后：继续 -> 进入奖励界面 -> 直接结束奖励 */
function leaveRewards(run: RunState): RunState {
  return send(send(run, { type: 'continue' }), { type: 'finishRewards' })
}

/** 让当前战斗立刻胜利：敌人只剩 1 点血，手牌换成打击后打出 */
function winBattle(run: RunState, playerHp?: number): RunState {
  const battle = run.battle!
  const rigged = {
    ...run,
    battle: {
      ...battle,
      hand: ['strike'],
      enemies: [{ ...battle.enemies[0]!, hp: 1 }],
      player: { ...battle.player, hp: playerHp ?? battle.player.hp },
    },
  }
  return send(rigged, { type: 'battle', action: { type: 'playCard', handIndex: 0 } })
}

describe('run 选路', () => {
  it('出发前可选第 0 层任意节点', () => {
    expect(reachableIds(newRun())).toEqual(['0-0'])
  })

  it('不可达的节点被拒绝，状态不变', () => {
    const run = newRun()
    const result = dispatchRun(run, { type: 'chooseNode', id: '2-0' })
    expect(result.state).toBe(run)
    expect(result.events[0]?.type).toBe('invalidAction')
  })

  it('选择战斗节点进入战斗，并记录路径', () => {
    const run = send(newRun(), { type: 'chooseNode', id: '0-0' })
    expect(run.screen).toBe('battle')
    expect(run.current).toBe('0-0')
    expect(run.visited).toEqual(['0-0'])
    expect(run.battle).not.toBeNull()
  })

  it('战斗中不能选节点', () => {
    const run = send(newRun(), { type: 'chooseNode', id: '0-0' })
    expect(reachableIds(run)).toEqual([])
    const result = dispatchRun(run, { type: 'chooseNode', id: '1-0' })
    expect(result.state).toBe(run)
  })
})

describe('run 战斗', () => {
  it('胜利后继续回到地图，并继承血量', () => {
    let run = send(newRun(), { type: 'chooseNode', id: '0-0' })
    run = winBattle(run, 50)
    expect(run.battle!.phase).toBe('won')
    run = send(run, { type: 'continue' })
    expect(run.screen).toBe('reward')
    run = send(run, { type: 'finishRewards' })
    expect(run.screen).toBe('map')
    expect(run.battle).toBeNull()
    expect(run.player.hp).toBe(50)
    expect(reachableIds(run)).toEqual(['1-0', '1-1'])
  })

  it('下一场战斗从继承的血量开始', () => {
    let run = send(newRun(), { type: 'chooseNode', id: '0-0' })
    run = leaveRewards(winBattle(run, 50))
    run = send(run, { type: 'chooseNode', id: '1-1' })
    run = send(run, { type: 'leave' })
    run = send(run, { type: 'chooseNode', id: '2-0' })
    expect(run.battle!.player.hp).toBe(50)
  })

  it('战斗未结束时不能继续', () => {
    const run = send(newRun(), { type: 'chooseNode', id: '0-0' })
    const result = dispatchRun(run, { type: 'continue' })
    expect(result.state).toBe(run)
  })

  it('战败后继续进入失败界面', () => {
    let run = send(newRun(), { type: 'chooseNode', id: '0-0' })
    const battle = run.battle!
    run = { ...run, battle: { ...battle, player: { ...battle.player, hp: 1 } } }
    run = send(run, { type: 'battle', action: { type: 'endTurn' } })
    expect(run.battle!.phase).toBe('lost')
    run = send(run, { type: 'continue' })
    expect(run.screen).toBe('defeat')
  })

  it('通关：击败 Boss 进入胜利界面', () => {
    let run = send(newRun(), { type: 'chooseNode', id: '0-0' })
    run = leaveRewards(winBattle(run))
    run = send(run, { type: 'chooseNode', id: '1-1' })
    run = send(run, { type: 'leave' })
    run = send(run, { type: 'chooseNode', id: '2-0' })
    run = leaveRewards(winBattle(run))
    expect(reachableIds(run)).toEqual(['boss'])
    run = send(run, { type: 'chooseNode', id: 'boss' })
    expect(run.battle).not.toBeNull()
    run = leaveRewards(winBattle(run))
    expect(run.screen).toBe('victory')
  })

  it('同种子同节点的战斗初始手牌相同，不同种子通常不同', () => {
    const hand = (seed: string) =>
      send(newRun(seed), { type: 'chooseNode', id: '0-0' }).battle!.hand
    expect(hand('AAAA1111')).toEqual(hand('AAAA1111'))
    const hands = new Set(['S1', 'S2', 'S3', 'S4', 'S5'].map((s) => hand(s).join()))
    expect(hands.size).toBeGreaterThan(1)
  })
})

describe('run 休息与占位', () => {
  function atNode(id: string): RunState {
    let run = send(newRun(), { type: 'chooseNode', id: '0-0' })
    run = leaveRewards(winBattle(run, 40))
    return send(run, { type: 'chooseNode', id })
  }

  it('休息回复 30% 最大血量并回到地图', () => {
    let run = atNode('1-0')
    expect(run.screen).toBe('rest')
    run = send(run, { type: 'rest' })
    expect(run.screen).toBe('map')
    expect(run.player.hp).toBe(40 + 24)
  })

  it('休息回血不超过上限', () => {
    let run = atNode('1-0')
    run = { ...run, player: { ...run.player, hp: 75 } }
    run = send(run, { type: 'rest' })
    expect(run.player.hp).toBe(80)
  })

  it('休息点可以直接离开，不回血', () => {
    const run = send(atNode('1-0'), { type: 'leave' })
    expect(run.screen).toBe('map')
    expect(run.player.hp).toBe(40)
  })

  it('商店等占位节点可直接离开', () => {
    let run = atNode('1-1')
    expect(run.screen).toBe('placeholder')
    run = send(run, { type: 'leave' })
    expect(run.screen).toBe('map')
  })

  it('不在休息点时 rest 无效', () => {
    const run = newRun()
    expect(dispatchRun(run, { type: 'rest' }).state).toBe(run)
  })
})

describe('createRun', () => {
  it('用真实种子生成地图，初始满血在地图界面', () => {
    const run = createRun({ seed: 'REAL1234', cards, deck: starterDeck, enemy: slime })
    expect(run.screen).toBe('map')
    expect(run.player).toEqual({ hp: 80, maxHp: 80 })
    expect(run.map.seed).toBe('REAL1234')
    expect(reachableIds(run)).toEqual(['0-3'])
  })
})

describe('先古房', () => {
  function atAncient(): RunState {
    const real = createRun({ seed: 'ANCIENT1', cards, deck: starterDeck, enemy: slime })
    return send(real, { type: 'chooseNode', id: real.map.floors[0]![0]!.id })
  }

  it('起点是先古房，提供三个遗物，不触发战斗', () => {
    const run = atAncient()
    expect(run.screen).toBe('ancient')
    expect(run.battle).toBeNull()
    expect(run.ancientChoices).toEqual(['goldPouch', 'trainingGuide', 'roundShield'])
  })

  it('金钱袋：获得 150 金币和遗物，回到地图', () => {
    const run = send(atAncient(), { type: 'chooseAncient', id: 'goldPouch' })
    expect(run.gold).toBe(150)
    expect(run.relics).toEqual(['goldPouch'])
    expect(run.screen).toBe('map')
  })

  it('圆盾：获得遗物，并带入之后的战斗', () => {
    let run = send(atAncient(), { type: 'chooseAncient', id: 'roundShield' })
    expect(run.relics).toEqual(['roundShield'])
    const target = reachableIds(run)[0]!
    run = {
      ...run,
      map: {
        ...run.map,
        floors: run.map.floors.map((f) =>
          f.map((n) => (n.id === target ? { ...n, type: 'monster' as const } : n)),
        ),
      },
    }
    run = send(run, { type: 'chooseNode', id: target })
    expect(run.battle?.relics).toEqual(['roundShield'])
  })

  it('训练指南：先选牌附魔，选完才获得遗物，牌组中该牌变为附魔版', () => {
    let run = send(atAncient(), { type: 'chooseAncient', id: 'trainingGuide' })
    expect(run.screen).toBe('pick')
    expect(run.relics).toEqual([])
    run = send(run, { type: 'pickCards', deckIndexes: [0] })
    expect(run.screen).toBe('map')
    expect(run.relics).toEqual(['trainingGuide'])
    expect(run.content.deck[0]).toBe('strike*')
    expect(run.content.deck.filter((c) => c === 'strike')).toHaveLength(4)
  })

  it('训练指南：没有可附魔的牌时直接获得，无事发生', () => {
    const base = atAncient()
    const deck = base.content.deck.map((c) => `${c}*`)
    const run = send(
      { ...base, content: { ...base.content, deck } },
      { type: 'chooseAncient', id: 'trainingGuide' },
    )
    expect(run.screen).toBe('map')
    expect(run.relics).toEqual(['trainingGuide'])
    expect(run.content.deck).toEqual(deck)
  })

  it('已拥有的遗物可重复选择', () => {
    const base = atAncient()
    const run = send({ ...base, relics: ['goldPouch'] }, { type: 'chooseAncient', id: 'goldPouch' })
    expect(run.relics).toEqual(['goldPouch', 'goldPouch'])
    expect(run.gold).toBe(base.gold + 150)
  })

  it('作弊获得训练指南：有牌可附魔需在地图上选牌；无牌可附魔直接获得', () => {
    const map = { ...atAncient(), screen: 'map' as const }
    const picking = send(map, { type: 'cheatGrant', kind: 'relic', id: 'trainingGuide' })
    expect(picking.screen).toBe('pick')
    const deck = map.content.deck.map((c) => `${c}*`)
    const done = send(
      { ...map, content: { ...map.content, deck } },
      { type: 'cheatGrant', kind: 'relic', id: 'trainingGuide' },
    )
    expect(done.screen).toBe('map')
    expect(done.relics).toEqual(['trainingGuide'])
  })

  it('选牌由遗物决定，与房间无关：奖励界面领取训练指南同样选牌，选完回到奖励界面', () => {
    const base = atAncient()
    const rewarding: RunState = {
      ...base,
      screen: 'reward',
      ancientChoices: [],
      rewards: [{ type: 'relic', id: 'trainingGuide' }],
    }
    let run = send(rewarding, { type: 'claimReward', index: 0 })
    expect(run.screen).toBe('pick')
    expect(run.relics).toEqual([])
    run = send(run, { type: 'pickCards', deckIndexes: [0] })
    expect(run.screen).toBe('reward')
    expect(run.rewards).toEqual([])
    expect(run.relics).toEqual(['trainingGuide'])
    expect(run.content.deck[0]).toBe('strike*')
  })

  it('非法选择被拒绝', () => {
    const run = atAncient()
    expect(dispatchRun(run, { type: 'chooseAncient', id: 'nope' }).state).toBe(run)
    expect(dispatchRun(run, { type: 'pickCards', deckIndexes: [0] }).state).toBe(run)
  })
})

describe('Boss 节点出怪', () => {
  it('配置了 boss 时 Boss 节点只出这一只', () => {
    const run = {
      ...createRun({ seed: 'TEST', cards, deck: starterDeck, enemy: slime, boss: slimeBoss }),
      map: testMap,
    }
    const r = send(run, { type: 'chooseNode', id: 'boss', god: true })
    expect(r.battle!.enemies).toHaveLength(1)
    expect(r.battle!.enemies[0]!.def.id).toBe('slime-boss')
    expect(r.battle!.enemies[0]!.statuses.split).toBe(1)
  })
  it('没配置 boss 时仍用原来的敌人', () => {
    const r = send(newRun(), { type: 'chooseNode', id: 'boss', god: true })
    expect(r.battle!.enemies[0]!.def.id).toBe('slime')
  })
})
