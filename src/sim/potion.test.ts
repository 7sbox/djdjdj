import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { POTION_PRICE, TICK_SECONDS, WANTED_POTIONS, buyPotion, createWorld, resumeFarming, stepWorld } from './world';
import type { Item, SlotId } from '../types';

/**
 * 丹药是挂机的续命资源（见 ADR-0005：吃不吃药是玩家三个开关之一）。
 *
 * 以前丹药只有开局那 5 颗，喝完之后永远补不上 —— 挂到第 20 分钟开始就必然
 * 「吃药也救不回来」，30 分钟能死十几次。药是消耗品没错，但消耗品必须能买。
 */
describe('丹药买得到', () => {
  it('钱够就买得到，一次补到上限', () => {
    const world = createWorld({ rng: createRng(1), floorId: 'f1', equipped: {} });
    world.player.potions = 0;
    world.player.gold = POTION_PRICE * 20;

    const res = buyPotion(world);
    expect(res.ok).toBe(true);
    expect(world.player.potions).toBeGreaterThan(0);
    expect(world.player.gold).toBeLessThan(POTION_PRICE * 20);
    // 不能超过携带上限
    expect(world.player.potions).toBeLessThanOrEqual(WANTED_POTIONS);
  });

  it('钱不够就买不到，且一分钱都不扣', () => {
    const world = createWorld({ rng: createRng(1), floorId: 'f1', equipped: {} });
    world.player.potions = 0;
    world.player.gold = 0;

    const res = buyPotion(world);
    expect(res.ok).toBe(false);
    expect(world.player.gold).toBe(0);
    expect(world.player.potions).toBe(0);
  });

  it('已经满了就不卖给你，别浪费钱', () => {
    const world = createWorld({ rng: createRng(1), floorId: 'f1', equipped: {} });
    world.player.potions = WANTED_POTIONS;
    world.player.gold = POTION_PRICE * 20;

    const res = buyPotion(world);
    expect(res.ok).toBe(false);
    expect(world.player.gold).toBe(POTION_PRICE * 20);
  });

  it('自动补丹真的会补：丹囊见底后靠刷怪的钱又涨回来', () => {
    // 注意这里守的不是「药能救命」——实测 6 只怪贴身每秒约 35 点伤害，
    // 444 血撑不到 13 秒，而一颗药只回 155。瓶颈在承伤，不在补给。
    // 这里守的是「补给链通着」：有钱就补得上，不会永久卡在 0 颗。
    const rng = createRng(4242);
    const equipped: Partial<Record<SlotId, Item>> = {};
    const world = createWorld({ rng, floorId: 'f1', equipped });
    world.player.gold = 0;
    world.player.potions = 0;

    const deps = { rng, equipped, onLoot: (_i: Item) => {}, onKill: () => {} };
    let sawRefill = false;
    for (let i = 0; i < Math.round((30 * 60) / TICK_SECONDS); i++) {
      if (world.interrupted) resumeFarming(world, rng);
      stepWorld(world, deps);
      if (world.player.potions > 0) sawRefill = true;
    }

    expect(sawRefill, '整整 30 分钟一次都没补上药，补给链是断的').toBe(true);
  });
});
