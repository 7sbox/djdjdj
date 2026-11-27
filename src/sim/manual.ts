import type { SkillDef, WeaponKind } from '../types';
import { MANUAL_SKILL_IDS, skillById } from '../data/combat-defs';

/**
 * 秘籍：抽卡抽的东西。
 *
 * 抽角色会和「三职业」打架，抽装备会和「刷怪掉装备」打架，
 * 而抽残卷天然长出「合成」—— 所以抽卡抽的就是残卷。
 *
 * 一本秘籍 = N 张残卷，集齐即习得秘籍上绑定的那一招。
 * 残卷**不消耗**：集齐后仍完整保留，收藏感不丢。
 */
export interface ManualDef {
  id: string;
  name: string;
  /** 只有这个武器谱系会用得上这本秘籍。 */
  weaponKind: WeaponKind;
  /** 四张残卷的 id，按卷一→卷四排。 */
  fragments: readonly string[];
  /** 集齐后习得的招式。 */
  skillId: string;
  description: string;
}

/**
 * 切片只做一本剑法秘籍。
 *
 * 为什么只做一本：抽卡要验证的是「用游戏内资源赌随机，并且睹到的东西真的能用」。
 * 一本秘籍就能验证完整链路（抽→集齐→习得→真的出现在技能栏），多做只是重复验证。
 */
export const MANUALS: readonly ManualDef[] = [
  {
    id: 'manual_sword_lianxing',
    name: '连星剑谱',
    weaponKind: 'sword',
    fragments: [
      'frag_lianxing_1',
      'frag_lianxing_2',
      'frag_lianxing_3',
      'frag_lianxing_4',
    ],
    skillId: 'sk_sword_chain',
    description: '残卷四页，合之成谱。谱成则剑光成串，一扫一片。',
  },
];

const MANUAL_BY_ID = new Map(MANUALS.map((m) => [m.id, m]));

export function manualById(id: string): ManualDef {
  const found = MANUAL_BY_ID.get(id);
  if (!found) throw new Error(`未知秘籍: ${id}`);
  return found;
}

/** 这本秘籍的全部残卷 id。 */
export function fragmentsOf(manualId: string): readonly string[] {
  return manualById(manualId).fragments;
}

/** 残卷 id → 它属于哪本秘籍。抽卡时用来判断是不是重复。 */
const FRAGMENT_OWNER = new Map<string, ManualDef>();
for (const m of MANUALS) {
  for (const f of m.fragments) FRAGMENT_OWNER.set(f, m);
}

export function fragmentOwner(fragmentId: string): ManualDef | undefined {
  return FRAGMENT_OWNER.get(fragmentId);
}

/** 已习得的秘籍会给你哪些招式。 */
export function learnedSkillIds(manualId: string): string[] {
  return [manualById(manualId).skillId];
}

/**
 * 抽一次的花费。金币能挂机刷，残页必须打硬仗 —— 两者一起才有稀缺感。
 */
export const DRAW_COST = { gold: 500, pages: 1 } as const;

/**
 * 重复残卷**不返还残页**。
 *
 * 曾经设成「返还 1 张 = 抽卡成本」，看起来体贴，实际把残页门槛废掉了：
 * 只要拿到 1 张残页，重复抽卡就净零消耗，于是挂机刷金币就能无限抽 ——
 * 「残页必须打硬仗」这条设计决定当场失效。
 *
 * 现在的代价结构：抽卡永远消耗 1 张残页，金币也照扣。
 * 重复的补偿是**收藏进度不倒退**（那四张本来就还在），不是退回成本。
 */
export const DUPLICATE_REFUND_PAGES = 0;

/** 玩家的秘籍收藏。 */
export interface ManualState {
  /** 已拥有的残卷 id，无重复。 */
  fragments: string[];
  /** 已集齐并习得的秘籍 id，无重复。 */
  completed: string[];
}

export interface ManualWallet {
  gold: number;
  scrollPages: number;
}

export interface DrawOutcome {
  /** 抽到的残卷。 */
  fragmentId: string;
  /** 是否抽到了已有的。 */
  duplicate: boolean;
  /** 重复时返还的残页数，否则 0。 */
  refundPages: number;
  /** 更新后的收藏。 */
  manual: ManualState;
  /** 更新后的钱包。 */
  wallet: ManualWallet;
  /** 本次恰好集齐的秘籍 id，否则 null。 */
  completedManualId: string | null;
}

export type DrawResult =
  | { ok: true; value: DrawOutcome }
  | { ok: false; reason: string };

export function emptyManualState(): ManualState {
  return { fragments: [], completed: [] };
}

export function emptyManualWallet(): ManualWallet {
  return { gold: 0, scrollPages: 0 };
}

