import type { SkillDef, WeaponKind } from '../types';
import { isPrioritySlot, skillsForWeapon } from '../data/skills';

/**
 * 技能优先级排序的纯逻辑。界面只负责拖动，重排规则都在这里，
 * 这样「拖完之后战斗里先放哪一招」能被单独测到。
 *
 * 4 个槽：0=普攻（自动，不参与）1/2=主动技（参与）3=位移/保命（不参与）。
 * 「哪些槽参与排序」由 data/skills 的 isPrioritySlot 一处说了算，这里不另立判定。
 *
 * 优先级表是跨武器留着的（见 world.pickSkill）：拿刀的人表里仍可能挂着剑招。
 * 所以这里只编排「当前武器能排的主动技」，别的条目一个字都不动。
 */

/** 某武器谱系下参与排序的主动技，按槽位号排。 */
export function prioritySkillsFor(kind: WeaponKind): SkillDef[] {
  return skillsForWeapon(kind).filter(isPrioritySlot);
}

/**
 * 当前武器看到的优先级：先按表里已有的顺序，再把表里漏掉的补在后面。
 * 存档里带来的旧顺序、换武器之后的空表，都在这里被理顺成「一个不多一个不少」。
 */
export function priorityForWeapon(ids: readonly string[], kind: WeaponKind): string[] {
  const eligible = prioritySkillsFor(kind).map((s) => s.id);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const id of ids) {
    if (!eligible.includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of eligible) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

/**
 * 把 fromId 拖到 toId 的位置上，其余顺延 —— 只在本武器的主动技之间换位。
 *
 * 其它武器的条目留在数组原处不动；表里本来没有的本武器技能，
 * 重排后补齐到末尾，这样拖完一次就一定排得动。
 * 认不出的 id、拖回原位都原样返回一个新数组（不改入参）。
 */
export function reorderForWeapon(
  ids: readonly string[],
  kind: WeaponKind,
  fromId: string,
  toId: string,
): string[] {
  const unchanged = [...ids];
  const eligible = new Set(prioritySkillsFor(kind).map((s) => s.id));
  const ordered = priorityForWeapon(ids, kind);

  const from = ordered.indexOf(fromId);
  const to = ordered.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return unchanged;

  ordered.splice(from, 1);
  ordered.splice(to, 0, fromId);

  // 写回：本武器主动技占着哪些位置，就按那些位置的先后铺新顺序
  const out = [...ids];
  let i = 0;
  for (let k = 0; k < out.length && i < ordered.length; k++) {
    if (eligible.has(out[k]!)) out[k] = ordered[i++]!;
  }
  while (i < ordered.length) out.push(ordered[i++]!);

  // 表里本来有重复时，把多出来的那几份清掉，只留第一次出现的位置
  const seen = new Set<string>();
  return out.filter((id) => {
    if (!eligible.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
