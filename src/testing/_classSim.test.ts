import { it } from 'vitest'
import { cards, colorlessRewardIds } from '@/data/cards'
import { characterById, CHARACTER_RELIC_IDS } from '@/data/characters'
import { encounterList, monsterPool, drainer, slime, slimeBoss, slimeGroup } from '@/data/enemies'
import { events as eventDefs } from '@/data/events'
import { potions, relics } from '@/data/items'
import { ANCIENT_RELIC_IDS, createRun, dispatchRun, reachableIds, type RunState } from '@/engine/run'
import { findNode } from '@/engine/map'
import { currentIntent } from '@/engine/intents'
import { enemyAttack } from '@/engine/blades'
import type { BattleState } from '@/engine/types'

// 临时探针：同一个通用机器人跑各职业整局，比较强度
const N = Number(process.env.SIM_N ?? 20)
const CLASSES = (process.env.SIM_CLASSES ?? 'warrior,plagueDoctor,swordSaint,ancientTree').split(',')
const raw = (id: string) => id.replace(/[+*~#].*$/, '')

const newRun = (cid: string, seed: string): RunState => {
  const ch = characterById(cid)
  return createRun({
    seed, cards, deck: ch.deck, character: ch.id, startRelics: ch.relics,
    enemy: slime, enemies: slimeGroup, monsters: monsterPool, encounters: encounterList,
    boss: slimeBoss, elite: drainer, rewardCards: ch.rewardCards, colorlessCards: colorlessRewardIds,
    potionIds: Object.keys(potions), events: eventDefs,
    relicIds: Object.keys(relics).filter((id) => !ANCIENT_RELIC_IDS.includes(id) && !CHARACTER_RELIC_IDS.includes(id)),
  })
}

const alive = (e: BattleState['enemies'][number]) => e.hp > 0 && !e.fled
function incoming(s: BattleState): number {
  let sum = 0
  for (const e of s.enemies) {
    if (!alive(e) || (e.statuses.stunned ?? 0) > 0) continue
    const it = currentIntent(e, s.enemies)
    if (!it) continue
    for (const a of [it, ...((it as { also?: typeof it[] }).also ?? [])]) {
      if (a.type === 'attack') sum += enemyAttack(a.damage, e, { block: 0, statuses: s.player.statuses }).damage * (a.hits ?? 1)
      if (a.type === 'deathStrike') sum += enemyAttack(a.damage, e, { block: 0, statuses: s.player.statuses }).damage
    }
  }
  return sum
}
const DEBUFF_W: Record<string, number> = { vulnerable: 3, weak: 3, poison: 1.5, parasite: 1.5, burn: 1.2, frost: 2, stunned: 8 }
function value(s: BattleState): number {
  let v = 0
  for (const e of s.enemies) {
    if (!alive(e)) { v += 25 + e.def.maxHp * 0.3; continue }
    v -= e.hp + e.block * 0.5
    for (const [k, n] of Object.entries(e.statuses)) v += (DEBUFF_W[k] ?? 0) * Math.min(n ?? 0, 15)
    if ((e.statuses.strength ?? 0) < 0) v += -(e.statuses.strength ?? 0) * 3
  }
  if (s.phase === 'won') v += 1000
  const unblocked = Math.max(0, incoming(s) - s.player.block)
  v -= unblocked * 1.4 + (s.player.maxHp - s.player.hp) * 1.4
  v += s.player.energy * 1.5 + s.hand.length * 1.5
  for (const [k, n] of Object.entries(s.player.statuses)) {
    if (DEBUFF_W[k]) v -= DEBUFF_W[k]! * (n ?? 0)
    else if (k === 'strength' || k === 'dexterity') v += 4 * (n ?? 0)
    else v += 2 * Math.min(n ?? 0, 5)
  }
  v += (s.powers?.length ?? 0) * 6
  return v
}

interface Battle { kind: string; enemies: string; won: boolean; hpLost: number; turns: number }
function playBattle(run: RunState, played: Record<string, number>): RunState {
  let state = run
  let guard = 0
  const tryAct = (st: RunState, action: object) => {
    const r = dispatchRun(st, { type: 'battle', action } as Parameters<typeof dispatchRun>[1])
    return r.events.some((e) => e.type === 'invalidAction') ? null : r.state
  }
  while (state.screen === 'battle' && state.battle && guard++ < 800) {
    const b = state.battle
    if (b.phase !== 'player') break
    if (b.pending) {
      const p = b.pending
      const picks = p.kind === 'exhaust' ? Array.from({ length: Math.min(p.count, b.hand.length) }, (_, i) => i) : p.kind === 'scry' ? [] : [0]
      state = tryAct(state, { type: 'resolve', picks }) ?? tryAct(state, { type: 'resolve', picks: [] }) ?? state
      if (state.battle?.pending === b.pending) break
      continue
    }
    const base = value(b)
    let best: { st: RunState; score: number; id: string } | null = null
    const targets = b.enemies.map((e, i) => (alive(e) ? i : -1)).filter((i) => i >= 0)
    for (let hi = 0; hi < b.hand.length; hi++) {
      for (const t of targets.length ? targets : [0]) {
        const nx = tryAct(state, { type: 'playCard', handIndex: hi, target: t })
        if (!nx?.battle) continue
        const score = value(nx.battle) - base
        if (!best || score > best.score) best = { st: nx, score, id: b.hand[hi]! }
      }
    }
    if (best && best.score > -1) {
      state = best.st
      played[raw(best.id)] = (played[raw(best.id)] ?? 0) + 1
      continue
    }
    const ms = b.minions ?? []
    const mi = ms.findIndex((m, i) => m.hp > 0 && !b.commanded?.includes(i))
    if (mi >= 0) { const nx = tryAct(state, { type: 'command', minion: mi, choice: 'attack' }); if (nx) { state = nx; continue } }
    const nx = tryAct(state, { type: 'endTurn' })
    if (!nx) break
    state = nx
  }
  return state
}

const PICK: Record<string, number> = { gold: 3, blue: 2, white: 1 }
function playRun(cid: string, seed: string) {
  let run = newRun(cid, seed)
  const battles: Battle[] = []
  const played: Record<string, number> = {}
  let steps = 0
  const go = (a: Parameters<typeof dispatchRun>[1]) => {
    const r = dispatchRun(run, a)
    const ok = !r.events.some((e) => e.type === 'invalidAction')
    if (ok) run = r.state
    return ok
  }
  while (run.screen !== 'victory' && run.screen !== 'defeat' && steps++ < 3000) {
    if (run.potionOffer?.length) { if (!go({ type: 'takePotion', index: 0 })) go({ type: 'skipPotion' }); continue }
    switch (run.screen) {
      case 'map': {
        const ids = reachableIds(run)
        const lowHp = run.player.hp < run.player.maxHp * 0.5
        const rank = (id: string) => {
          const t = findNode(run.map, id)?.type
          if (lowHp) return t === 'rest' ? 0 : t === 'elite' ? 9 : 5
          const eliteOk = run.player.hp >= run.player.maxHp * 0.75
          return t === 'elite' ? (eliteOk ? 1 : 8) : t === 'monster' ? 2 : t === 'rest' ? 3 : 4
        }
        go({ type: 'chooseNode', id: [...ids].sort((a, z) => rank(a) - rank(z))[0]! })
        break
      }
      case 'ancient': go({ type: 'chooseAncient', id: run.ancientChoices[0]! }); break
      case 'pick': if (!go({ type: 'pickCards', deckIndexes: [0] })) go({ type: 'pickCards', deckIndexes: [] }); break
      case 'battle': {
        const node = run.current ?? '?'
        const kind = `${run.stage ?? 1}-${findNode(run.map, node)?.type ?? 'event'}`
        const hp0 = run.player.hp
        const enemies = run.battle!.enemies.map((e) => e.def.name).join('+')
        run = playBattle(run, played)
        const phase = run.battle?.phase
        const turns = run.battle?.turn ?? 0
        go({ type: 'continue' })
        battles.push({ kind, enemies, won: phase === 'won', hpLost: hp0 - run.player.hp, turns })
        if (run.screen === 'battle') steps = 99999
        break
      }
      case 'reward': {
        for (let i = run.rewards.length - 1; i >= 0; i--) {
          const r = run.rewards[i]!
          if (r.type === 'cards') {
            const best = r.choices.map((id, idx) => ({ idx, s: PICK[cards[raw(id)]?.rarity ?? ''] ?? 0 })).sort((a, z) => z.s - a.s)[0]!
            go({ type: 'claimReward', index: i, pick: best.idx })
          } else go({ type: 'claimReward', index: i })
        }
        if (!go({ type: 'finishRewards' })) go({ type: 'continue' })
        break
      }
      case 'rest':
        if (run.player.hp < run.player.maxHp * 0.6) go({ type: 'rest' })
        else if (!go({ type: 'campfireSpecial' })) go({ type: 'rest' })
        if (run.screen === 'rest') go({ type: 'leave' })
        break
      case 'forge': if (!go({ type: 'forgeCard', deckIndex: 0 })) go({ type: 'leave' }); break
      case 'shop':
        go({ type: 'buyShop', kind: 'relic', index: 0 }) || go({ type: 'buyShop', kind: 'card', index: 0 }) || go({ type: 'buyShop', kind: 'potion', index: 0 })
        go({ type: 'leave' })
        break
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
      case 'eventPick': if (!go({ type: 'eventPickCard', deckIndex: 0 })) go({ type: 'leave' }); break
      default: if (!go({ type: 'leave' })) go({ type: 'continue' })
    }
  }
  return { result: run.screen, stage: run.stage ?? 1, floors: run.visited.length, battles, played, deck: run.content.deck.map(raw), hp: run.player.hp, maxHp: run.player.maxHp }
}

it('职业强度模拟', () => {
  const out: string[] = []
  for (const cid of CLASSES) {
    const runs = Array.from({ length: N }, (_, i) => playRun(cid, `SIM${i + 1}`))
    const wins = runs.filter((r) => r.result === 'victory').length
    const all = runs.flatMap((r) => r.battles)
    const byKind: Record<string, Battle[]> = {}
    all.forEach((b) => (byKind[b.kind] ??= []).push(b))
    const deaths: Record<string, number> = {}
    runs.forEach((r) => { const l = r.battles.at(-1); if (r.result === 'defeat' && l) deaths[`${l.kind}:${l.enemies}`] = (deaths[`${l.kind}:${l.enemies}`] ?? 0) + 1 })
    const byEnc: Record<string, Battle[]> = {}
    all.forEach((b) => (byEnc[`${b.kind}:${b.enemies}`] ??= []).push(b))
    const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1)
    out.push(`\n=== ${characterById(cid).name}: 胜率 ${wins}/${N}  第二幕到达 ${runs.filter((r) => r.stage === 2).length}  平均进度 ${avg(runs.map((r) => (r.stage - 1) * 16 + r.floors))}/32  平均战斗 ${avg(runs.map((r) => r.battles.length))}  终局牌组 ${avg(runs.map((r) => r.deck.length))}`)
    for (const [k, bs] of Object.entries(byKind)) out.push(`  ${k}: ${bs.length}场 胜${bs.filter((b) => b.won).length}  平均掉血 ${avg(bs.map((b) => b.hpLost))}  平均回合 ${avg(bs.map((b) => b.turns))}`)
    out.push(`  死因: ${Object.entries(deaths).sort((a, z) => z[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('  ') || '无'}`)
    out.push(`  各遭遇(场次/均掉血/均回合): ${Object.entries(byEnc).sort((a, z) => z[1].length - a[1].length).map(([k, bs]) => `${k} ${bs.length}/${avg(bs.map((b) => b.hpLost))}/${avg(bs.map((b) => b.turns))}`).join(' | ')}`)
    if (cid === 'warrior') {
      const tot: Record<string, number> = {}
      runs.forEach((r) => Object.entries(r.played).forEach(([k, v]) => (tot[k] = (tot[k] ?? 0) + v)))
      out.push(`  出牌: ${Object.entries(tot).sort((a, z) => z[1] - a[1]).map(([k, v]) => `${cards[k]?.name ?? k}×${v}`).join(' ')}`)
    }
  }
  console.log(out.join('\n'))
}, 1_800_000)
