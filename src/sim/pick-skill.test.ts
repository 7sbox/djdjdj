import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, pickSkill, playerStats } from './world';
import type { Item, SlotId } from '../types';

function worldWith(kind: 'sword' | 'blade', skillPriority: string[]) {
  const rng = createRng(7);
  const equipped: Partial<Record<SlotId, Item>> = {};
  const world = createWorld({ rng, floorId: 'f1', equipped });
  world.player.level = 10; // 主动技全部解锁
  world.player.weaponKind = kind;
  world.controls.skillPriority = skillPriority;
  return { rng, equipped, world };
}

describe('换装成刀后，自动武学只挑刀系技能', () => {
  it('优先级表里同时挂着剑与刀，拿刀时永远不出剑招', () => {
    const { equipped, world } = worldWith('blade', [
      'sk_sword_swirl', 'sk_sword_pierce', 'sk_blade_cleave', 'sk_blade_sunder',
    ]);
    const stats = playerStats(world, equipped);

    const picked: string[] = [];
    for (let i = 0; i < 40; i++) {
      const s = pickSkill(world, stats);
      if (s) picked.push(s.id);
      // 清掉所有冷却，下一轮还能再挑
      for (const k of Object.keys(world.player.cooldowns)) world.player.cooldowns[k] = 0;
    }

    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((id) => id.startsWith('sk_blade_'))).toBe(true);
  });

  it('拿剑时正好反过来，只出剑招', () => {
    const { equipped, world } = worldWith('sword', [
      'sk_blade_sunder', 'sk_sword_swirl',
    ]);
    const stats = playerStats(world, equipped);

    const picked: string[] = [];
    for (let i = 0; i < 20; i++) {
      const s = pickSkill(world, stats);
      if (s) picked.push(s.id);
      for (const k of Object.keys(world.player.cooldowns)) world.player.cooldowns[k] = 0;
    }

    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((id) => id.startsWith('sk_sword_'))).toBe(true);
  });

  it('优先级里只有另一把武器的招时，宁可不放技能也不出别人的招', () => {
    const { equipped, world } = worldWith('blade', ['sk_sword_swirl']);
    const stats = playerStats(world, equipped);
    expect(pickSkill(world, stats)).toBeNull();
  });
});
