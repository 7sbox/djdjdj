import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import {
  RARITY_AFFIX_COUNT,
  RARITY_STAT_MULT,
  baseStatTypeOf,
} from '../data/items';
import { AFFIXES } from '../data/affixes';
import {
  MAX_UPGRADE,
  baseStatValue,
  randomSlot,
  rollAffixes,
  rollDrop,
  rollItem,
  salvageYield,
  synthTargetRarity,
  upgradeCost,
  upgradeMultiplier,
} from '../sim/loot';
import type { Rarity, SlotId } from '../types';

const RARITIES: readonly Rarity[] = ['common', 'green', 'blue', 'purple', 'orange'];

describe('词条部位专属（随机系统有没有意义的分水岭）', () => {
  it('每个部位至少有一条可出的词条', () => {
    const slots = ['head', 'chest', 'hands', 'waist', 'feet', 'weapon', 'ring'] as const;
    for (const s of slots) {
      const pool = AFFIXES.filter((a) => a.slots.includes(s));
      expect(pool.length, `部位 ${s} 没有可用词条`).toBeGreaterThan(0);
    }
  });

  it('攻速只在手上，剑法等级只在武器和戒指上', () => {
    expect(AFFIXES.find((a) => a.id === 'attack_speed')!.slots).toEqual(['hands']);
    expect(AFFIXES.find((a) => a.id === 'martial_sword')!.slots).toEqual(['weapon', 'ring']);
  });

  it('生成的词条永远不会出现在不允许的部位', () => {
    const rng = createRng(42);
    for (const slot of ['head', 'chest', 'hands', 'waist', 'feet', 'weapon', 'ring'] as const) {
      for (let i = 0; i < 300; i++) {
        const affixes = rollAffixes(slot, 'orange', 4, 10, rng);
        for (const af of affixes) {
          const def = AFFIXES.find((a) => a.id === af.affixId)!;
          expect(def.slots, `${af.affixId} 不该出现在 ${slot}`).toContain(slot);
        }
      }
    }
  });

  it('同一件装备不会重复出同一条词条', () => {
    const rng = createRng(7);
    for (let i = 0; i < 300; i++) {
      const affixes = rollAffixes('weapon', 'orange', 4, 10, rng);
      const ids = affixes.map((a) => a.affixId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('品质与词条条数', () => {
  it('白 0 / 绿 1 / 蓝 2 / 紫 3 / 橙 4', () => {
    expect(RARITY_AFFIX_COUNT.common).toBe(0);
    expect(RARITY_AFFIX_COUNT.green).toBe(1);
    expect(RARITY_AFFIX_COUNT.blue).toBe(2);
    expect(RARITY_AFFIX_COUNT.purple).toBe(3);
    expect(RARITY_AFFIX_COUNT.orange).toBe(4);
  });

  it('白装没有词条', () => {
    const rng = createRng(1);
    const item = rollItem({ slot: 'chest', itemLevel: 10, rarity: 'common' }, rng);
    expect(item.affixes).toHaveLength(0);
  });
});

describe('掉落节奏（目标：10 分钟凑齐绿，30 分钟第一件蓝）', () => {
  it('普通怪掉落率接近 12%，一次掷骰在 10000 次内标准差可控', () => {
    const rng = createRng(2024);
    let drops = 0;
    for (let i = 0; i < 20000; i++) {
      const r = rollDrop({ monsterTier: 'normal', malice: 0, dropBonus: 0 }, rng);
      if (r.drop) drops++;
    }
    const rate = drops / 20000;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.14);
  });

  it('精英与 Boss 必定掉落', () => {
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      expect(rollDrop({ monsterTier: 'elite', malice: 0, dropBonus: 0 }, rng).drop).toBe(true);
      expect(rollDrop({ monsterTier: 'boss', malice: 0, dropBonus: 0 }, rng).drop).toBe(true);
    }
  });

  it('煞气提高高品质占比', () => {
    const countHigh = (malice: number): number => {
      const rng = createRng(555);
      let n = 0;
      for (let i = 0; i < 40000; i++) {
        const r = rollDrop({ monsterTier: 'normal', malice, dropBonus: 0 }, rng);
        if (r.rarityRoll === 'purple' || r.rarityRoll === 'orange') n++;
      }
      return n;
    };
    expect(countHigh(10)).toBeGreaterThan(countHigh(0) * 1.5);
  });
});

describe('数值公式', () => {
  it('等级只缩放白值，品质只乘', () => {
    expect(baseStatValue('attack', 5, 'common')).toBeLessThan(baseStatValue('attack', 10, 'common'));
    expect(baseStatValue('attack', 5, 'green')).toBeGreaterThan(baseStatValue('attack', 5, 'common'));
  });

  it('每个部位的属性种类正确', () => {
    expect(baseStatTypeOf('weapon')).toBe('attack');
    expect(baseStatTypeOf('chest')).toBe('armor');
    expect(baseStatTypeOf('ring')).toBe('hp');
  });

  it('强化必成不降级，等级上限 9', () => {
    expect(MAX_UPGRADE).toBe(9);
    expect(upgradeMultiplier(0)).toBe(1);
    expect(upgradeMultiplier(9)).toBeGreaterThan(upgradeMultiplier(8));
    // 每 +3 一次跳变
    expect(upgradeMultiplier(3) - upgradeMultiplier(2)).toBeGreaterThan(
      upgradeMultiplier(2) - upgradeMultiplier(1),
    );
  });

  it('强化消耗随等级上升', () => {
    expect(upgradeCost(0).ore).toBeLessThan(upgradeCost(5).ore);
    expect(upgradeCost(0).gold).toBeLessThan(upgradeCost(5).gold);
  });

  it('拆解产出：白1 绿3 蓝8 紫20 橙50', () => {
    expect(RARITIES.map(salvageYield)).toEqual([1, 3, 8, 20, 50]);
  });

  it('合成只能往上一档，橙装不能再合成', () => {
    expect(synthTargetRarity('common')).toBe('green');
    expect(synthTargetRarity('purple')).toBe('orange');
    expect(synthTargetRarity('orange')).toBeNull();
  });

  it('品质数值逐档递增', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      expect(RARITY_STAT_MULT[RARITIES[i]!]).toBeGreaterThan(RARITY_STAT_MULT[RARITIES[i - 1]!]);
    }
  });
});

describe('装备生成', () => {
  it('戒指两槽归一到同一套规则', () => {
    const rng = createRng(3);
    for (const slot of ['ring1', 'ring2'] as SlotId[]) {
      const item = rollItem({ slot, itemLevel: 10, rarity: 'blue' }, rng);
      expect(item.itemLevel).toBe(10);
      expect(item.affixes).toHaveLength(2);
    }
  });

  it('装备等级固定于区域，不随玩家走', () => {
    const rng = createRng(4);
    const atLv5 = rollItem({ slot: 'chest', itemLevel: 5, rarity: 'blue' }, rng);
    expect(atLv5.itemLevel).toBe(5);
  });

  it('武器会带上武器种类', () => {
    const rng = createRng(5);
    const item = rollItem({ slot: 'weapon', itemLevel: 10, rarity: 'blue', weaponKind: 'blade' }, rng);
    expect(item.defId).toContain('blade');
  });

  it('随机部位分布里武器不超过 1/4', () => {
    const rng = createRng(6);
    let weapons = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) if (randomSlot(rng) === 'weapon') weapons++;
    expect(weapons / N).toBeLessThan(0.25);
  });
});
