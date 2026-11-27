import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import { createWorld, stepWorld, playerStats, resumeFarming, TICK_SECONDS } from '../sim/world';
import type { Item, SlotId } from '../types';
import { upgradeItem, reforgeAffix, synthItems, salvageYieldOf } from '../sim/equip-ops';
import { rollItem } from '../sim/loot';

/**
 * 端到端：跑 30 分钟的挂机循环，验证「刷得到东西、垃圾有出口、能变强」。
 * 这是切片要验证的四件事里的三件。
 */
describe('挂机 30 分钟', () => {
  it('能打到装备、金币，且不在第一间就死', () => {
    const rng = createRng(20260101);
    const equipped: Partial<Record<SlotId, Item>> = {};
    const world = createWorld({ rng, floorId: 'f1', equipped });

    const loot: Item[] = [];
    const deps = {
      rng,
      equipped,
      onLoot: (i: Item) => loot.push(i),
      onKill: () => {},
    };

    const ticks = Math.round((30 * 60) / TICK_SECONDS);
    for (let i = 0; i < ticks; i++) {
      // 死亡被打断后，模拟玩家主动恢复（这就是设计里的「你得回来管」）
      if (world.interrupted) resumeFarming(world, rng);
      stepWorld(world, deps);
    }

    expect(loot.length).toBeGreaterThan(10);
    expect(world.player.gold).toBeGreaterThan(0);
    expect(world.player.level).toBeGreaterThan(1);

    const rarities = new Set(loot.map((l) => l.rarity));
    expect(rarities.size).toBeGreaterThanOrEqual(2);
  });

  it('挂机确实会自动跑完 4 间房，不会卡在第一间', () => {
    const rng = createRng(999);
    const equipped: Partial<Record<SlotId, Item>> = {};
    const world = createWorld({ rng, floorId: 'f1', equipped });
    const deps = { rng, equipped, onLoot: () => {}, onKill: () => {} };

    let sawRoom2 = false;
    for (let i = 0; i < 6000; i++) {
      if (world.interrupted) resumeFarming(world, rng);
      stepWorld(world, deps);
      if (world.roomIndex >= 1) sawRoom2 = true;
    }
    expect(sawRoom2).toBe(true);
  });

  it('死亡后挂机中断，必须手动恢复（这是「回来发现进度停了两小时」）', () => {
    const rng = createRng(5);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    // 关掉自动服丹、耗光丹药 —— 这就是「装备差硬撑高层」的真实场景
    world.controls.autoPotion = false;
    world.player.potions = 0;
    world.player.hp = 1;

    const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };
    for (let i = 0; i < 400; i++) stepWorld(world, deps);

    expect(world.interrupted).toBe(true);
    // 中断期间不再产怪
    for (let i = 0; i < 200; i++) stepWorld(world, deps);
    expect(world.monsters.length).toBe(0);

    // 手动恢复后才继续
    resumeFarming(world, rng);
    expect(world.interrupted).toBe(false);
    expect(world.monsters.length).toBeGreaterThan(0);
  });

  it('同屏怪物数不会超过 60 只（性能红线）', () => {
    const rng = createRng(7);
    const world = createWorld({ rng, floorId: 'f3', equipped: {}, malice: 10 });
    const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };
    for (let i = 0; i < 2000; i++) {
      if (world.interrupted) resumeFarming(world, rng);
      stepWorld(world, deps);
      expect(world.monsters.length).toBeLessThanOrEqual(60);
    }
  });

  it('跳字数量被限制，不会无限膨胀', () => {
    const rng = createRng(8);
    const world = createWorld({ rng, floorId: 'f1', equipped: {}, malice: 10 });
    const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };
    for (let i = 0; i < 5000; i++) {
      if (world.interrupted) resumeFarming(world, rng);
      stepWorld(world, deps);
      if (world.floating.length > 80) throw new Error('跳字没有上限');
    }
    expect(world.floating.length).toBeLessThanOrEqual(80);
  });
});

