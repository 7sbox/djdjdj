import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, setWeaponKind, stepWorld } from './world';
import type { Item, SlotId } from '../types';

function makeWorld() {
  const rng = createRng(11);
  const equipped: Partial<Record<SlotId, Item>> = {};
  const world = createWorld({ rng, floorId: 'f1', equipped });
  world.player.level = 10;
  return { rng, world, equipped };
}

describe('换武器时冷却表跟着重置', () => {
  it('从剑换到刀：剑招剩下的冷却是剑的事，取消掉', () => {
    const { world } = makeWorld();
    world.player.weaponKind = 'sword';
    world.player.cooldowns = { sk_sword_swirl: 4.2, sk_sword_pierce: 1.5 };

    setWeaponKind(world, 'blade');

    expect(world.player.weaponKind).toBe('blade');
    expect(world.player.cooldowns.sk_sword_swirl ?? 0).toBe(0);
    expect(world.player.cooldowns.sk_sword_pierce ?? 0).toBe(0);
  });

  it('刀换回剑同理，刀招的冷却不带到剑上', () => {
    const { world } = makeWorld();
    world.player.weaponKind = 'blade';
    world.player.cooldowns = { sk_blade_cleave: 5 };

    setWeaponKind(world, 'sword');

    expect(world.player.weaponKind).toBe('sword');
    expect(world.player.cooldowns.sk_blade_cleave ?? 0).toBe(0);
  });

  it('换的是同一把武器就不动冷却，免得反复点装备刷 CD', () => {
    const { world } = makeWorld();
    world.player.weaponKind = 'blade';
    world.player.cooldowns = { sk_blade_sunder: 3 };

    setWeaponKind(world, 'blade');

    expect(world.player.cooldowns.sk_blade_sunder).toBe(3);
  });

  it('换武器后在战斗里真的放得出新武器的招（不是白换）', () => {
    // 不清冷却的对照组：刀招挂着 99 秒冷却，一整轮下来都放不出去
    const blocked = makeWorld().world;
    blocked.player.weaponKind = 'blade';
    blocked.player.cooldowns = { sk_blade_sunder: 99 };
    blocked.controls.skillPriority = ['sk_blade_sunder'];

    // 换装以后：冷却表被重置，刀招立刻能放
    const swapped = makeWorld().world;
    swapped.player.weaponKind = 'sword';
    swapped.player.cooldowns = { sk_blade_sunder: 99 };
    setWeaponKind(swapped, 'blade');
    swapped.controls.skillPriority = ['sk_blade_sunder'];

    for (const w of [blocked, swapped]) {
      w.monsters[0]!.pos = { ...w.player.pos };
      w.player.attackCd = 0;
      for (let i = 0; i < 3; i++) {
        stepWorld(w, { rng: createRng(i), equipped: {}, onLoot: () => {}, onKill: () => {} });
      }
    }

    expect(blocked.player.cooldowns.sk_blade_sunder ?? 0).toBeGreaterThan(90);
    expect(swapped.player.cooldowns.sk_blade_sunder ?? 0).toBeGreaterThan(0);
    expect(swapped.player.cooldowns.sk_blade_sunder).toBeLessThan(90);
  });
});
