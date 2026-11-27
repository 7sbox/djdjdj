import type { SkillDef, WeaponKind } from '../types';
import { SKILLS } from './combat-defs';

/** 技能栏槽位顺序：0 普攻 / 1 2 主动 / 3 位移保命。 */
export const SKILL_SLOTS = [0, 1, 2, 3] as const;

/**
 * 某个武器种类能用的技能，按槽位 0→3 排好。
 * 武器决定武学，武学决定技能 —— 换把武器，这四个槽整排换掉。
 */
export function skillsForWeapon(kind: WeaponKind): SkillDef[] {
  return SKILLS
    .filter((s) => s.weaponKinds.includes(kind))
    .sort((a, b) => a.slot - b.slot);
}
