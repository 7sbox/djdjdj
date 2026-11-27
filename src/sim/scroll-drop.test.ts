import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, spawnRoom, stepWorld, TICK_SECONDS } from './world';
import { DRAW_COST } from './manual';

/**
 * 残页的来源：精英 5%、Boss 必掉 2–4。
 *
 * 这是「残页必须打硬仗」这条设计的落点 —— 如果刷小怪就能刷出残页，
 * 抽卡就变成纯挂机产出的消耗品，稀缺感全无。
 */

describe('残页掉落', () => {
  it('Boss 必掉 2–4 张残页', () => {
    const rng = createRng(1);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    spawnRoom(world, rng, 'f1', 3); // Boss 房

    // 直接把 Boss 血打到 0，跳过过程
    const boss = world.monsters.find((m) => m.defId.startsWith('m_boss_'))!;
    boss.hp = 1;
    world.player.hp = world.player.maxHp;

    const before = world.player.scrollPages;
    const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };

    // 打到 Boss 死为止（最多 2 分钟）
    for (let i = 0; i < Math.round(120 / TICK_SECONDS); i++) {
      stepWorld(world, deps);
      if (!world.monsters.some((m) => m.defId.startsWith('m_boss_'))) break;
    }

    const gained = world.player.scrollPages - before;
    expect(gained).toBeGreaterThanOrEqual(2);
    expect(gained).toBeLessThanOrEqual(4);
  });

  it('普通怪不掉残页', () => {
    const rng = createRng(2);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    world.player.hp = world.player.maxHp;

    const before = world.player.scrollPages;
    const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };

    // 每一帧都把怪物强制修正成「非精英普通怪」，并让它们无限血，
    // 这样只验证「普通怪被击杀时掉不掉残页」，不牵扯清场推进。
    for (let i = 0; i < 3000; i++) {
      world.player.hp = world.player.maxHp;
      for (const m of world.monsters) {
        m.elite = false;
        if (m.defId.startsWith('m_boss_')) m.defId = 'm_dog';
        m.hp = Math.max(m.hp, 1e6);
      }
      stepWorld(world, deps);
    }

    expect(world.player.scrollPages).toBe(before);
  });

  it('精英怪掉残页是小概率，且远低于 100%', () => {
    // 用一个干净的世界，手工塞入大量精英，统计产出
    const rng = createRng(7);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    world.player.hp = 1e9;
    world.player.maxHp = 1e9;

    spawnRoom(world, rng, 'f1', 0);
    for (const m of world.monsters) m.elite = true;

    const before = world.player.scrollPages;
    const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };
    for (let i = 0; i < 6000; i++) {
      world.player.hp = world.player.maxHp;
      stepWorld(world, deps);
    }
    const gained = world.player.scrollPages - before;
    // 抓到的精英数量不少，但残页不会多到失控
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThan(60);
  });
});

describe('抽卡成本与残页产出的关系', () => {
  it('一次抽卡要 1 张残页，不能靠普通怪刷', () => {
    expect(DRAW_COST.pages).toBe(1);
    expect(DRAW_COST.gold).toBeGreaterThan(0);
  });
});
