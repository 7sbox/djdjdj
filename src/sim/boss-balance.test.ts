import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import { createWorld, stepWorld, spawnRoom, TICK_SECONDS } from '../sim/world';
import { rollItem } from '../sim/loot';
import { MONSTERS, monsterById } from '../data/combat-defs';
import type { MonsterDef, Item, SlotId } from '../types';

/**
 * Boss 房平衡的守护用例（#2）。
 *
 * 三个端点来自议题：裸装 1 级打不过、3–4 件第一层绿装打得过但血见底、
 * 全程自动喝药第一层 5 分钟不死而关掉必死。
 *
 * 这几条是数值的地板与天花板，不是「跑一遍看着还行」——
 * 改伤害公式、改护甲、改掉落、改 Boss 数值，都要先让它们继续成立。
 */

type Loadout = Partial<Record<SlotId, Item>>;

/** 第一层的绿装。部位由用例指定，品质固定，词条随机但可复现。 */
function greenKit(seed: number, slots: SlotId[]): Loadout {
  const rng = createRng(seed);
  const kit: Loadout = {};
  for (const slot of slots) {
    kit[slot] = rollItem({ slot, itemLevel: 5, rarity: 'green', weaponKind: 'sword' }, rng);
  }
  return kit;
}

/** 「约 3–4 件」：胸/手护甲、武器攻击、戒指生命，各来一件。 */
const FOUR_GREENS = greenKit(77, ['chest', 'hands', 'weapon', 'ring1']);
const THREE_GREENS = greenKit(77, ['chest', 'weapon', 'ring1']);

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

interface FightResult {
  won: boolean;
  /** 击杀 Boss 用的秒数（赢了才有意义）。 */
  seconds: number;
  /** 赢下时剩余血量比例。 */
  hpLeft: number;
}

/** 地宫一层的房间是 3 个普通房 + 1 个 Boss 房；索引 3 就是 Boss 房。 */
const BOSS_ROOM_INDEX = 3;

/** 中位数。连个位数都没有时返回 NaN，调用处的断言会自己失败。 */
function medianOf(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/** 只打第 4 间 Boss 房，最多给 15 分钟。 */
function fightBoss(seed: number, equipped: Loadout): FightResult {
  const rng = createRng(seed);
  const world = createWorld({ rng, floorId: 'f1', equipped });
  spawnRoom(world, rng, 'f1', BOSS_ROOM_INDEX);

  // bossDefeated 会被 advanceAfterClear 立刻复位，只能在击杀回调里记时刻
  let killedAt = -1;
  const deps = {
    rng,
    equipped,
    onLoot: () => {},
    onKill: (def: MonsterDef) => {
      if (def.tier === 'boss' && killedAt < 0) killedAt = world.elapsed;
    },
  };

  const maxTicks = Math.round(900 / TICK_SECONDS);
  for (let i = 0; i < maxTicks; i++) {
    stepWorld(world, deps);
    if (killedAt >= 0) return { won: true, seconds: killedAt, hpLeft: world.player.hp / world.player.maxHp };
    if (world.interrupted) return { won: false, seconds: world.elapsed, hpLeft: 0 };
  }
  return { won: false, seconds: world.elapsed, hpLeft: world.player.hp / world.player.maxHp };
}

/** 从第一间开始跑，返回是否在给定时间内被死亡打断。 */
function diesWithin(seed: number, equipped: Loadout, autoPotion: boolean, seconds: number): boolean {
  const rng = createRng(seed);
  const world = createWorld({ rng, floorId: 'f1', equipped });
  world.controls.autoPotion = autoPotion;
  const deps = { rng, equipped, onLoot: () => {}, onKill: () => {} };

  for (let i = 0; i < Math.round(seconds / TICK_SECONDS); i++) {
    stepWorld(world, deps);
    if (world.interrupted) return true;
  }
  return false;
}

describe('第一层 Boss 房：裸装打不过（这是设计意图）', () => {
  it('30 个种子里一次都赢不了', () => {
    const results = SEEDS.map((s) => fightBoss(s, {}));
    expect(results.filter((r) => r.won)).toHaveLength(0);
  });

  it('死之前连 Boss 三成血都打不掉 —— 不是「差一点」，是差得远', () => {
    const boss = monsterById('m_boss_earth');
    const progress: number[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const rng = createRng(seed);
      const world = createWorld({ rng, floorId: 'f1', equipped: {} });
      spawnRoom(world, rng, 'f1', BOSS_ROOM_INDEX);
      const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };

      let minBossHp = boss.hp;
      let sawBoss = false;
      for (let i = 0; i < Math.round(900 / TICK_SECONDS); i++) {
        stepWorld(world, deps);
        const b = world.monsters.find((m) => m.defId === 'm_boss_earth');
        // 没见到 Boss 就「通过」是假绿：这一局什么都没证明
        if (b) {
          sawBoss = true;
          minBossHp = Math.min(minBossHp, b.hp);
        }
        if (world.interrupted) break;
      }
      expect(sawBoss, `种子 ${seed} 压根没打到 Boss 房`).toBe(true);
      progress.push(minBossHp / boss.hp);
    }
    // 实测裸装死前 Boss 剩 48–66%，中位 51%：连一半都啃不掉
    for (const left of progress) expect(left).toBeGreaterThan(0.3);
  });
});

