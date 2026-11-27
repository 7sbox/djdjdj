import type { AffixDef } from '../types';

/**
 * 18 条词条，五族。
 *
 * 刻意砍掉的东西（来自设计讨论）：
 * - 所有「百分比攻击」——一条就能把其余 17 条变成摆设
 * - 「雷击」以外的第四个元素（三种元素的节奏已经够了）
 * - 除吸血外的所有回复词条
 *
 * 严格部位专属：slots 字段决定一件装备能出什么。
 */
export const AFFIXES: readonly AffixDef[] = [
  // ── 攻击族 ────────────────────────────────────────────────
  {
    id: 'crit_rate',
    name: '暴击率',
    family: 'attack',
    percent: true,
    rollMin: 0.02,
    rollMax: 0.05,
    slots: ['hands', 'weapon', 'ring'],
    suffix: '%',
  },
  {
    id: 'crit_dmg',
    name: '暴击伤害',
    family: 'attack',
    percent: true,
    rollMin: 0.15,
    rollMax: 0.4,
    slots: ['weapon', 'ring'],
    suffix: '%',
  },
  {
    id: 'attack_speed',
    name: '攻击速度',
    family: 'attack',
    percent: true,
    rollMin: 0.03,
    rollMax: 0.08,
    slots: ['hands'],
    suffix: '%',
  },
  {
    id: 'armor_pen',
    name: '破甲',
    family: 'attack',
    percent: true,
    rollMin: 0.05,
    rollMax: 0.12,
    slots: ['weapon', 'hands'],
    suffix: '%',
  },

  // ── 防御族 ────────────────────────────────────────────────
  {
    id: 'hp_flat',
    name: '生命',
    family: 'defense',
    percent: false,
    rollMin: 20,
    rollMax: 40,
    slots: ['chest', 'waist', 'head', 'feet'],
  },
  {
    id: 'dodge',
    name: '闪避',
    family: 'defense',
    percent: true,
    rollMin: 0.02,
    rollMax: 0.06,
    slots: ['feet', 'waist'],
    suffix: '%',
  },
  {
    id: 'damage_reduce',
    name: '减伤',
    family: 'defense',
    percent: true,
    rollMin: 0.02,
    rollMax: 0.05,
    slots: ['chest', 'head'],
    suffix: '%',
  },
  {
    id: 'thorns',
    name: '反伤',
    family: 'defense',
    percent: false,
    rollMin: 4,
    rollMax: 10,
    slots: ['chest', 'head'],
  },

  // ── 元素族 ────────────────────────────────────────────────
  {
    id: 'burn',
    name: '灼烧',
    family: 'element',
    percent: false,
    rollMin: 6,
    rollMax: 14,
    slots: ['weapon', 'ring'],
  },
  {
    id: 'freeze',
    name: '冰冻',
    family: 'element',
    percent: false,
    rollMin: 5,
    rollMax: 12,
    slots: ['weapon', 'ring'],
  },
  {
    id: 'poison',
    name: '中毒',
    family: 'element',
    percent: false,
    rollMin: 7,
    rollMax: 16,
    slots: ['weapon', 'ring'],
  },

  // ── 武学族 ────────────────────────────────────────────────
  {
    id: 'martial_sword',
    name: '剑法等级',
    family: 'martial',
    percent: false,
    rollMin: 1,
    rollMax: 1,
    slots: ['weapon', 'ring'],
    minRarity: 'blue',
  },
  {
    id: 'martial_blade',
    name: '刀法等级',
    family: 'martial',
    percent: false,
    rollMin: 1,
    rollMax: 1,
    slots: ['weapon', 'ring'],
    minRarity: 'blue',
  },
  {
    id: 'cooldown_reduce',
    name: '冷却缩减',
    family: 'martial',
    percent: true,
    rollMin: 0.03,
    rollMax: 0.08,
    slots: ['head', 'waist'],
    suffix: '%',
  },

  // ── 功能族 ────────────────────────────────────────────────
  {
    id: 'drop_rate',
    name: '掉落率',
    family: 'utility',
    percent: true,
    rollMin: 0.05,
    rollMax: 0.12,
    slots: ['ring', 'feet'],
    suffix: '%',
  },
  {
    id: 'gold_find',
    name: '金币',
    family: 'utility',
    percent: true,
    rollMin: 0.08,
    rollMax: 0.2,
    slots: ['ring', 'waist'],
    suffix: '%',
  },
  {
    id: 'lifesteal',
    name: '吸血',
    family: 'utility',
    percent: true,
    rollMin: 0.02,
    rollMax: 0.05,
    slots: ['hands', 'weapon'],
    suffix: '%',
  },
  {
    id: 'exp_bonus',
    name: '经验',
    family: 'utility',
    percent: true,
    rollMin: 0.05,
    rollMax: 0.15,
    slots: ['ring', 'feet'],
    suffix: '%',
  },
];

export const AFFIX_BY_ID: ReadonlyMap<string, AffixDef> = new Map(
  AFFIXES.map((a) => [a.id, a]),
);

export function affixById(id: string): AffixDef {
  const found = AFFIX_BY_ID.get(id);
  if (!found) throw new Error(`未知词条: ${id}`);
  return found;
}
