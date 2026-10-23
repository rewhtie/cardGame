<script setup lang="ts">
import { computed } from 'vue'

/**
 * 用固定的 SVG（Twemoji）渲染表情，避免各平台系统字体外观不一致。
 * e 可以是单个表情、夹着文字的字符串（'💰 12'），或 src/assets/emoji 下的文件名（如 potion-yellow）。
 * 没有对应 SVG 的字符（如 ✎）按原文显示。
 */
const props = defineProps<{ e?: string }>()

const files = import.meta.glob('@/assets/emoji/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const urls = new Map<string, string>(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
)

/** 表情字符 → Twemoji 文件名：不含 ZWJ 的序列去掉 FE0F，码点小写并以 - 连接 */
function key(s: string) {
  let cps = [...s].map((c) => c.codePointAt(0)!)
  if (!cps.includes(0x200d)) cps = cps.filter((c) => c !== 0xfe0f)
  return cps.map((c) => c.toString(16)).join('-')
}

const EMOJI_RE =
  /\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*/gu

interface Part {
  text: string
  url?: string
}

const parts = computed<Part[]>(() => {
  const s = props.e ?? ''
  const whole = urls.get(s)
  if (whole) return [{ text: s, url: whole }]
  const out: Part[] = []
  let last = 0
  for (const m of s.matchAll(EMOJI_RE)) {
    const url = urls.get(key(m[0]))
    if (!url) continue
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    out.push({ text: m[0], url })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out
})
</script>

<template>
  <template v-for="(p, i) in parts" :key="i">
    <img v-if="p.url" :src="p.url" :alt="p.text" class="emoji" draggable="false" />
    <template v-else>{{ p.text }}</template>
  </template>
</template>

<style>
/* 与周围文字等高；全局样式，所有用到 Emoji 的位置共用 */
.emoji {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
}
</style>
