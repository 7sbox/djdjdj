import type { SkillDef, WeaponKind } from '../types';
import { SKILLS } from './combat-defs';

/**
 * 某个武器谱系能放进技能栏的技能，按槽位 0→3 排好。
 * 武器决定武学，武学决定技能 —— 换把武器，这四个槽整排换掉。
 *
 * 只收**占槽**的招式：刀剑各自四招。通用的「服丹」不占槽，见 skillFitsWeapon。
 */
export function skillsForWeapon(kind: WeaponKind): SkillDef[] {
  return SKILLS
    .filter((s) => s.weaponKinds.length > 0 && s.weaponKinds.includes(kind))
    .sort((a, b) => a.slot - b.slot);
}

/**
 * 能不能用，和占不占槽，是两个问题。
 *
 * - 占槽：skillsForWeapon —— 决定技能栏显示哪四招。
 * - 能用：这里 —— 决定自动武学放不放得出来。weaponKinds 为空表示通用（如服丹），
 *   任何武器都能用，但它不出现在技能栏里。
 *
 * 这两件事必须一处说了算，否则会出现「挑得出来、却不在栏里」的矛盾。
 */
export function skillFitsWeapon(def: SkillDef, kind: WeaponKind): boolean {
  return def.weaponKinds.length === 0 || def.weaponKinds.includes(kind);
}

/**
 * 占不占「可以排优先级」的那两个槽：1、2 号槽。三个问题一处说了算：
 *
 * - 普攻（0 号槽）自动放，不参与排序；
 * - 位移/保命（3 号槽，如游身步、卸甲势）有自己的开关，也不参与。
 *
 * 挑招（world.pickSkill）与拖拽（sim.skill-order）都必须走这一个判定，
 * 否则「拖得动、却永远轮不到」或者反过来，两边就会分叉。
 */
export function isPrioritySlot(def: SkillDef): boolean {
  return def.slot === 1 || def.slot === 2;
}

/** 当前武器的普攻。武器决定武学，普攻的倍率也一样跟着换。 */
export function basicSkillFor(kind: WeaponKind): SkillDef | undefined {
  return skillsForWeapon(kind).find((s) => s.slot === 0);
}
