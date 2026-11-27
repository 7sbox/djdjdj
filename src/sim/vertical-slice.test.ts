import { describe, expect, it } from 'vitest';
import type { Item, SlotId, MonsterDef } from '../types';
import { RARITY_ORDER } from '../data/items';
import { createRng, type Rng } from './rng';
import { effectiveBaseStat, salvageYieldOf } from './equip-ops';
import { TICK_SECONDS, createWorld, playerStats, resumeFarming, stepWorld } from './world';

/**
 * 垂直切片的验收台：把 #1 的四个问题变成可测的数字。
 *
 * 所有数字都从真实世界循环（createWorld / stepWorld）里跑出来。
 * 玩家行为固定为设计允许的那几件事：死了点「继续挂机」、穿上掉到的最好的、
 * 背包满了拆凡品。阈值取自 docs/design/vertical-slice-spec.md §二，
 * 用 15 个种子取中位数 —— 单一种子的偶然性太大，不足以代表「期望状态」。
 */

const MIN = 60;
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 111, 222, 333, 444, 555, 666];

/** 背包上限，与 App 里一致。 */
const INVENTORY_LIMIT = 80;

/** 两枚戒指可互换，所以「一身」是 7 个部位需求而不是 8 个槽。 */
const NEEDED_SLOTS = 7;

/** 挂机一趟攒下来的所有可观察结果。 */
interface FarmRun {
  /** 按掉落顺序记录，含掉落发生的游戏内秒数。 */
  dropped: { rarity: Item['rarity']; slot: string; at: number }[];
  /** 每个部位第一次拿到「精良或更好」的时刻，秒。 */
  fullGreenAt: number | null;
  /** 各品质第一次出现的时刻，秒。 */
  first: Partial<Record<Item['rarity'], number>>;
  /** 各品质的件数。 */
  tally: Record<Item['rarity'], number>;
  interruptions: number;
  malice: number;
  ore: number;
}

/**
 * 挂机一段时间。玩家只做设计允许的那几件事，这是「挂机省心」的定义本身：
 * 不用盯着，死了回来点一下继续，捡到更好的就换上，背包满了拆凡品。
 */
function farm(rng: Rng, seconds: number): FarmRun {
  const equipped: Partial<Record<SlotId, Item>> = {};
  const world = createWorld({ rng, floorId: 'f1', equipped });
  const stash: Item[] = [];
  const dropped: FarmRun['dropped'] = [];
  const tally: Record<Item['rarity'], number> = {
    common: 0, green: 0, blue: 0, purple: 0, orange: 0,
  };
  let interruptions = 0;

  const rank = (i: Item) => RARITY_ORDER.indexOf(i.rarity) * 1e6 + effectiveBaseStat(i);
  const slotKey = (s: SlotId) => (s === 'ring1' || s === 'ring2' ? 'ring' : s);

  const deps = {
    rng,
    equipped,
    onLoot: (item: Item) => {
      dropped.push({ rarity: item.rarity, slot: slotKey(item.slot), at: world.elapsed });
      tally[item.rarity]++;
      stash.push(item);

      // 垃圾的出口：背包满了先拆凡品，不够再拆精良
      while (stash.length >= INVENTORY_LIMIT) {
        const victim =
          stash.find((i) => i.rarity === 'common') ?? stash.find((i) => i.rarity === 'green');
        if (!victim) break;
        stash.splice(stash.indexOf(victim), 1);
        world.player.ore += salvageYieldOf(victim.rarity);
      }

      // 捡到更好的就换上 —— 这才是刷宝循环的真实形态
      const cur = equipped[item.slot];
      if (!cur || rank(item) > rank(cur)) equipped[item.slot] = item;
      world.player.maxHp = playerStats(world, equipped).hp;
    },
    onKill: (_def: MonsterDef) => {},
  };

  for (let i = 0; i < Math.round(seconds / TICK_SECONDS); i++) {
    if (world.interrupted) {
      interruptions++;
      resumeFarming(world, rng);
    }
    stepWorld(world, deps);
  }

  const filled = new Set<string>();
  let fullGreenAt: number | null = null;
  const first: Partial<Record<Item['rarity'], number>> = {};
  for (const d of dropped) {
    if (first[d.rarity] === undefined) first[d.rarity] = d.at;
    if (RARITY_ORDER.indexOf(d.rarity) >= 1) filled.add(d.slot);
    if (filled.size >= NEEDED_SLOTS && fullGreenAt === null) fullGreenAt = d.at;
  }

  return { dropped, fullGreenAt, first, tally, interruptions, malice: world.malice, ore: world.player.ore };
}

/** 对 15 个种子各跑一趟，把每趟的某个数字取中位数。 */
function medianOf(seconds: number, pick: (r: FarmRun) => number | null | undefined): number | null {
  const xs: number[] = [];
  for (const seed of SEEDS) {
    const v = pick(farm(createRng(seed + seconds), seconds));
    if (typeof v === 'number') xs.push(v);
  }
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
}