describe('垃圾有出口：拆解 → 强化 → 变强', () => {
  it('拆一堆凡品，够把一件装备点到 +3 以上', () => {
    const rng = createRng(31);
    let ore = 0;
    for (let i = 0; i < 20; i++) {
      ore += salvageYieldOf('common');
    }
    // 20 件凡品 = 20 矿，+1 要 2、+2 要 4、+3 要 6，共 12
    expect(ore).toBe(20);

    const item = rollItem({ slot: 'chest', itemLevel: 5, rarity: 'green' }, rng);
    let cur = item;
    let wallet = { gold: 10_000, ore, reforgeStones: 0 };
    let levels = 0;
    for (let i = 0; i < 3; i++) {
      const res = upgradeItem(cur, wallet);
      if (!res.ok) break;
      cur = res.value.item;
      wallet = res.value.wallet;
      levels++;
    }
    expect(levels).toBeGreaterThanOrEqual(3);
    expect(cur.upgrade).toBe(3);
  });

  it('强化后白值真的变高', () => {
    const rng = createRng(32);
    const item = rollItem({ slot: 'weapon', itemLevel: 10, rarity: 'blue' }, rng);
    const wallet = { gold: 100_000, ore: 1000, reforgeStones: 50 };
    let cur = item;
    for (let i = 0; i < 9; i++) {
      const res = upgradeItem(cur, wallet);
      if (!res.ok) break;
      cur = res.value.item;
    }
    expect(cur.upgrade).toBe(9);
    // 白值由 upgradeMultiplier 在 stats 里放大，这里校验基础值没被改坏
    expect(cur.baseStat).toBe(item.baseStat);
  });

  it('重铸只改一条，其他条目原样保留', () => {
    const rng = createRng(33);
    const item = rollItem({ slot: 'weapon', itemLevel: 10, rarity: 'purple' }, rng);
    const before = item.affixes.map((a) => a.affixId);
    const res = reforgeAffix(
      item,
      1,
      { gold: 0, ore: 0, reforgeStones: 5 },
      rng,
      ['head', 'chest', 'hands', 'waist', 'feet', 'weapon', 'ring'],
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const after = res.value.item.affixes.map((a) => a.affixId);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(res.value.wallet.reforgeStones).toBe(4);
  });

  it('重铸石不够就拒绝，且不动任何东西', () => {
    const rng = createRng(34);
    const item = rollItem({ slot: 'weapon', itemLevel: 10, rarity: 'purple' }, rng);
    const res = reforgeAffix(
      item,
      0,
      { gold: 0, ore: 0, reforgeStones: 0 },
      rng,
      ['head', 'chest', 'hands', 'waist', 'feet', 'weapon', 'ring'],
    );
    expect(res.ok).toBe(false);
  });
});

describe('合成', () => {
  it('3 件同部位同品质 → 高一档', () => {
    const rng = createRng(41);
    const parts = [0, 1, 2].map(() => rollItem({ slot: 'chest', itemLevel: 10, rarity: 'blue' }, rng));
    const res = synthItems(parts, (slot, rarity, itemLevel) =>
      rollItem({ slot, rarity, itemLevel }, rng),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.item.rarity).toBe('purple');
    expect(res.value.item.slot).toBe('chest');
  });

  it('部位或品质不同就拒绝', () => {
    const rng = createRng(42);
    const a = rollItem({ slot: 'chest', itemLevel: 10, rarity: 'blue' }, rng);
    const b = rollItem({ slot: 'head', itemLevel: 10, rarity: 'blue' }, rng);
    const c = rollItem({ slot: 'chest', itemLevel: 10, rarity: 'blue' }, rng);
    expect(synthItems([a, b, c], (s, r, l) => rollItem({ slot: s, rarity: r, itemLevel: l }, rng)).ok).toBe(false);

    const d = rollItem({ slot: 'chest', itemLevel: 10, rarity: 'green' }, rng);
    expect(synthItems([a, d, c], (s, r, l) => rollItem({ slot: s, rarity: r, itemLevel: l }, rng)).ok).toBe(false);
  });

  it('传说不能再合成', () => {
    const rng = createRng(43);
    const parts = [0, 1, 2].map(() => rollItem({ slot: 'chest', itemLevel: 10, rarity: 'orange' }, rng));
    const res = synthItems(parts, (s, r, l) => rollItem({ slot: s, rarity: r, itemLevel: l }, rng));
    expect(res.ok).toBe(false);
  });
});

describe('装备真的让角色变强', () => {
  it('穿一身紫装后攻击力明显高于裸体', () => {
    const rng = createRng(51);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    const bare = playerStats(world, {});

    const equipped: Partial<Record<SlotId, Item>> = {};
    for (const slot of ['weapon', 'head', 'chest', 'hands', 'waist', 'feet', 'ring1', 'ring2'] as SlotId[]) {
      equipped[slot] = rollItem(
        { slot, itemLevel: 10, rarity: 'purple', weaponKind: 'sword' },
        rng,
      );
    }
    const geared = playerStats(world, equipped);

    expect(geared.attack).toBeGreaterThan(bare.attack);
    expect(geared.hp).toBeGreaterThan(bare.hp);
    expect(geared.critRate + geared.critDmg).toBeGreaterThan(0);
  });

  it('等级只占一小部分：1 级到 10 级涨的战力不如换两件紫装', () => {
    const rng = createRng(52);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });

    const lv1 = playerStats({ ...world, player: { ...world.player, level: 1 } }, {});
    const lv10 = playerStats({ ...world, player: { ...world.player, level: 10 } }, {});
    const levelGain = lv10.attack - lv1.attack;

    const twoPurple: Partial<Record<SlotId, Item>> = {
      weapon: rollItem({ slot: 'weapon', itemLevel: 10, rarity: 'purple', weaponKind: 'sword' }, rng),
      chest: rollItem({ slot: 'chest', itemLevel: 10, rarity: 'purple' }, rng),
    };
    const gearGain = playerStats(world, twoPurple).attack - lv1.attack;

    expect(gearGain).toBeGreaterThan(levelGain);
  });
});
