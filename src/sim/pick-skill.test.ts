import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  createWorld,
  pickSkill,
  playerStats,
  setWeaponKind,
  weaponKindFromEquipped,
} from './world';
import type { Item, SlotId } from '../types';
import { rollItem } from './loot';

/** 一身只有武器的装备。刀就从这里来 —— 不手改 weaponKind。 */
function gearOf(kind: 'sword' | 'blade'): Partial<Record<SlotId, Item>> {
  return { weapon: rollItem({ slot: 'weapon', itemLevel: 5, rarity: 'blue', weaponKind: kind }, createRng(5)) };
}

/** 真的走一遍「换上这件武器」：装备栏 → 武器谱系 → 重置冷却。 */
function equipWeapon(world: ReturnType<typeof createWorld>, gear: Partial<Record<SlotId, Item>>) {
  setWeaponKind(world, weaponKindFromEquipped(gear));
}

/** 连挑 40 次，每次挑完把冷却抹掉，看出手的到底是哪几招。 */
function whatGetsCast(world: ReturnType<typeof createWorld>, gear: Partial<Record<SlotId, Item>>, times = 40) {
  const stats = playerStats(world, gear);
  const picked: string[] = [];
  for (let i = 0; i < times; i++) {
    const s = pickSkill(world, stats);
    if (s) picked.push(s.id);
    for (const k of Object.keys(world.player.cooldowns)) world.player.cooldowns[k] = 0;
  }
  return picked;
}

function makeWorld(seed = 7) {
  const rng = createRng(seed);
  const world = createWorld({ rng, floorId: 'f1', equipped: {} });
  world.player.level = 10; // 主动技全部解锁
  return world;
}

describe('装备刀之后，自动武学只挑刀系技能', () => {
  it('真装上刀：优先级表里剑招排在刀招前面也没用，出的全是刀招', () => {
    const gear = gearOf('blade');
    const world = makeWorld();
    equipWeapon(world, gear);
    world.controls.skillPriority = [
      'sk_sword_swirl', 'sk_sword_pierce', 'sk_blade_cleave', 'sk_blade_sunder',
    ];

    const picked = whatGetsCast(world, gear);

    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((id) => id.startsWith('sk_blade_'))).toBe(true);
  });

  it('拿剑时反过来，只出剑招', () => {
    const gear = gearOf('sword');
    const world = makeWorld();
    equipWeapon(world, gear);
    world.controls.skillPriority = ['sk_blade_sunder', 'sk_sword_swirl'];

    const picked = whatGetsCast(world, gear, 20);

    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((id) => id.startsWith('sk_sword_'))).toBe(true);
  });

  it('优先级里只有另一把武器的招时，退到本武器的招，绝不出别人的招', () => {
    const gear = gearOf('blade');
    const world = makeWorld();
    equipWeapon(world, gear);
    world.controls.skillPriority = ['sk_sword_swirl'];

    const def = pickSkill(world, playerStats(world, gear));

    expect(def).not.toBeNull();
    expect(def!.id.startsWith('sk_blade_')).toBe(true);
  });

  it('旧档留下的剑系优先级表，换上刀也照样能出招（不用玩家手改存档）', () => {
    const gear = gearOf('blade');
    const world = makeWorld();
    equipWeapon(world, gear);
    // 老档就这三条，一条刀招都没有
    world.controls.skillPriority = ['sk_sword_swirl', 'sk_sword_pierce', 'sk_sword_step'];

    expect(whatGetsCast(world, gear).length).toBeGreaterThan(0);
  });
});
