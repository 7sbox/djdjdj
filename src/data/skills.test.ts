import { describe, expect, it } from 'vitest';
import { skillsForWeapon } from './skills';

describe('武学随武器切换：技能栏按武器种类取四槽', () => {
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
});
