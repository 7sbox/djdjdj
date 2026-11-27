import type { Item, ItemAffix, Rarity, SlotId, SlotKind, WeaponKind } from '../types';
import { AFFIXES, affixById } from '../data/affixes';
import {
  ITEM_DEFS,
  RARITY_AFFIX_COUNT,
  RARITY_STAT_MULT,
  baseStatTypeOf,
} from '../data/items';
import { createRng, shortId, type Rng } from './rng';

/**
 * 品质权重（普通怪）。白 82 / 绿 16 / 蓝 2 / 紫 0.15 / 橙 0.01
 *
 * 这组数不是拍的，是按规格 §二 的节奏目标反推的：10 分钟凑齐一身绿、
 * 30 分钟第一件蓝、2 小时第一件紫。挂机实测约 6–9 只/分钟、12% 掉率，
 * 所以 30 分钟大约只有 25 件、120 分钟约 360 件 —— 蓝要 1/25、紫要 1/360。
 *
 * 旧值（白 60 / 绿 28 / 蓝 10 / 紫 1.9 / 橙 0.1）让紫装中位 8 分钟就出，
 * 与规格差一个数量级。改这个表之前先跑 `pnpm test` 里的品质梯度用例。
 */
const NORMAL_RARITY_WEIGHTS = [62, 32, 5, 0.4, 0.05] as const;

/** 精英怪：品质池提升一档，但仍然稀有。 */
const ELITE_RARITY_WEIGHTS = [42, 40, 16, 1.8, 0.2] as const;

/** 煞气对高品质权重的微升系数（每级 +8%）。 */
const MALICE_HIGH_TIER_BONUS = 0.08;

export interface DropParams {
  /** 怪物等级档位（决定基础材料价值）。 */
  monsterTier: 'normal' | 'elite' | 'boss';
  /** 当前煞气层数 0..10。 */
  malice: number;
  /** 玩家掉落率加成（比率）。 */
  dropBonus: number;
}

/** 单位掉落概率（普通怪 12%）。 */
const BASE_DROP_CHANCE = 0.12;

/** 「财运」概率：本场掉落率 ×5。设计讨论里有 0.5% 这个数，这里按场次触发。 */
const FORTUNE_CHANCE = 0.005;

/**
 * 掷骰：这次击杀掉不掉东西。
 * 这是整个游戏手感最集中的函数，任何改动都要先跑一遍 10000 次模拟看分布。
 */
export function rollDrop(
  params: DropParams,
  rng: Rng,
): { drop: boolean; rarityRoll: Rarity | null; fortune: boolean } {
  const { monsterTier, malice, dropBonus } = params;

  const fortune = rng.chance(FORTUNE_CHANCE);
  const fortuneMult = fortune ? 5 : 1;

  // 精英与 Boss 必掉（设计讨论 Q21）
  if (monsterTier === 'normal') {
    const chance = Math.min(1, BASE_DROP_CHANCE * (1 + dropBonus) * fortuneMult);
    if (!rng.chance(chance)) {
      return { drop: false, rarityRoll: null, fortune };
    }
  }

  const weights: number[] =
    monsterTier === 'elite' ? [...ELITE_RARITY_WEIGHTS] : [...NORMAL_RARITY_WEIGHTS];

  // 煞气提升高品质权重
  const highTierBonus = 1 + malice * MALICE_HIGH_TIER_BONUS;
  weights[2] = weights[2]! * highTierBonus;
  weights[3] = weights[3]! * highTierBonus * highTierBonus;
  weights[4] = weights[4]! * highTierBonus * highTierBonus * highTierBonus;

  // Boss 必掉紫
  if (monsterTier === 'boss') {
    weights[3] = weights[3]! + weights[2]!;
    weights[2] = weights[2]! * 0.5;
  }

  const idx = rng.weighted(weights);
  const rarity = (['common', 'green', 'blue', 'purple', 'orange'] as const)[idx]!;
  return { drop: true, rarityRoll: rarity, fortune };
}

/** 一件装备的基础白值。等级只缩放，品质只乘。 */
export function baseStatValue(
  statType: 'attack' | 'armor' | 'hp',
  itemLevel: number,
  rarity: Rarity,
): number {
  const mult = RARITY_STAT_MULT[rarity];
  const raw =
    statType === 'attack'
      ? 6 + itemLevel * 1.6
      : statType === 'armor'
        ? 5 + itemLevel * 1.3
        : 18 + itemLevel * 6;
  return Math.round(raw * mult);
}

/**
 * 生成一件装备。
 * @param slot 目标部位；ring1/ring2 归一到 ring
 * @param weaponKind 武器种类（仅 weapon 槽有效）
 */
