import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  createWorld,
  stepWorld,
  TICK_SECONDS,
  POTION_PRICE,
  WANTED_POTIONS,
  STARTING_POTIONS,
} from './world';

/**
 * 开局供给与「进 Boss 房之前不死」。
 *
 * #2 重标定的核心修正：原判据「裸装 5 分钟不死」与「裸装打不过 Boss」
 * 在自动跑图下**逻辑上不能同时成立** —— 实测裸装在 ~172 秒进入 Boss 房，
 * 而裸装必然打不过 Boss，所以必死。
 *
 * 真实意图是「前面的普通房不该把人磨死」，Boss 房死是设计本身。
 * 判据因此改成：**进入 Boss 房之前不死**。
 */

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

/** Boss 房是第 4 间，索引 3。 */
const BOSS_ROOM_INDEX = 3;

/**
 * 跑到「进 Boss 房那一刻」为止，返回是否在此之前倒下。
 * 没走到 Boss 房就已清完（不可能，3 间之后必然进）也算通过。
 */
function diedBeforeBossRoom(seed: number, autoPotion: boolean): boolean {
  const rng = createRng(seed);
  const world = createWorld({ rng, floorId: 'f1', equipped: {} });
  world.controls.autoPotion = autoPotion;
  const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };

  // 上限 10 分钟：足够走到 Boss 房，也不会让用例跑不完
  for (let i = 0; i < Math.round(600 / TICK_SECONDS); i++) {
    stepWorld(world, deps);
    if (!world.player.alive || world.interrupted) return true;
    // 一旦进入 Boss 房，本用例的观察窗口就结束
    if (world.roomIndex >= BOSS_ROOM_INDEX) return false;
  }
  // 10 分钟都没进 Boss 房：说明普通房把人磨住了，按失败处理
  return true;
}

describe('开局丹量', () => {
  it('新角色带够一轮的丹，明显多于原来的 5 颗', () => {
    const world = createWorld({ rng: createRng(1), floorId: 'f1', equipped: {} });
    expect(world.player.potions).toBe(STARTING_POTIONS);
    expect(STARTING_POTIONS).toBeGreaterThan(5);
  });

  it('开局丹量不超过丹囊上限 —— 否则补丹逻辑形同虚设', () => {
    expect(STARTING_POTIONS).toBeLessThanOrEqual(WANTED_POTIONS);
  });

  it('开局给一点买药钱，够补两颗的量级（不是发财）', () => {
    const world = createWorld({ rng: createRng(1), floorId: 'f1', equipped: {} });
    expect(world.player.gold).toBeGreaterThanOrEqual(POTION_PRICE * 2);
    expect(world.player.gold).toBeLessThanOrEqual(POTION_PRICE * 10);
  });
});

describe('端点：自动喝药时，普通房不磨死人', () => {
  it('30 个种子都能活着走进 Boss 房', () => {
    const died = SEEDS.filter((s) => diedBeforeBossRoom(s, true));
    expect(died).toHaveLength(0);
  });
});

describe('端点：药是生死开关，不是摆设', () => {
  it('关掉自动喝药，30 个种子全部在进 Boss 房之前倒下', () => {
    const died = SEEDS.filter((s) => diedBeforeBossRoom(s, false));
    expect(died).toHaveLength(SEEDS.length);
  });
});
