import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, pickSkill, playerStats } from './world';
import { drawScroll, MANUALS, DRAW_COST, fragmentOwner } from './manual';
import { candidatesForSlot, skillsForWeapon, skillsForWeaponWithLearned } from '../data/skills';
import { exportSave, importSave, newSave } from '../storage/save';

/**
 * 评审指出的四处「实现但错」的回归锁。
 *
 * 这几条不修，本票就是表面完成：招式存在、抽得到、但玩家看不见也用不了。
 */

const M = MANUALS[0]!;

describe('习得的招式必须真的出现在技能栏里', () => {
  /**
   * 评审原话：「both App.tsx:595 and pages.tsx:208 render skillsForWeapon(kind),
   * which by construction excludes manual skills … 连星贯日 has no slot, no
   * cooldown display, ever.」
   *
   * 技能栏要按「已习得」渲染，否则抽卡等于没发生。
   */
  it('习得后，技能栏候选里必须有它（用带已习得的入口取）', () => {
    const bar = skillsForWeaponWithLearned('sword', [M.skillId]);
    expect(bar.map((s) => s.id)).toContain(M.skillId);
  });

  it('技能栏渲染入口不能排除秘籍招 —— 这正是评审说的那句「by construction excludes」', () => {
    // 默认入口（未习得）不含
    expect(skillsForWeapon('sword').map((s) => s.id)).not.toContain(M.skillId);
    // 但 2 号槽在习得后应有它可选
    const slot2 = candidatesForSlot('sword', 2, [M.skillId]);
    expect(slot2.map((s) => s.id)).toContain(M.skillId);
  });
});

describe('二选一必须是真二选一，不是叠加', () => {
  /**
   * 评审原话：「priority [pierce, chain, swirl] still casts chain and pierce.
   * After learning, the manual skill can be added but never switched back off.」
   */
  it('装了连星贯日之后，穿云式不应该还能被挑中', () => {
    const rng = createRng(1);
    const world = createWorld({
      rng,
      floorId: 'f1',
      equipped: {},
      manual: { fragments: [...M.fragments], completed: [M.id] },
    });

    // 模拟「玩家选了连星贯日装到 2 号槽」—— 2 号槽只能有一个
    world.controls.skillPriority = [M.skillId, 'sk_sword_swirl'];

    const picked = pickSkill(world, playerStats(world, {}));
    expect(picked?.id).toBe(M.skillId);

    // 冷却中时，同一槽位的穿云式不该顶上来 —— 那是「多了一个按钮」
    world.player.cooldowns[M.skillId] = 99;
    const next = pickSkill(world, playerStats(world, {}));
    expect(next?.id).not.toBe('sk_sword_pierce');
  });

  it('切回穿云式后，连星贯日不再被挑中', () => {
    const rng = createRng(2);
    const world = createWorld({
      rng,
      floorId: 'f1',
      equipped: {},
      manual: { fragments: [...M.fragments], completed: [M.id] },
    });
    world.controls.skillPriority = ['sk_sword_pierce', 'sk_sword_swirl'];

    const picked = pickSkill(world, playerStats(world, {}));
    expect(picked?.id).toBe('sk_sword_pierce');
  });
});

describe('坏存档不能把启动搞崩', () => {
  /**
   * 评审原话：「manual: {} passes validation then [...saved.manual.fragments]
   * throws TypeError: fragments is not iterable.」
   */
  it('manual 是空对象时，导入要么拒绝、要么补全，绝不能让下游炸', () => {
    const data = newSave(1);
    (data as { manual?: unknown }).manual = {};
    const file = exportSave(data);

    let imported: ReturnType<typeof importSave> | null = null;
    try {
      imported = importSave(file);
    } catch {
      // 拒绝也是可接受的结果
      return;
    }
    // 如果接受，就必须已经补成可迭代的形状
    expect(Array.isArray(imported.manual?.fragments)).toBe(true);
    expect(Array.isArray(imported.manual?.completed)).toBe(true);
  });

  it('completed 里有未知秘籍 id 时，不能每一帧都抛错', () => {
    const rng = createRng(3);
    const world = createWorld({
      rng,
      floorId: 'f1',
      equipped: {},
      manual: { fragments: [], completed: ['no_such_manual'] },
    });
    // pickSkill 每帧都会跑到，不能抛
    expect(() => pickSkill(world, playerStats(world, {}))).not.toThrow();
  });
});

describe('残页的门槛必须是真门槛', () => {
  /**
   * 评审原话：「refund (1 page) equals draw cost (1 page), net 0.
   * Get one page and you can draw forever on idle-farmable gold.」
   *
   * 这违背了「残页必须打硬仗」的设计决定 —— 重复抽卡不该净零消耗残页。
   */
  it('重复返还的残页必须少于抽卡成本，否则残页门槛失效', () => {
    const full = { fragments: [...M.fragments], completed: [M.id] };
    const rng = createRng(4);
    const res = drawScroll(full, { gold: 5000, scrollPages: 10 }, rng);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 重复时必须真的亏掉一点残页，否则「抽到重复」毫无代价
    expect(res.value.refundPages).toBeLessThan(DRAW_COST.pages);
  });

  it('连抽重复时，残页净消耗为正（不能无限抽）', () => {
    const full = { fragments: [...M.fragments], completed: [M.id] };
    const rng = createRng(5);
    const startPages = 10;
    let pages = startPages;
    let draws = 0;
    while (pages >= DRAW_COST.pages && draws < 100) {
      const res = drawScroll(full, { gold: 1e9, scrollPages: pages }, rng);
      if (!res.ok) break;
      pages = res.value.wallet.scrollPages;
      draws++;
    }
    // 每次重复都净消耗 1 张残页：10 张恰好抽 10 次，不多不少
    expect(draws).toBe(startPages);
    expect(pages).toBe(0);
  });
});

describe('残卷世界里的重复必须可被判定', () => {
  it('抽到已拥有的残卷被判为 duplicate', () => {
    const full = { fragments: [...M.fragments], completed: [] };
    const rng = createRng(6);
    const res = drawScroll(full, { gold: 5000, scrollPages: 10 }, rng);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.duplicate).toBe(true);
    expect(fragmentOwner(res.value.fragmentId)).toBeDefined();
  });
});
