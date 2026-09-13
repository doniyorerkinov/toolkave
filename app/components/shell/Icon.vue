<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity, ArrowRight, BadgeCheck, Banknote, Binary, Braces, Calculator, Calendar, ChevronRight, Clock, Code, Coins,
  Contrast, EyeOff, FileDown, FileText, FileType, FormInput, GitCompare, Hash, Highlighter, Image, Info, Key, Layers,
  Layers2, Lock, MapPinOff, Minimize, Palette, PanelTop, PenTool, Percent, QrCode, Repeat, RotateCw, Ruler, Scaling, Scan, ScanText,
  Scissors, ShieldCheck, Smartphone, Sparkles, Stamp, Table, Trash, Type, Unlock, Wrench, Youtube, Zap
} from 'lucide-vue-next'

/**
 * Registry icon names → lucide components. The registry stores kebab-case
 * names so it stays free of Vue imports; the map lives here, and an unknown
 * name falls back to a generic mark rather than rendering nothing.
 */
const ICONS: Record<string, Component> = {
  activity: Activity, 'arrow-right': ArrowRight, 'badge-check': BadgeCheck, banknote: Banknote, binary: Binary,
  braces: Braces, calculator: Calculator, calendar: Calendar, 'chevron-right': ChevronRight, clock: Clock, code: Code,
  coins: Coins, contrast: Contrast, 'eye-off': EyeOff, 'file-down': FileDown, 'file-text': FileText, 'file-type': FileType,
  'form-input': FormInput, 'git-compare': GitCompare, hash: Hash, highlighter: Highlighter, image: Image, info: Info,
  key: Key, layers: Layers, 'layers-2': Layers2, lock: Lock, 'map-pin-off': MapPinOff, minimize: Minimize, palette: Palette, 'panel-top': PanelTop,
  'pen-tool': PenTool, percent: Percent, 'qr-code': QrCode, repeat: Repeat, 'rotate-cw': RotateCw, ruler: Ruler,
  scaling: Scaling, scan: Scan, 'scan-text': ScanText, scissors: Scissors, 'shield-check': ShieldCheck,
  smartphone: Smartphone, sparkles: Sparkles, stamp: Stamp, table: Table, trash: Trash, type: Type, unlock: Unlock,
  wrench: Wrench, youtube: Youtube, zap: Zap
}

const props = withDefaults(defineProps<{ name: string; size?: number; strokeWidth?: number }>(), {
  size: 20,
  strokeWidth: 2
})

const component = computed(() => ICONS[props.name] ?? Wrench)
</script>

<template>
  <component :is="component" :size="size" :stroke-width="strokeWidth" aria-hidden="true" />
</template>