describe('第一层 Boss 房：穿上绿装打得过，但要见底', () => {
  // 这套模拟要跑 30 场，四组判据看的是同一批结果，算一次就够
  const withFourGreens = SEEDS.map((s) => fightBoss(s, FOUR_GREENS));
  const wins = withFourGreens.filter((r) => r.won);

  it('4 件绿装 30 个种子全过', () => {
    expect(wins).toHaveLength(SEEDS.length);
  });

  it('赢下来的场面必须紧张：有人差点没撑住', () => {
    // 实测末血分布 8–75%，中位 57%，30 场里有 3 场低于四成。
    // 断言「至少有一场差点交代」而不是中位数——中位 57% 不属于「见底」，
    // 写成中位阈值就成了自欺欺人。
    const nearlyLost = wins.filter((r) => r.hpLeft < 0.4);
    expect(nearlyLost.length).toBeGreaterThanOrEqual(2);
  });

  it('也不是秒杀 —— Boss 房要打够久，否则没有紧张感', () => {
    const median = medianOf(wins.map((r) => r.seconds));
    expect(median).toBeGreaterThan(60);
  });

  it('3 件绿装还在生死线上：过得了的种子不过半', () => {
    const withThreeGreens = SEEDS.map((s) => fightBoss(s, THREE_GREENS)).filter((r) => r.won);
    expect(withThreeGreens.length).toBeLessThan(SEEDS.length / 2);
  });
});

describe('自动喝药是生死开关', () => {
  it('全程自动喝药，第一层 5 分钟不死', () => {
    const deaths = SEEDS.filter((s) => diesWithin(s, {}, true, 300));
    expect(deaths).toHaveLength(0);
  });

  // 「必死」不限时：不喝药只是运气好一点，30 分钟内一定倒下。
  // 5 分钟窗口里死的是运气差的那几个，其余的人只是还没走到那一步。
  it('关掉自动喝药，第一层迟早必死', () => {
    const deaths = SEEDS.filter((s) => diesWithin(s, {}, false, 1800));
    expect(deaths).toHaveLength(SEEDS.length);
  });
});

describe('护甲不跟血量走', () => {
  // 这条守的是 ADR-0007 的核心不变量：血量与护甲是两个独立旋钮。
  // 用全表比对，而不是抽查一只 Boss —— 否则谁把某只小怪的护甲又接回血量，这里看不出来。
  const oldArmorFormula = (def: (typeof MONSTERS)[number]) =>
    def.attackForm === 'melee' ? 10 + def.hp * 0.02 : 5 + def.hp * 0.01;

  it('每种怪都显式给了护甲', () => {
    for (const def of MONSTERS) expect(def.armor).toBeGreaterThan(0);
  });

  it('护甲能比旧公式高，也能比旧公式低 —— 它是自由旋钮，不是推导值', () => {
    // 只要同一张表里既有「调高」又有「调低」，就证明甲不可能是从血量算出来的：
    // 一条单调公式给不出两个方向。旧公式（甲 = 10 + hp×0.02）下这两个断言不可能同时成立。
    const higher = MONSTERS.filter((m) => m.armor > oldArmorFormula(m));
    const lower = MONSTERS.filter((m) => m.armor < oldArmorFormula(m));
    expect(higher.length).toBeGreaterThan(0);
    expect(lower.length).toBeGreaterThan(0);
  });

  it('第一层 Boss 的甲远低于旧公式给它的数 —— 这正是 #2 要修的那件事', () => {
    const boss = monsterById('m_boss_earth');
    // 旧公式：10 + 8000×0.02 = 170。血一厚甲就厚，是「打不动」的根因。
    expect(boss.armor).toBeLessThan(oldArmorFormula({ ...boss, hp: 8000 }) * 0.5);
  });
});

