import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { TICK_SECONDS, createWorld, resumeFarming, stepWorld } from './world';
import type { Item, SlotId } from '../types';

/**
 * 「垃圾有没有出口」：挂机省心的默认值之一是自动拆解凡品。
 *
 * 不开这个开关时，背包只有 80 格、10 分钟才掉 20 来件，玩家永远等不到「满了」
 * 那一刻，拆解这条出口在头十分钟里根本不可达。打开之后，凡品边掉边拆，
 * 强化矿自己进来 —— 这正是「挂机省心」该有的样子。
 */
describe('自动拆解凡品（挂机开关）', () => {
  it('默认关闭：默认值不能替玩家做决定', () => {
    const world = createWorld({ rng: createRng(1), floorId: 'f1', equipped: {} });
    expect(world.controls.autoSalvageCommon).toBe(false);
  });

  it('打开后，掉落的凡品不占背包，直接变成强化矿', () => {
    const rng = createRng(3);
    const equipped: Partial<Record<SlotId, Item>> = {};
    const world = createWorld({ rng, floorId: 'f1', equipped });
    world.controls.autoSalvageCommon = true;

    const kept: Item[] = [];
    const deps = {
      rng,
      equipped,
      onLoot: (item: Item) => kept.push(item),
      onKill: () => {},
    };
    for (let i = 0; i < Math.round((30 * 60) / TICK_SECONDS); i++) {
      if (world.interrupted) resumeFarming(world, rng);
      stepWorld(world, deps);
    }

    const commons = kept.filter((i) => i.rarity === 'common');
    expect(commons, '凡品还是进了背包').toHaveLength(0);
    expect(world.player.ore, '拆了凡品却没拿到矿').toBeGreaterThan(0);
    // 每件凡品拆 1 矿，矿的总量应当与「本该掉落的凡品数」对得上
    expect(world.player.ore).toBeGreaterThanOrEqual(commons.length);
  });

  it('关掉后凡品照常进背包', () => {
    const rng = createRng(3);
    const equipped: Partial<Record<SlotId, Item>> = {};
    const world = createWorld({ rng, floorId: 'f1', equipped });
    world.controls.autoSalvageCommon = false;

    const kept: Item[] = [];
    const deps = { rng, equipped, onLoot: (item: Item) => kept.push(item), onKill: () => {} };
    for (let i = 0; i < Math.round((30 * 60) / TICK_SECONDS); i++) {
      if (world.interrupted) resumeFarming(world, rng);
      stepWorld(world, deps);
    }
    expect(kept.some((i) => i.rarity === 'common'), '关掉开关后凡品被吃掉了').toBe(true);
  });
});
