import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, stepWorld } from './world';
import { priorityForWeapon, prioritySkillsFor, reorderForWeapon } from './skill-order';

function makeWorld(seed = 1) {
  const rng = createRng(seed);
  const world = createWorld({ rng, floorId: 'f1', equipped: {} });
  return { rng, world };
}

/** 剑的两招：回风扫叶（1 号槽）与穿云式（2 号槽）。 */
const SWIRL = 'sk_sword_swirl';
const PIERCE = 'sk_sword_pierce';

describe('优先级视图：只收主动技', () => {
  it('普攻（0 号槽）与位移保命（3 号槽）不参与排序', () => {
    expect(prioritySkillsFor('sword').map((s) => s.id)).toEqual([SWIRL, PIERCE]);
    expect(prioritySkillsFor('blade').map((s) => s.id)).toEqual([
      'sk_blade_cleave',
      'sk_blade_sunder',
    ]);
  });

  it('表里混着普攻、游身步和别的武器，也只挑出本武器的主动技', () => {
    const ids = ['sk_sword_basic', 'sk_blade_sunder', SWIRL, 'sk_sword_step', PIERCE];
    expect(priorityForWeapon(ids, 'sword')).toEqual([SWIRL, PIERCE]);
  });

  it('表里漏掉的主动技补在后面，重复的只留一次', () => {
    expect(priorityForWeapon([PIERCE, PIERCE], 'sword')).toEqual([PIERCE, SWIRL]);
    expect(priorityForWeapon([], 'sword')).toEqual([SWIRL, PIERCE]);
  });

  it('换刀之后就只看刀的两招，剑招不会混进来', () => {
    expect(priorityForWeapon([SWIRL, PIERCE], 'blade')).toEqual([
      'sk_blade_cleave',
      'sk_blade_sunder',
    ]);
  });
});

describe('拖拽重排：拖到谁身上就顶替谁的位置', () => {
  it('把穿云式拖到回风扫叶的位置上，两位互换', () => {
    expect(reorderForWeapon([SWIRL, PIERCE], 'sword', PIERCE, SWIRL)).toEqual([PIERCE, SWIRL]);
  });

  it('拖回原位不改变任何东西', () => {
    expect(reorderForWeapon([SWIRL, PIERCE], 'sword', SWIRL, SWIRL)).toEqual([SWIRL, PIERCE]);
  });

  it('认不出的 id、别的武器的招，一律不动', () => {
    const before = [SWIRL, PIERCE];
    expect(reorderForWeapon(before, 'sword', 'sk_not_exist', SWIRL)).toEqual(before);
    expect(reorderForWeapon(before, 'sword', SWIRL, 'sk_blade_sunder')).toEqual(before);
  });

  it('别的武器的条目留在原处，只换本武器那几位', () => {
    const before = ['sk_blade_sunder', SWIRL, 'sk_blade_cleave', PIERCE];
    expect(reorderForWeapon(before, 'sword', PIERCE, SWIRL)).toEqual([
      'sk_blade_sunder',
      PIERCE,
      'sk_blade_cleave',
      SWIRL,
    ]);
  });

  it('表里本来没有本武器技能时，拖完就补齐到末尾', () => {
    // 旧存档只有剑招，玩家换了刀：刀的两招要能被拖出来
    expect(reorderForWeapon([SWIRL, PIERCE], 'blade', 'sk_blade_sunder', 'sk_blade_cleave')).toEqual([
      SWIRL,
      PIERCE,
      'sk_blade_sunder',
      'sk_blade_cleave',
    ]);
  });

  it('不改调用方传进来的数组（就地改会让渲染层漏掉更新）', () => {
    const before = [SWIRL, PIERCE];
    reorderForWeapon(before, 'sword', PIERCE, SWIRL);
    expect(before).toEqual([SWIRL, PIERCE]);
  });
});

describe('改完顺序立刻生效', () => {
  it('默认先放回风扫叶', () => {
    const { rng, world } = makeWorld();
    stepWorld(world, { rng, equipped: {}, onLoot: () => {}, onKill: () => {} });
    expect(world.player.cooldowns[SWIRL]).toBeGreaterThan(0);
    expect(world.player.cooldowns[PIERCE] ?? 0).toBe(0);
  });

  it('把穿云式拖到第一位之后，下一次出手就改放穿云式', () => {
    const { rng, world } = makeWorld();
    world.controls.skillPriority = reorderForWeapon(
      world.controls.skillPriority,
      world.player.weaponKind,
      PIERCE,
      SWIRL,
    );

    stepWorld(world, { rng, equipped: {}, onLoot: () => {}, onKill: () => {} });
    expect(world.player.cooldowns[PIERCE]).toBeGreaterThan(0);
    expect(world.player.cooldowns[SWIRL] ?? 0).toBe(0);
  });

  it('新档的优先级就是本武器的两个主动技，不含普攻与游身步', () => {
    const { world } = makeWorld();
    expect(priorityForWeapon(world.controls.skillPriority, world.player.weaponKind)).toEqual([
      SWIRL,
      PIERCE,
    ]);
  });
});
