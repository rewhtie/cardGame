import type { SfxMap } from '@/composables/sfxResolve'

export const sfxMap: SfxMap = {
  'battle.block.enemy': { files: ['block-1.ogg', 'block-2.ogg'] },
  'battle.block.player': { files: ['block-1.ogg', 'block-2.ogg'] },
  'battle.cardAdded.bad': { files: ['curse-1.ogg', 'curse-2.ogg'] },
  'battle.cardAdded.normal': { files: ['card-1.ogg', 'card-2.ogg', 'card-3.ogg'] },
  'battle.damage.blocked': { files: ['block-1.ogg', 'block-2.ogg'] },
  'battle.damage.enemy': { files: ['hit-1.ogg', 'hit-2.ogg'] },
  'battle.damage.player': { files: ['hurt-1.ogg', 'hurt-2.ogg'] },
  'battle.damage.poison': { files: ['hit-1.ogg', 'hit-2.ogg'] },
  'battle.damage.trigger': { files: ['hurt-1.ogg', 'hurt-2.ogg'] },
  'battle.enemy.split': { synth: 'split' },
  'battle.gold.stolen': { files: ['coin-1.ogg'] },
  'battle.heal.enemy': { files: ['heal-2.ogg'] },
  'battle.heal.player': { files: ['heal-2.ogg'] },
  'run.enchant': { files: ['enchant-1.mp3'] },
  'run.forge.upgrade': { files: ['forge-1.ogg', 'forge-2.ogg'], maxSeconds: 0.5 },
  'run.gold.gain': { files: ['coin-1.ogg', 'coin-2.ogg'] },
  'run.gold.spend': { files: ['coin-2.ogg'] },
}