/**
 * 抽一次残卷。
 *
 * 四个不变量，缺一条这张票就是假的：
 * 1. 花多少：金币 + 残页，不够就整笔拒绝、一分不扣。
 * 2. 抽到什么：当前全部秘籍里的任意一张残卷，等概率。
 * 3. 重复：不是废纸，返还残页。
 * 4. 集齐：那一刻返回 completedManualId，习得对应的招式。
 */
export function drawScroll(
  state: ManualState,
  wallet: ManualWallet,
  rng: { next(): number; pick<T>(a: readonly T[]): T },
): DrawResult {
  if (wallet.gold < DRAW_COST.gold) {
    return { ok: false, reason: `金币不足（需要 ${DRAW_COST.gold}）` };
  }
  if (wallet.scrollPages < DRAW_COST.pages) {
    return { ok: false, reason: `残页不足（需要 ${DRAW_COST.pages}）` };
  }

  // 卡池 = 所有秘籍的所有残卷
  const pool = MANUALS.flatMap((m) => m.fragments);
  const fragmentId = rng.pick(pool);

  const alreadyOwned = state.fragments.includes(fragmentId);
  const fragments = alreadyOwned ? [...state.fragments] : [...state.fragments, fragmentId];

  // 重复返还残页
  const refundPages = alreadyOwned ? DUPLICATE_REFUND_PAGES : 0;
  const nextWallet: ManualWallet = {
    gold: wallet.gold - DRAW_COST.gold,
    scrollPages: wallet.scrollPages - DRAW_COST.pages + refundPages,
  };

  // 集齐判定：只看这次拿到的那张所属的秘籍
  const owner = fragmentOwner(fragmentId);
  let completed = [...state.completed];
  let completedManualId: string | null = null;

  if (owner && !completed.includes(owner.id)) {
    const hasAll = owner.fragments.every((f) => fragments.includes(f));
    if (hasAll) {
      completed = [...completed, owner.id];
      completedManualId = owner.id;
    }
  }

  return {
    ok: true,
    value: {
      fragmentId,
      duplicate: alreadyOwned,
      refundPages,
      manual: { fragments, completed },
      wallet: nextWallet,
      completedManualId,
    },
  };
}

/**
 * 这一招是不是「只能靠习得」。
 *
 * 秘籍招式在技能表里写 unlockLevel: 0，表示**等级不给**。
 * 判定放在这里而不是散在各处，否则「等级能不能给」和「习没习得」
 * 会各写一份，迟早对不上。
 */
export function isManualOnlySkill(def: SkillDef): boolean {
  return MANUAL_SKILL_IDS.has(def.id) && def.unlockLevel === 0;
}

/** 某本秘籍是否已集齐。 */
export function isCompleted(state: ManualState, manualId: string): boolean {
  return state.completed.includes(manualId);
}

/**
 * 已习得的全部招式 id。
 *
 * **容错**：存档里可能带着本程序不认识的秘籍 id（旧版数据、手改过的档）。
 * 这里是每帧都会跑的热路径，遇到不认识的 id 直接跳过，绝不抛错 ——
 * 抛一次就会把整个挂机循环打死。真正该报错的地方是读档校验。
 */
export function allLearnedSkillIds(state: ManualState): string[] {
  const out: string[] = [];
  for (const id of state.completed) {
    const m = MANUAL_BY_ID.get(id);
    if (m) out.push(m.skillId);
  }
  return out;
}

/**
 * 招式是否可用：等级给的招式看等级（本切片未强制，见 GLOSSARY「等级解锁」），
 * 秘籍招式看是否已习得。
 *
 * 只对秘籍招式做门禁 —— 等级门禁是独立议题，不在这里顺手改，
 * 免得把「抽卡」这张票变成「技能解锁系统」的票。
 */
export function skillUnlockedByManual(
  def: SkillDef,
  state: ManualState,
): boolean {
  if (!isManualOnlySkill(def)) return true;
  return allLearnedSkillIds(state).includes(def.id);
}

/** 招式定义自检：秘籍绑定的招式必须存在，否则抽完等于空转。 */
export function validateManualData(): string[] {
  const errors: string[] = [];
  for (const m of MANUALS) {
    try {
      const def = skillById(m.skillId);
      if (def.weaponKinds.length > 0 && !def.weaponKinds.includes(m.weaponKind)) {
        errors.push(`秘籍 ${m.name} 绑定的招式 ${def.name} 不支持 ${m.weaponKind}`);
      }
      if (def.unlockLevel !== 0) {
        errors.push(`秘籍招式 ${def.name} 的 unlockLevel 应为 0（等级不给），实为 ${def.unlockLevel}`);
      }
    } catch {
      errors.push(`秘籍 ${m.name} 绑定的招式 ${m.skillId} 不存在`);
    }
  }
  return errors;
}