export function rollItem(
  opts: {
    slot: SlotId;
    itemLevel: number;
    rarity: Rarity;
    weaponKind?: WeaponKind;
  },
  rng: Rng,
): Item {
  const normalizedSlot: SlotKind =
    opts.slot === 'ring1' || opts.slot === 'ring2' ? 'ring' : opts.slot;
  const weaponKind = normalizedSlot === 'weapon' ? (opts.weaponKind ?? 'sword') : undefined;

  const defs = ITEM_DEFS.filter(
    (d) => d.slot === normalizedSlot && (normalizedSlot !== 'weapon' || d.weaponKind === weaponKind),
  );
  const def = defs[0];
  if (!def) throw new Error(`没有匹配的装备模板: ${normalizedSlot}/${weaponKind ?? '-'}`);

  const affixCount = RARITY_AFFIX_COUNT[opts.rarity];
  const affixes = rollAffixes(normalizedSlot, opts.rarity, affixCount, opts.itemLevel, rng);

  return {
    id: shortId(rng),
    defId: def.id,
    slot: opts.slot,
    itemLevel: opts.itemLevel,
    rarity: opts.rarity,
    baseStat: baseStatValue(baseStatTypeOf(normalizedSlot), opts.itemLevel, opts.rarity),
    baseStatType: baseStatTypeOf(normalizedSlot),
    affixes,
    upgrade: 0,
  };
}

/** 严格部位专属的词条洗练。同一件装备不重复出同一条词条。 */
export function rollAffixes(
  slot: SlotKind,
  rarity: Rarity,
  count: number,
  itemLevel: number,
  rng: Rng,
): ItemAffix[] {
  const rarityRank = ['common', 'green', 'blue', 'purple', 'orange'].indexOf(rarity);
  const pool = AFFIXES.filter((a) => {
    if (!a.slots.includes(slot)) return false;
    if (!a.minRarity) return true;
    return ['common', 'green', 'blue', 'purple', 'orange'].indexOf(a.minRarity) <= rarityRank;
  });

  const chosen: ItemAffix[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (chosen.length < count && guard < 64) {
    guard++;
    const a = rng.pick(pool);
    if (used.has(a.id)) continue;
    used.add(a.id);
    const roll = a.rollMin + rng.next() * (a.rollMax - a.rollMin);
    const value = a.percent ? roll : Math.round(roll * (1 + itemLevel / 20));
    chosen.push({ affixId: a.id, roll, value });
  }
  return chosen;
}

/** 从属主地图选一个部位。武器权重略低于其他部位，避免满地是武器。 */
export function randomSlot(rng: Rng): SlotId {
  const pool: SlotId[] = [
    'weapon', 'weapon',
    'head', 'chest', 'hands', 'waist', 'feet',
    'ring1', 'ring2',
  ];
  return rng.pick(pool);
}

/** 装备显示名。 */
export function itemDisplayName(item: Item): string {
  const def = ITEM_DEFS.find((d) => d.id === item.defId);
  if (!def) return '未知物品';
  const affix = item.affixes[0];
  const prefix = affix ? affixById(affix.affixId).name : '';
  const upgradeSuffix = item.upgrade > 0 ? ` +${item.upgrade}` : '';
  return prefix ? `${prefix}·${def.baseName}${upgradeSuffix}` : `${def.baseName}${upgradeSuffix}`;
}

/** 拆解产出的强化矿数量：白1 绿3 蓝8 紫20 橙50。 */
export function salvageYield(rarity: Rarity): number {
  return { common: 1, green: 3, blue: 8, purple: 20, orange: 50 }[rarity];
}

/** 强化消耗：第 n 级消耗的矿量。必成、不降级。 */
export function upgradeCost(currentLevel: number): { ore: number; gold: number } {
  return {
    ore: 2 + currentLevel * 2,
    gold: 20 + currentLevel * 30,
  };
}

export const MAX_UPGRADE = 9;

/** 强化加成：每级 +5% 基础白值，每 +3 级跳变 +10%。 */
export function upgradeMultiplier(level: number): number {
  const base = 1 + level * 0.05;
  const step = Math.floor(level / 3) * 0.1;
  return base + step;
}

/** 合成：3 件同部位同品质 → 1 件高一品质。 */
export function synthTargetRarity(rarity: Rarity): Rarity | null {
  const order = ['common', 'green', 'blue', 'purple', 'orange'] as const;
  const i = order.indexOf(rarity);
  return i >= 0 && i < order.length - 1 ? order[i + 1]! : null;
}

/** 生成一个独立的 rng（测试用）。 */
export function rngForTest(seed = 12345): Rng {
  return createRng(seed);
}
