import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, pickSkill, playerStats } from './world';
import { emptyManualState, MANUALS } from './manual';
import { candidatesForSlot, skillsForWeapon, skillsForWeaponWithLearned } from '../data/skills';
import { skillsForWeapon as plainFor } from '../data/skills';
import type { ManualState } from './manual';

/**
 * 「习得的那招真的能用」是这张票的最终验收。
 *
 * 抽卡抽到东西不算完成 —— 集齐秘籍之后，那一招必须出现在技能栏的可选里，
 * 并且真的能被自动武学挑去放出来。否则抽卡就是装饰品。
 */

const SWORD_MANUAL = MANUALS[0]!;
const LEARNED: ManualState = {
  fragments: [...SWORD_MANUAL.fragments],
  completed: [SWORD_MANUAL.id],
};

describe('技能栏：默认只有等级给的', () => {
  it('没习得时，剑系技能栏不含秘籍招式', () => {
    const ids = skillsForWeapon('sword').map((s) => s.id);
    expect(ids).not.toContain(SWORD_MANUAL.skillId);
  });

  it('没习得时，槽位 2 的候选只有穿云式', () => {
    const names = candidatesForSlot('sword', 2, []).map((s) => s.name);
    expect(names).toEqual(['穿云式']);
  });

  it('习得之后，槽位 2 出现第二个候选', () => {
    const names = candidatesForSlot('sword', 2, [SWORD_MANUAL.skillId]).map((s) => s.name);
    expect(names).toContain('穿云式');
    expect(names).toContain('连星贯日');
  });

  it('空检索与不传已习得清单的行为一致（默认就是等级给的）', () => {
    expect(skillsForWeaponWithLearned('sword', []).map((s) => s.id)).toEqual(
      plainFor('sword').map((s) => s.id),
    );
  });

  it('习得不会让技能栏膨胀出第五个槽', () => {
    const all = skillsForWeaponWithLearned('sword', [SWORD_MANUAL.skillId]);
    const slots = new Set(all.map((s) => s.slot));
    expect(slots).toEqual(new Set([0, 1, 2, 3]));
  });
});

describe('习得的招式真的能自动放出来', () => {
  it('只把连星贯日排进优先级表时，pickSkill 会挑它', () => {
    const rng = createRng(1);
    const world = createWorld({ rng, floorId: 'f1', equipped: {}, manual: LEARNED });
    world.controls.skillPriority = [SWORD_MANUAL.skillId];
    world.controls.autoSkills = true;

    const picked = pickSkill(world, playerStats(world, {}));
    expect(picked?.id).toBe(SWORD_MANUAL.skillId);
  });

  it('未习得时，把它排进优先级表也不会被挑中（不能靠改表绕过习得）', () => {
    const rng = createRng(2);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    world.controls.skillPriority = [SWORD_MANUAL.skillId];
    world.controls.autoSkills = true;

    const picked = pickSkill(world, playerStats(world, {}));
    expect(picked?.id).not.toBe(SWORD_MANUAL.skillId);
  });
});

describe('秘籍招与既有招是选择关系，不是叠加', () => {
  it('连星贯日的倍率低于穿云式，冷却长于回风扫叶', () => {
    const pierce = candidatesForSlot('sword', 2, []).find((s) => s.name === '穿云式')!;
    const chain = candidatesForSlot('sword', 2, [SWORD_MANUAL.skillId]).find(
      (s) => s.name === '连星贯日',
    )!;

    const swirl = skillsForWeapon('sword').find((s) => s.name === '回风扫叶')!;

    // 换的是玩法轴，不是更大的数字
    expect(chain.power).toBeLessThan(pierce.power);
    expect(chain.cooldown).toBeGreaterThan(swirl.cooldown);
    // 覆盖面确实更大
    expect(chain.radius).toBeGreaterThan(swirl.radius);
  });

  it('空收藏与满收藏下，等级给的招式不变（抽卡不替换等级线）', () => {
    const withNothing = skillsForWeaponWithLearned('sword', []);
    const withManual = skillsForWeaponWithLearned('sword', [SWORD_MANUAL.skillId]);
    // 等级给的三个非秘籍招式仍然都在
    for (const name of ['劈山式', '回风扫叶', '穿云式', '游身步']) {
      expect(withNothing.some((s) => s.name === name)).toBe(true);
      expect(withManual.some((s) => s.name === name)).toBe(true);
    }
  });

  it('空收藏时 ManualState 不含任何习得', () => {
    const st = emptyManualState();
    expect(st.completed).toHaveLength(0);
  });
});
