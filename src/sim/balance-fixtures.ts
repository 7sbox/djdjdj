import { createRng } from './rng';
import { createWorld, spawnRoom, stepWorld, TICK_SECONDS } from './world';
import { rollItem } from './loot';
import type { Item, SlotId } from '../types';

/**
 * 数值守护用例共用的模拟夹具。
 *
 * 这些函数原来在 boss-balance / opening-supply 两个文件里各抄了一份，
 * 现在只留一处 —— 改「第一层」「30 个种子」「进 Boss 房的判定」时不用改三遍。
 */

/** 固定 30 个种子：够看出分布，又不至于让用例跑太久。 */
export const SEEDS: readonly number[] = Array.from({ length: 30 }, (_, i) => i + 1);

/** 地宫一层的房间是 3 个普通房 + 1 个 Boss 房；索引 3 就是 Boss 房。 */
export const BOSS_ROOM_INDEX = 3;

export type Loadout = Partial<Record<SlotId, Item>>;

/** 第一层的绿装。部位由调用方指定，品质固定，词条随机但可复现。 */
export function greenKit(seed: number, slots: readonly SlotId[]): Loadout {
  const rng = createRng(seed);
  const kit: Loadout = {};
  for (const slot of slots) {
    kit[slot] = rollItem({ slot, itemLevel: 5, rarity: 'green', weaponKind: 'sword' }, rng);
  }
  return kit;
}

/**
 * 跑到「进入 Boss 房那一刻」为止，返回是否在此之前倒下。
 *
 * 两个信号都判，各有分工：
 * - `!alive` 抓住「当下正躺在地上」的那一帧，死得干脆。
 * - `interrupted` 抓住「死过又已经复活」的情况 —— `alive` 会在 3 秒后变回 true，
 *   只判 `!alive` 会漏掉这种，而 `interrupted` 是「被打断过」的权威信号。
 */
export function diesBeforeBossRoom(seed: number, autoPotion: boolean): boolean {
  const rng = createRng(seed);
  const world = createWorld({ rng, floorId: 'f1', equipped: {} });
  world.controls.autoPotion = autoPotion;
  const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };

  // 上限 10 分钟：足够走到 Boss 房，也不至于让用例跑不完
  for (let i = 0; i < Math.round(600 / TICK_SECONDS); i++) {
    stepWorld(world, deps);
    if (!world.player.alive || world.interrupted) return true;
    if (world.roomIndex >= BOSS_ROOM_INDEX) return false;
  }
  // 10 分钟都没进 Boss 房：说明普通房把人磨住了，按失败处理
  return true;
}

export interface FightResult {
  won: boolean;
  /** 击杀 Boss 用的秒数（赢了才有意义）。 */
  seconds: number;
  /** 赢下时剩余血量比例。 */
  hpLeft: number;
}

/** 只打第 4 间 Boss 房，最多给 15 分钟。 */
export function fightBoss(seed: number, equipped: Loadout): FightResult {
  const rng = createRng(seed);
  const world = createWorld({ rng, floorId: 'f1', equipped });
  // 直接跳到 Boss 房：这条夹具只关心 Boss 战本身
  spawnBossRoom(world, rng);

  let killedAt = -1;
  const deps = {
    rng,
    equipped,
    onLoot: () => {},
    onKill: (def: { tier: string }) => {
      if (def.tier === 'boss' && killedAt < 0) killedAt = world.elapsed;
    },
  };

  const maxTicks = Math.round(900 / TICK_SECONDS);
  for (let i = 0; i < maxTicks; i++) {
    stepWorld(world, deps);
    if (killedAt >= 0) {
      return { won: true, seconds: killedAt, hpLeft: world.player.hp / world.player.maxHp };
    }
    if (world.interrupted) return { won: false, seconds: world.elapsed, hpLeft: 0 };
  }
  return { won: false, seconds: world.elapsed, hpLeft: world.player.hp / world.player.maxHp };
}

/** 中位数。连个位数都没有时返回 NaN，调用处的断言会自己失败。 */
export function medianOf(xs: readonly number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/**
 * 裸装单挑 Boss，返回「倒下那一刻 Boss 还剩多少血」（比率 0..1）。
 *
 * 和 fightBoss 的区别：这个要看**死了之后** Boss 剩多少，用于证明「差得远」；
 * fightBoss 只看赢没赢、多久赢。两种观察目标不同，所以是两个夹具，不是重复。
 */
export function bossHpLeftWhenDefeated(seed: number, bossHp: number): { sawBoss: boolean; left: number } {
  const rng = createRng(seed);
  const world = createWorld({ rng, floorId: 'f1', equipped: {} });
  spawnBossRoom(world, rng);
  const deps = { rng, equipped: {}, onLoot: () => {}, onKill: () => {} };

  let minBossHp = bossHp;
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
  return { sawBoss, left: minBossHp / bossHp };
}

/** 直接跳到 Boss 房。 */
function spawnBossRoom(world: ReturnType<typeof createWorld>, rng: ReturnType<typeof createRng>): void {
  spawnRoom(world, rng, 'f1', BOSS_ROOM_INDEX);
}
