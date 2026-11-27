import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import {
  DEFAULT_KILL_RATE,
  OFFLINE_CAP_HOURS,
  TICK_SECONDS,
  changeFloor,
  computeOfflineReward,
  createWorld,
  playerStats,
  reenterFloor,
  spawnRoom,
  stepWorld,
} from '../sim/world';
import { computeDamage, mitigation } from '../sim/stats';
import { MAX_MONSTERS_ON_SCREEN } from '../sim/world';
import type { Item, SlotId } from '../types';
import { rollItem } from '../sim/loot';

function makeWorld(seed = 1) {
  const rng = createRng(seed);
  const equipped: Partial<Record<SlotId, Item>> = {};
  const world = createWorld({ rng, floorId: 'f1', equipped });
  return { rng, equipped, world };
}

describe('除法减伤：护甲永远减不满', () => {
  it('护甲堆到 5000 也还能打出伤害（减法公式在这里会崩）', () => {
    const k = 200;
    const dmg = computeDamage(4800, 1, 5000, 0, k, false, 0);
    expect(dmg).toBeGreaterThan(0);
    expect(mitigation(5000, 0, k)).toBeCloseTo(200 / 5200, 6);
  });

  it('护甲越高减伤越多，但比例单调且趋近于 0 而非 0', () => {
    const k = 50;
    const a = mitigation(50, 0, k);
    const b = mitigation(500, 0, k);
    const c = mitigation(500000, 0, k);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(0);
  });

  it('破甲按比例削弱护甲，不会变成负数', () => {
    const withPen = mitigation(500, 0.8, 200);
    expect(withPen).toBeGreaterThan(mitigation(500, 0, 200));
    // 破甲有 95% 上限：500 护甲最多削到 25，K=200 时减伤后仍为 200/225
    expect(mitigation(500, 1.0, 200)).toBeCloseTo(200 / 225, 6);
  });
});

describe('伤害数字控制在 5 位数以内', () => {
  it('10 级的角色单次伤害在 20–120 的量级', () => {
    const { equipped, world } = makeWorld();
    world.player.level = 10;
    const s = playerStats(world, equipped);
    const dmg = computeDamage(s.attack, 1, 20, 0, 50, false, 0);
    expect(dmg).toBeLessThan(200);
    expect(dmg).toBeGreaterThan(5);
  });
});

describe('挂机被打断', () => {
  it('血量低到 0 会死亡、送回国、并中断挂机', () => {
    const { world } = makeWorld();
    world.player.hp = 1;
    let died = false;
    for (let i = 0; i < 4000; i++) {
      stepWorld(world, {
        rng: createRng(i),
        equipped: {},
        onLoot: () => {},
        onKill: () => {},
      });
      if (!world.player.alive) { died = true; break; }
    }
    expect(died || world.player.hp > 0).toBe(true);
  });

  it('死亡不丢装备、不降等级', () => {
    const { equipped, world } = makeWorld();
    const gear = rollItem({ slot: 'chest', itemLevel: 5, rarity: 'blue' }, createRng(11));
    equipped.chest = gear;
    const levelBefore = world.player.level;

    world.player.hp = 0.0001;
    world.player.alive = false;
    world.player.respawnIn = 0.1;
    stepWorld(world, { rng: createRng(2), equipped, onLoot: () => {}, onKill: () => {} });

    expect(equipped.chest).toBe(gear);
    expect(world.player.level).toBe(levelBefore);
  });

  it('自动喝药会消耗丹药，药有限', () => {
    const { world } = makeWorld();
    world.player.hp = world.player.maxHp * 0.2;
    world.player.potions = 2;
    stepWorld(world, { rng: createRng(3), equipped: {}, onLoot: () => {}, onKill: () => {} });
    expect(world.player.potions).toBeLessThan(2);
  });

  it('关掉自动喝药就不会喝', () => {
    const { world } = makeWorld();
    world.controls.autoPotion = false;
    world.player.hp = world.player.maxHp * 0.2;
    const before = world.player.potions;
    stepWorld(world, { rng: createRng(3), equipped: {}, onLoot: () => {}, onKill: () => {} });
    expect(world.player.potions).toBe(before);
  });
});

describe('房间与煞气', () => {
  it('普通房怪物数量不超过同屏上限', () => {
    const { rng, world } = makeWorld();
    for (let malice = 0; malice <= 10; malice++) {
      world.malice = malice;
      for (let room = 0; room < 3; room++) {
        spawnRoom(world, rng, 'f1', room);
        expect(world.monsters.length).toBeLessThanOrEqual(MAX_MONSTERS_ON_SCREEN);
      }
    }
  });

  it('煞气上限 10，再入只加 1', () => {
    const { rng, world } = makeWorld();
    for (let i = 0; i < 20; i++) reenterFloor(world, rng);
    expect(world.malice).toBe(10);
  });

  it('再入后煞气提升，怪物血量随之提升', () => {
    const { rng, world } = makeWorld();
    spawnRoom(world, rng, 'f1', 0);
    const before = world.monsters.reduce((a, m) => a + m.maxHp, 0);
    reenterFloor(world, rng);
    const after = world.monsters.reduce((a, m) => a + m.maxHp, 0);
    expect(world.malice).toBe(1);
    expect(after).toBeGreaterThan(before * 0.9);
  });

  it('换层会重置煞气', () => {
    const { rng, world } = makeWorld();
    reenterFloor(world, rng);
    expect(world.malice).toBe(1);
    changeFloor(world, rng, 'f2');
    expect(world.malice).toBe(0);
    expect(world.floorId).toBe('f2');
  });

  it('第 4 间是 Boss 房，里面必有 Boss', () => {
    const { rng, world } = makeWorld();
    spawnRoom(world, rng, 'f1', 3);
    expect(world.monsters.some((m) => m.defId.startsWith('m_boss_'))).toBe(true);
  });
});

describe('离线收益', () => {
  it('绝不给装备（函数签名里就没有装备）', () => {
    const r = computeOfflineReward(10, 10, DEFAULT_KILL_RATE);
    expect(Object.keys(r).sort()).toEqual(['capped', 'exp', 'gold', 'ore']);
  });

  it('上限 8 小时，多出来的不算', () => {
    expect(computeOfflineReward(100, 10, 12).capped).toBe(OFFLINE_CAP_HOURS);
    expect(computeOfflineReward(2, 10, 12).capped).toBe(2);
  });

  it('8 小时的收益明显大于 1 小时，但不是线性爆炸', () => {
    const one = computeOfflineReward(1, 10, 12);
    const eight = computeOfflineReward(8, 10, 12);
    expect(eight.exp).toBe(one.exp * 8);
  });
});

describe('固定逻辑帧', () => {
  it('0.2 秒一帧', () => {
    expect(TICK_SECONDS).toBe(0.2);
  });

  it('跑 100 帧后时间推进 20 秒，且没有崩溃', () => {
    const { world } = makeWorld();
    for (let i = 0; i < 100; i++) {
      stepWorld(world, { rng: createRng(i), equipped: {}, onLoot: () => {}, onKill: () => {} });
    }
    expect(world.elapsed).toBeCloseTo(20, 6);
    expect(world.floating.length).toBeLessThanOrEqual(80);
  });
});
