import type { ItemDef, JobId, Rarity, SlotId, SlotKind, WeaponKind, WeaponDef } from '../types';

/** 7 类武器。武器决定武学，武学决定技能。切片只做剑与刀，其余留数据结构。 */
export const WEAPONS: readonly WeaponDef[] = [
  { kind: 'sword', name: '剑', job: 'warrior', martialFamily: '剑法', attackForm: 'melee', damageType: 'physical' },
  { kind: 'blade', name: '刀', job: 'warrior', martialFamily: '刀法', attackForm: 'melee', damageType: 'physical' },
  { kind: 'spear', name: '枪棍', job: 'warrior', martialFamily: '枪法', attackForm: 'melee', damageType: 'physical' },
  { kind: 'fist', name: '拳套', job: 'warrior', martialFamily: '拳法', attackForm: 'melee', damageType: 'physical' },
  { kind: 'bow', name: '弓', job: 'warrior', martialFamily: '射术', attackForm: 'ranged', damageType: 'physical' },
  { kind: 'zither', name: '琴箫', job: 'mage', martialFamily: '乐理', attackForm: 'ranged', damageType: 'magic' },
  { kind: 'whisk', name: '拂尘', job: 'priest', martialFamily: '医经', attackForm: 'ranged', damageType: 'magic' },
];

export const WEAPON_BY_KIND: ReadonlyMap<WeaponKind, WeaponDef> = new Map(
  WEAPONS.map((w) => [w.kind, w]),
);

/** 切片的装备部位顺序（展示用）。 */
export const SLOTS: readonly SlotId[] = [
  'weapon', 'head', 'chest', 'hands', 'waist', 'feet', 'ring1', 'ring2',
];

export const SLOT_NAMES: Readonly<Record<SlotId, string>> = {
  head: '头', chest: '衣', hands: '手', waist: '腰',
  feet: '鞋', weapon: '武器', ring1: '戒', ring2: '戒',
};

/** 8 个部位的基础属性种类。 */
export function baseStatTypeOf(slot: SlotKind): 'attack' | 'armor' | 'hp' {
  if (slot === 'weapon') return 'attack';
  if (slot === 'head' || slot === 'chest' || slot === 'hands') return 'armor';
  return 'hp'; // waist / feet / ring
}

/** 每个部位的装备名（灰盒期用最朴素的词）。 */
const SLOT_NOUN: Readonly<Record<SlotKind, string>> = {
  head: '头巾', chest: '布衣', hands: '护腕', waist: '腰带',
  feet: '快靴', weapon: '兵器', ring: '指环',
};

/**
 * 装备模板：每个部位 × 每种可用武器 = 一条模板。
 * 武器每个职业都用同一套 ItemDef，具体武器种类由 Item 上的 weaponKind 决定。
 */
export const ITEM_DEFS: readonly ItemDef[] = [
  ...(['head', 'chest', 'hands', 'waist', 'feet', 'ring'] as const).map((slot) => ({
    id: `def_${slot}`,
    slot,
    baseName: SLOT_NOUN[slot],
  })),
  ...(['sword', 'blade', 'spear', 'fist', 'bow', 'zither', 'whisk'] as const).map((w) => ({
    id: `def_weapon_${w}`,
    slot: 'weapon' as const,
    baseName: WEAPON_BY_KIND.get(w)!.name,
    weaponKind: w,
  })),
];

export const ITEM_DEF_BY_ID: ReadonlyMap<string, ItemDef> = new Map(
  ITEM_DEFS.map((d) => [d.id, d]),
);

/** 品质顺序与显示。 */
export const RARITY_ORDER: readonly Rarity[] = ['common', 'green', 'blue', 'purple', 'orange'];

export const RARITY_NAMES: Readonly<Record<Rarity, string>> = {
  common: '凡品', green: '精良', blue: '稀有', purple: '史诗', orange: '传说',
};

/** 各品质的词条条数：白 0 / 绿 1 / 蓝 2 / 紫 3 / 橙 4。 */
export const RARITY_AFFIX_COUNT: Readonly<Record<Rarity, number>> = {
  common: 0, green: 1, blue: 2, purple: 3, orange: 4,
};

/** 各品质的基础白值乘数。 */
export const RARITY_STAT_MULT: Readonly<Record<Rarity, number>> = {
  common: 1.0, green: 1.15, blue: 1.3, purple: 1.5, orange: 1.8,
};

/** 各品质的售卖/拆解价值乘数。 */
export const RARITY_VALUE_MULT: Readonly<Record<Rarity, number>> = {
  common: 1, green: 3, blue: 8, purple: 20, orange: 50,
};

export const JOB_NAMES: Readonly<Record<JobId, string>> = {
  warrior: '战士', priest: '牧师', mage: '法师',
};
