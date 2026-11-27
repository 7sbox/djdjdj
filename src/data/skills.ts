import type { SkillDef, WeaponKind } from '../types';
import { MANUAL_SKILL_IDS, SKILLS } from './combat-defs';

/**
 * 某个武器谱系能放进技能栏的技能，按槽位 0→3 排好。
 * 武器决定武学，武学决定技能 —— 换把武器，这四个槽整排换掉。
 *
 * 只收**占槽**的招式：刀剑各自四招。通用的「服丹」不占槽，见 skillFitsWeapon。
 *
 * 秘籍招式（见 manual.ts）默认**不在**这里 —— 它和同槽位的既有招式竞争，
 * 玩家习得后自行替换（见 skillsForWeaponWithLearned）。所以不传已习得清单时，
 * 返回的就是**等级给的**那四招，这是技能栏的默认样子。
 */
export function skillsForWeapon(kind: WeaponKind): SkillDef[] {
  return skillsForWeaponWithLearned(kind, []).reduce<SkillDef[]>((acc, s) => {
    // 每个槽位只取第一个：秘籍招与既有招同槽，默认让既有招占着
    if (!acc.some((x) => x.slot === s.slot)) acc.push(s);
    return acc;
  }, []);
}

/**
 * 技能栏的完整候选：等级给的 + 已习得的秘籍招。
 *
 * 同一个槽位可能有多个候选（穿云式 vs 连星贯日），由玩家选一个装上 ——
 * 抽卡给的是**选择权**，不是多一个按钮。这正落在「构建」的乐趣上。
 */
export function skillsForWeaponWithLearned(
  kind: WeaponKind,
  learnedSkillIds: readonly string[],
): SkillDef[] {
  return SKILLS.filter(
    (s) =>
      s.weaponKinds.length > 0 &&
      s.weaponKinds.includes(kind) &&
      (!MANUAL_SKILL_IDS.has(s.id) || learnedSkillIds.includes(s.id)),
  ).sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
}

/** 某个槽位上的全部候选（用于「这一槽你能选哪几招」）。 */
export function candidatesForSlot(
  kind: WeaponKind,
  slot: 0 | 1 | 2 | 3,
  learnedSkillIds: readonly string[],
): SkillDef[] {
  return skillsForWeaponWithLearned(kind, learnedSkillIds).filter((s) => s.slot === slot);
}

/**
 * **装配后的技能栏**：每槽恰好一个，同槽多候选时由优先级表决定谁胜出。
 *
 * 这是「二选一」真正生效的地方。对比三个入口，别用错：
 * - `skillsForWeaponWithLearned`：全部候选（可能同槽多个）—— 给「选哪招」的界面用。
 * - `candidatesForSlot`：某一槽的候选 —— 给「这一槽二选一」的界面用。
 * - 本函数：最终装上身的四招 —— 给**技能栏渲染**用。它保证不会出现五格。
 *
 * 没有优先级表里的（或表里那条本武器用不了），就退回该槽的默认招。
 */
export function equippedSkillBar(
  kind: WeaponKind,
  learnedSkillIds: readonly string[],
  skillPriority: readonly string[],
): SkillDef[] {
  const out: SkillDef[] = [];
  for (const slot of [0, 1, 2, 3] as const) {
    const cands = candidatesForSlot(kind, slot, learnedSkillIds);
    if (cands.length === 0) continue;

    // 优先级表里排最前的那个候选胜出（普攻槽不参与选择）
    const preferred =
      slot === 0
        ? undefined
        : skillPriority
            .map((id) => cands.find((c) => c.id === id))
            .find((c) => c !== undefined);

    out.push(preferred ?? cands[0]!);
  }
  return out;
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

/** 当前武器的普攻。武器决定武学，普攻的倍率也一样跟着换。 */
export function basicSkillFor(kind: WeaponKind): SkillDef | undefined {
  return skillsForWeapon(kind).find((s) => s.slot === 0);
}
