import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, stepWorld, TICK_SECONDS, POTION_COOLDOWN } from './world';

/**
 * #2 重标定的前置：喝药必须有冷却。
 *
 * 原先每帧都判定「hp<40% 且有余药就喝」，一帧 0.2 秒内可以连喝两颗 ——
 * 药不是资源，是个摆设。这直接砸掉了「关掉自动喝药必死」那条判据的对照价值：
 * 开着药也只是把死期推迟 0.4 秒。
 */

function freshWorld(seed = 1) {
  const world = createWorld({ rng: createRng(seed), floorId: 'f1', equipped: {} });
  world.controls.autoPotion = true;
  world.controls.autoBuyPotions = false;
  world.player.potions = 20;
  return world;
}

describe('喝药冷却', () => {
  it('一帧内只会喝一颗，不会连喝', () => {
    const world = freshWorld();
    world.player.hp = 1;
    const before = world.player.potions;

    const deps = { rng: createRng(1), equipped: {}, onLoot: () => {}, onKill: () => {} };
    stepWorld(world, deps);

    expect(before - world.player.potions).toBe(1);
  });

  it('冷却期内血再低也不喝', () => {
    const world = freshWorld();
    world.player.hp = 1;

    const deps = { rng: createRng(1), equipped: {}, onLoot: () => {}, onKill: () => {} };
    stepWorld(world, deps);
    const afterFirst = world.player.potions;

    // 冷却还没过，再跑几帧（每帧都把血压回去）
    const frames = Math.floor(POTION_COOLDOWN / TICK_SECONDS) - 1;
    for (let i = 0; i < frames; i++) {
      world.player.hp = 1;
      stepWorld(world, deps);
    }
    expect(world.player.potions).toBe(afterFirst);
  });

  it('冷却过了就能再喝', () => {
    const world = freshWorld();
    world.player.hp = 1;

    const deps = { rng: createRng(1), equipped: {}, onLoot: () => {}, onKill: () => {} };
    stepWorld(world, deps);
    const afterFirst = world.player.potions;

    const waitFrames = Math.ceil(POTION_COOLDOWN / TICK_SECONDS) + 1;
    for (let i = 0; i < waitFrames; i++) {
      world.player.hp = 1;
      stepWorld(world, deps);
    }
    expect(world.player.potions).toBeLessThan(afterFirst);
  });

  it('冷却常量必须是正数，否则等于没有冷却', () => {
    expect(POTION_COOLDOWN).toBeGreaterThan(0);
  });
});
