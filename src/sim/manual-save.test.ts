import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { drawScroll, emptyManualState, MANUALS } from './manual';
import { createWorld } from './world';
import { rollItem } from './loot';
import type { Item, SlotId } from '../types';

/**
 * 残卷与残页必须进存档，否则关掉游戏就全没了 —— 抽卡的全部投入打水漂。
 *
 * 另一个方向同样重要：**旧存档没有这两个字段时不能判定为损坏**。
 * 玩家更新一次游戏就丢档，比不能抽卡严重得多。
 */

const SWORD_MANUAL = MANUALS[0]!;

describe('世界状态里带着秘籍收藏', () => {
  it('新世界是空收藏、零残页', () => {
    const world = createWorld({ rng: createRng(1), floorId: 'f1', equipped: {} });
    expect(world.manual.fragments).toEqual([]);
    expect(world.manual.completed).toEqual([]);
    expect(world.player.scrollPages).toBe(0);
  });

  it('createWorld 可以注入收藏（读档路径）', () => {
    const manual = {
      fragments: [...SWORD_MANUAL.fragments],
      completed: [SWORD_MANUAL.id],
    };
    const world = createWorld({ rng: createRng(2), floorId: 'f1', equipped: {}, manual });
    expect(world.manual.completed).toEqual([SWORD_MANUAL.id]);
    expect(world.manual.fragments).toHaveLength(4);
  });
});

describe('抽卡与世界的衔接', () => {
  it('抽到的残卷能并入世界状态，且集齐后立即可用', () => {
    const rng = createRng(3);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    world.player.gold = 100_000;
    world.player.scrollPages = 100;

    let completed: string | null = null;
    for (let i = 0; i < 50 && !completed; i++) {
      const res = drawScroll(world.manual, {
        gold: world.player.gold,
        scrollPages: world.player.scrollPages,
      }, rng);
      if (!res.ok) break;
      world.manual = res.value.manual;
      world.player.gold = res.value.wallet.gold;
      world.player.scrollPages = res.value.wallet.scrollPages;
      completed = res.value.completedManualId;
    }

    expect(completed).toBe(SWORD_MANUAL.id);
    expect(world.manual.completed).toContain(SWORD_MANUAL.id);
  });

  it('抽卡扣的是玩家真实的金币与残页', () => {
    const rng = createRng(4);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    world.player.gold = 5000;
    world.player.scrollPages = 5;

    const goldBefore = world.player.gold;
    const pagesBefore = world.player.scrollPages;

    const res = drawScroll(world.manual, {
      gold: world.player.gold,
      scrollPages: world.player.scrollPages,
    }, rng);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    world.player.gold = res.value.wallet.gold;
    world.player.scrollPages = res.value.wallet.scrollPages;

    expect(world.player.gold).toBe(goldBefore - 500);
    expect(world.player.scrollPages).toBeLessThanOrEqual(pagesBefore);
  });
});

describe('空收藏不影响战斗', () => {
  it('空收藏下世界照常创建、照常有怪物', () => {
    const world = createWorld({ rng: createRng(5), floorId: 'f1', equipped: {} });
    expect(world.monsters.length).toBeGreaterThan(0);
    expect(emptyManualState().completed).toHaveLength(0);
  });

  it('带装备时也能正常创建', () => {
    const gear: Partial<Record<SlotId, Item>> = {
      weapon: rollItem({ slot: 'weapon', itemLevel: 5, rarity: 'blue', weaponKind: 'sword' }, createRng(6)),
    };
    const world = createWorld({ rng: createRng(7), floorId: 'f1', equipped: gear });
    expect(world.player.weaponKind).toBe('sword');
  });
});
