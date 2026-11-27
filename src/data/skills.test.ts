import { describe, expect, it } from 'vitest';
import { basicSkillFor, skillFitsWeapon, skillsForWeapon } from './skills';
import { skillById } from './combat-defs';

describe('武学随武器切换：技能栏按武器谱系取四槽', () => {
  it('拿刀时四个槽就是刀系四招', () => {
    expect(skillsForWeapon('blade').map((s) => s.name)).toEqual([
      '断岳斩', '横扫千军', '开碑手', '卸甲势',
    ]);
  });

  it('拿剑时四个槽还是剑系四招', () => {
    expect(skillsForWeapon('sword').map((s) => s.name)).toEqual([
      '劈山式', '回风扫叶', '穿云式', '游身步',
    ]);
  });

  it('四槽按 0 普攻 / 1 2 主动 / 3 位移保命排好', () => {
    for (const kind of ['sword', 'blade'] as const) {
      expect(skillsForWeapon(kind).map((s) => s.slot)).toEqual([0, 1, 2, 3]);
    }
  });

  it('普攻一定是 0 号槽那招，刀与剑各有各的', () => {
    expect(basicSkillFor('blade')?.name).toBe('断岳斩');
    expect(basicSkillFor('sword')?.name).toBe('劈山式');
  });
});

describe('「能用」与「占槽」是两件事', () => {
  it('服丹任何武器都能用，但它不占技能栏的槽', () => {
    const potion = skillById('sk_potion');
    expect(skillFitsWeapon(potion, 'sword')).toBe(true);
    expect(skillFitsWeapon(potion, 'blade')).toBe(true);
    expect(skillsForWeapon('blade').some((s) => s.id === 'sk_potion')).toBe(false);
  });

  it('刀招对剑不可用，剑招对刀也不可用', () => {
    expect(skillFitsWeapon(skillById('sk_blade_sunder'), 'sword')).toBe(false);
    expect(skillFitsWeapon(skillById('sk_sword_pierce'), 'blade')).toBe(false);
  });
});
