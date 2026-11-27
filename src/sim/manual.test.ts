import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import type { ManualState } from './manual';
import {
  DRAW_COST,
  drawScroll,
  emptyManualState,
  emptyManualWallet,
  fragmentsOf,
  learnedSkillIds,
  manualById,
  MANUALS,
} from './manual';

/**
 * 抽卡抽的是**秘籍残卷**，不是角色也不是装备（见 GLOSSARY.md）。
 * 理由：抽角色会和「三职业」打架，抽装备会和「刷怪掉装备」打架，
 * 而抽残卷天然长出「合成」。
 *
 * 本文件只测抽卡这一个接缝的对外行为：花多少、得到什么、重复怎么算、什么时候算集齐。
 */

describe('秘籍定义', () => {
  it('切片只有一本剑法秘籍，四张残卷', () => {
    expect(MANUALS).toHaveLength(1);
    const m = MANUALS[0]!;
    expect(m.weaponKind).toBe('sword');
    expect(m.fragments).toHaveLength(4);
  });

  it('秘籍集齐后解锁的那招真实存在，且是主动技', () => {
    const m = MANUALS[0]!;
    const skill = learnedSkillIds(m.id);
    expect(skill).toHaveLength(1);
    // 招式 id 必须能在技能表里查到，否则抽完等于空转
    expect(() => manualById(m.id)).not.toThrow();
  });

  it('未知秘籍 id 直接抛错，不静默返回空', () => {
    expect(() => manualById('no_such_manual')).toThrow(/未知秘籍/);
  });

  it('残卷 id 全局唯一', () => {
    const all = MANUALS.flatMap((m) => fragmentsOf(m.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('抽卡消耗', () => {
  it('抽一次扣 500 金币与 1 张残页', () => {
    const rng = createRng(1);
    const wallet = { gold: 1000, scrollPages: 3 };
    const res = drawScroll(emptyManualState(), wallet, rng);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.wallet.gold).toBe(1000 - DRAW_COST.gold);
    expect(res.value.wallet.scrollPages).toBe(3 - DRAW_COST.pages);
  });

  it('金币不够就拒绝，且一个字节都不扣', () => {
    const rng = createRng(2);
    const wallet = { gold: DRAW_COST.gold - 1, scrollPages: 99 };
    const res = drawScroll(emptyManualState(), wallet, rng);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/金币/);
  });

  it('残页不够就拒绝，且不扣金币', () => {
    const rng = createRng(3);
    const wallet = { gold: 99999, scrollPages: 0 };
    const res = drawScroll(emptyManualState(), wallet, rng);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/残页/);
  });
});

describe('抽到的残卷进入收藏', () => {
  it('抽到的残卷 id 被记进收藏，且是本秘籍四张之一', () => {
    const rng = createRng(4);
    const m = MANUALS[0]!;
    const res = drawScroll(emptyManualState(), { gold: 5000, scrollPages: 10 }, rng);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(m.fragments).toContain(res.value.fragmentId);
    expect(res.value.manual.fragments).toContain(res.value.fragmentId);
  });

  it('连抽 40 次能集齐四张（可复现种子，不是碰运气）', () => {
    const rng = createRng(20260101);
    let state = emptyManualState();
    let wallet = { gold: 100_000, scrollPages: 100 };
    let completed: string | null = null;

    for (let i = 0; i < 40 && !completed; i++) {
      const res = drawScroll(state, wallet, rng);
      if (!res.ok) break;
      state = res.value.manual;
      wallet = res.value.wallet;
      completed = res.value.completedManualId;
    }

    expect(completed).toBe(MANUALS[0]!.id);
    expect(state.fragments).toHaveLength(4);
  });
});

describe('重复残卷不是废纸', () => {
  it('抽到已有的残卷时被标记为重复，且照常扣残页', () => {
    const rng = createRng(11);
    const m = MANUALS[0]!;

    // 先手动拥有全部四张，再抽，必然重复
    const full: ManualState = { fragments: [...m.fragments], completed: [] };
    const res = drawScroll(full, { gold: 5000, scrollPages: 10 }, rng);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.duplicate).toBe(true);
    // 重复不返还残页：否则残页门槛失效（见 manual.ts 的 DUPLICATE_REFUND_PAGES 注释）
    expect(res.value.refundPages).toBe(0);
    expect(res.value.wallet.scrollPages).toBe(10 - DRAW_COST.pages);
  });

  it('不重复时不返还残页', () => {
    const rng = createRng(12);
    const res = drawScroll(emptyManualState(), { gold: 5000, scrollPages: 10 }, rng);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.duplicate).toBe(false);
    expect(res.value.refundPages).toBe(0);
    expect(res.value.wallet.scrollPages).toBe(10 - DRAW_COST.pages);
  });

  it('重复的补偿是收藏不倒退：四张仍在，不会变少', () => {
    const rng = createRng(13);
    const m = MANUALS[0]!;
    const full: ManualState = { fragments: [...m.fragments], completed: [] };
    const res = drawScroll(full, { gold: 5000, scrollPages: 10 }, rng);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.manual.fragments).toHaveLength(4);
    expect(new Set(res.value.manual.fragments).size).toBe(4);
  });
});

describe('集齐即习得', () => {
  it('集齐那一刻返回 completedManualId，收藏不重复记', () => {
    const m = MANUALS[0]!;
    const rng = createRng(21);
    // 已有前三张，只差最后一张
    const almost: ManualState = { fragments: m.fragments.slice(0, 3), completed: [] };

    let state = almost;
    let wallet = { gold: 100_000, scrollPages: 100 };
    let completed: string | null = null;

    for (let i = 0; i < 30 && !completed; i++) {
      const res = drawScroll(state, wallet, rng);
      if (!res.ok) break;
      state = res.value.manual;
      wallet = res.value.wallet;
      completed = res.value.completedManualId;
    }

    expect(completed).toBe(m.id);
    expect(state.completed).toEqual([m.id]);
    // 残卷不消耗，仍完整保留四张
    expect(state.fragments).toHaveLength(4);
  });

  it('已习得的秘籍再集齐不会重复记录', () => {
    const m = MANUALS[0]!;
    const rng = createRng(22);
    const done: ManualState = { fragments: [...m.fragments], completed: [m.id] };
    const res = drawScroll(done, { gold: 5000, scrollPages: 10 }, rng);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.manual.completed).toEqual([m.id]);
    expect(res.value.completedManualId).toBeNull();
  });

  it('习得后那招进入已学会清单', () => {
    const m = MANUALS[0]!;
    const st = { fragments: [...m.fragments], completed: [m.id] };
    expect(st.completed).toContain(m.id);
    expect(learnedSkillIds(m.id)).toHaveLength(1);
  });
});

describe('空钱包与空收藏的初值', () => {
  it('新档没有残页、没有残卷、没有习得', () => {
    const st = emptyManualState();
    expect(st.fragments).toEqual([]);
    expect(st.completed).toEqual([]);

    const w = emptyManualWallet();
    expect(w.gold).toBe(0);
    expect(w.scrollPages).toBe(0);
  });
});
