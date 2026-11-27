import type { Item, SlotId } from '../types';
import { RARITY_ORDER } from '../data/items';
import { affixById } from '../data/affixes';
import { upgradeMultiplier } from './loot';

/** 全部可聚合的属性。 */
export interface Stats {
  attack: number;
  armor: number;
  hp: number;

  critRate: number;
  critDmg: number;
  attackSpeed: number;
  armorPen: number;

  dodge: number;
  damageReduce: number;
  thorns: number;

  burn: number;
  freeze: number;
  poison: number;

  martialSword: number;
  martialBlade: number;
  cooldownReduce: number;

  dropRate: number;
  goldFind: number;
  lifesteal: number;
  expBonus: number;
}

export function emptyStats(): Stats {
  return {
    attack: 0, armor: 0, hp: 0,
    critRate: 0, critDmg: 0, attackSpeed: 0, armorPen: 0,
    dodge: 0, damageReduce: 0, thorns: 0,
    burn: 0, freeze: 0, poison: 0,
    martialSword: 0, martialBlade: 0, cooldownReduce: 0,
    dropRate: 0, goldFind: 0, lifesteal: 0, expBonus: 0,
  };
}

/**
 * 把已装备的物品汇总成属性。
 *
 * 注意：等级只给固定属性（在 playerStats 里另加），装备只贡献这里的东西。
 * 这是「战力 15% 来自等级、85% 来自装备」那条决定的落点。
 */
export function statsFromEquipment(equipped: Partial<Record<SlotId, Item>>): Stats {
  const s = emptyStats();

  for (const item of Object.values(equipped)) {
    if (!item) continue;

    const up = upgradeMultiplier(item.upgrade);
    const base = Math.round(item.baseStat * up);

    switch (item.baseStatType) {
      case 'attack': s.attack += base; break;
      case 'armor': s.armor += base; break;
      case 'hp': s.hp += base; break;
    }

    for (const af of item.affixes) {
      const def = affixById(af.affixId);
      const v = af.value;
      switch (af.affixId) {
        case 'crit_rate': s.critRate += v; break;
        case 'crit_dmg': s.critDmg += v; break;
        case 'attack_speed': s.attackSpeed += v; break;
        case 'armor_pen': s.armorPen += v; break;

        case 'hp_flat': s.hp += v; break;
        case 'dodge': s.dodge += v; break;
        case 'damage_reduce': s.damageReduce += v; break;
        case 'thorns': s.thorns += v; break;

        case 'burn': s.burn += v; break;
        case 'freeze': s.freeze += v; break;
        case 'poison': s.poison += v; break;

        case 'martial_sword': s.martialSword += v; break;
        case 'martial_blade': s.martialBlade += v; break;
        case 'cooldown_reduce': s.cooldownReduce += v; break;

        case 'drop_rate': s.dropRate += v; break;
        case 'gold_find': s.goldFind += v; break;
        case 'lifesteal': s.lifesteal += v; break;
        case 'exp_bonus': s.expBonus += v; break;
        default:
          // 词条定义了但这里没接：说明数据与聚合脱节，直接抛出来
          throw new Error(`词条 ${af.affixId} (${def.name}) 没有接入属性聚合`);
      }
    }
  }

  return s;
}

/** 比率类属性做上限夹紧，避免后期出现 100% 闪避这种崩坏。 */
export function clampStats(s: Stats): Stats {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    ...s,
    critRate: clamp(s.critRate, 0, 0.75),
    dodge: clamp(s.dodge, 0, 0.5),
    damageReduce: clamp(s.damageReduce, 0, 0.6),
    armorPen: clamp(s.armorPen, 0, 0.8),
    cooldownReduce: clamp(s.cooldownReduce, 0, 0.5),
    attackSpeed: clamp(s.attackSpeed, 0, 1.0),
    lifesteal: clamp(s.lifesteal, 0, 0.25),
  };
}

/** 等级带来的固定属性：只占 15%，且不与装备的任何一条词条同名。 */
export function levelStats(level: number): Stats {
  const s = emptyStats();
  // 1 级：血 480 / 攻 32 / 甲 18 —— 够自刷第一层
  // 10 级：血 1200 / 攻 59 / 甲 45 —— 从 1 级到 10 级只涨 27 点攻击，
  // 换两件 10 级紫装就能涨 40+，这样「变强靠刷」才成立。
  s.attack += 29 + level * 3;
  s.armor += 15 + level * 3;
  s.hp += 360 + level * 84;
  return s;
}

export function combineStats(a: Stats, b: Stats): Stats {
  const out = emptyStats();
  for (const k of Object.keys(out) as (keyof Stats)[]) {
    out[k] = a[k] + b[k];
  }
  return out;
}

/**
 * 除法减伤：伤害 × K/(K+护甲)。
 * 永远不会减到 0 —— 这是不用减法公式的唯一理由。
 */
export function mitigation(armor: number, armorPen: number, k: number): number {
  const pen = Math.min(0.95, Math.max(0, armorPen));
  const effectiveArmor = Math.max(0, armor * (1 - pen));
  return k / (k + effectiveArmor);
}

/**
 * 一次命中的伤害。
 *
 * $$实际伤害 = 攻击力 \times 技能倍率 \times \frac{K}{K+护甲} \times 暴击倍率$$
 */
export function computeDamage(
  attack: number,
  skillPower: number,
  armor: number,
  armorPen: number,
  k: number,
  crit: boolean,
  critDmg: number,
): number {
  const raw = attack * skillPower * mitigation(armor, armorPen, k);
  const mult = crit ? 1 + critDmg : 1;
  return Math.max(1, Math.round(raw * mult));
}

/** 品质比较，用于 UI 排序与合成校验。 */
export function rarityRank(r: Item['rarity']): number {
  return RARITY_ORDER.indexOf(r);
}