describe('刷起来爽不爽：掉落节奏与品质梯度', () => {
  it('绿装一开始就见得到：中位 10 分钟内出第一件', () => {
    const t = medianOf(10 * MIN, (r) => r.first.green);
    expect(t, '10 分钟内一件绿装都没掉').not.toBeNull();
    expect(t! / MIN).toBeLessThanOrEqual(10);
  });

  it('15 分钟能凑齐一身绿（7 个部位需求，戒指两槽可互换）', () => {
    const t = medianOf(30 * MIN, (r) => r.fullGreenAt);
    expect(t, '30 分钟内凑不齐一身绿').not.toBeNull();
    expect(t! / MIN, '凑齐一身绿的中位时间超过 15 分钟').toBeLessThanOrEqual(15);
  });

  it('品质梯度是单调的：绿最早、蓝其后、紫最后', () => {
    const green = medianOf(120 * MIN, (r) => r.first.green);
    const blue = medianOf(120 * MIN, (r) => r.first.blue);
    const purple = medianOf(120 * MIN, (r) => r.first.purple);
    expect(green, '两小时内没出绿').not.toBeNull();
    expect(blue, '两小时内没出蓝').not.toBeNull();
    expect(purple, '两小时内没出紫').not.toBeNull();
    expect(green!).toBeLessThan(blue!);
    expect(blue!).toBeLessThan(purple!);
  });

  it('紫色是塔尖：比绿少一个数量级，比蓝也明显少', () => {
    // 紫色产量最终由「Boss 必掉紫 + 自动跑图」决定，不是由权重决定的。
    // 所以这里守的是「梯度关系」而不是绝对件数 —— 规格 §二 的「2 小时第一件紫」
    // 与 §三 的「Boss 必掉紫」在自动跑图下互斥，见 ADR-0006。
    const tallies = SEEDS.map((seed) => farm(createRng(seed + 120 * MIN), 120 * MIN).tally);
    const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
    const c = median(tallies.map((t) => t.common));
    const g = median(tallies.map((t) => t.green));
    const b = median(tallies.map((t) => t.blue));
    const p = median(tallies.map((t) => t.purple));

    expect(g, '绿装产量不该不低于凡品').toBeLessThan(c);
    expect(b, '蓝装比绿装还多，梯度断了').toBeLessThan(g);
    expect(p, `紫装中位 ${p} 件，不比蓝装少，塔尖没保住`).toBeLessThan(b);
    expect(p, '两小时一件紫都没有，梯度断了').toBeGreaterThanOrEqual(1);
  });
});

describe('垃圾有没有出口：拆解撑得起强化', () => {
  it('2 小时挂机攒下的矿，够把一件装备点到 +3', () => {
    // +1/+2/+3 共需矿 2+4+6 = 12
    const ore = medianOf(120 * MIN, (r) => r.ore);
    expect(ore, `2 小时只攒到 ${ore} 矿`).not.toBeNull();
    expect(ore!).toBeGreaterThanOrEqual(12);
  });
});

describe('变强感够不够：换一件看得出差别', () => {
  it('同一部位换上高一档品质，主属性明显变大', () => {
    const rng = createRng(20260105);
    const world = createWorld({ rng, floorId: 'f1', equipped: {} });
    const bare = playerStats(world, {});

    const green: Item = {
      id: 'g', defId: 'def_chest', slot: 'chest', itemLevel: 5,
      rarity: 'green', baseStat: 20, baseStatType: 'armor', affixes: [], upgrade: 0,
    };
    const purple: Item = { ...green, id: 'p', rarity: 'purple', baseStat: 31 };
    const withGreen = playerStats(world, { chest: green });
    const withPurple = playerStats(world, { chest: purple });

    expect(withGreen.armor).toBeGreaterThan(bare.armor);
    // 一件紫对一件绿，护甲收益要拉开 1.3 倍以上，否则玩家换装没有感觉
    expect(withPurple.armor - bare.armor).toBeGreaterThan((withGreen.armor - bare.armor) * 1.3);
  });
});

describe('挂机是不是真的省心', () => {
  it('30 分钟内被中断的次数是个位数：不需要人一直盯着', () => {
    const xs = SEEDS.map((seed) => farm(createRng(seed + 30 * MIN), 30 * MIN).interruptions);
    xs.sort((a, b) => a - b);
    const median = xs[Math.floor(xs.length / 2)]!;
    expect(median, `30 分钟被打断中位 ${median} 次，太频繁`).toBeLessThanOrEqual(10);
  });

  it('挂机不会卡在第一间：煞气会自己涨上去', () => {
    const malice = medianOf(60 * MIN, (r) => r.malice);
    expect(malice, '一小时挂下来煞气还是 0，说明再入没跑起来').toBeGreaterThan(0);
  });
});
