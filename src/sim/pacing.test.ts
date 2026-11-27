import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { MONSTERS, floorById, monsterById } from '../data/combat-defs';
import { TICK_SECONDS, createWorld, resumeFarming, stepWorld } from './world';
import type { Item, SlotId } from '../types';

/**
 * 挂机的死锁与节奏。
 *
 * 固定视角的房间里，人物站着不动、怪从四周刷出来。这里有两个必须守住的东西：
 *   1. 每一只怪都必须够得着玩家 —— 够不着就永远不会死，房间永不空，
 *      自动跑图当场死锁（这是挂机游戏最严重的一类 bug）。
 *   2. 走近这一步不能比打死还慢，否则挂机的时间全花在等它过来。
 */
describe('怪物必须都够得着玩家（否则自动跑图死锁）', () => {
  it('任何一层、任何煞气，跑够时间后房间一定能清空', () => {
    for (const floor of ['f1', 'f2', 'f3']) {
      for (const malice of [0, 10]) {
        for (const seed of [1, 2, 3, 7, 42, 99]) {
          const rng = createRng(seed);
          const equipped: Partial<Record<SlotId, Item>> = {};
          const world = createWorld({ rng, floorId: floor, equipped, malice });
          const deps = { rng, equipped, onLoot: () => {}, onKill: () => {} };
          let advanced = false;
          for (let i = 0; i < 400 / TICK_SECONDS; i++) {
            if (world.interrupted) resumeFarming(world, rng);
            stepWorld(world, deps);
            if (world.roomIndex > 0 || world.monsters.length === 0) { advanced = true; break; }
          }
          expect(
            advanced,
            `${floor} 煞气 ${malice} 种子 ${seed}：400 秒后还卡在第一间，剩下 ${world.monsters.length} 只够不着人的怪`,
          ).toBe(true);
        }
      }
    }
  });

  it('每只怪刷出来时就在自己的仇恨圈里 —— 否则它永远不会追过来', () => {
    // 这条比「房间能清空」更严格：房间能清空可能是因为玩家的攻击没有射程，
    // 但一只怪若刷在自己仇恨圈外，它就永远静止，玩家只能站着挨别处的打。
    for (const floor of ['f1', 'f2', 'f3']) {
      for (const malice of [0, 10]) {
        for (const seed of [1, 2, 3, 7, 42, 99, 1234]) {
          const rng = createRng(seed);
          const equipped: Partial<Record<SlotId, Item>> = {};
          const world = createWorld({ rng, floorId: floor, equipped, malice });
          for (const m of world.monsters) {
            const def = monsterById(m.defId);
            const d = Math.hypot(m.pos.x - world.player.pos.x, m.pos.z - world.player.pos.z);
            expect(
              d,
              `${floor} 种子 ${seed}：${def.name} 刷在离玩家 ${d.toFixed(1)} 米处，超出了自己的仇恨圈 ${def.aggroRange} 米`,
            ).toBeLessThanOrEqual(def.aggroRange);
          }
        }
      }
    }
  });

  it('没有哪只怪从刷出点走到玩家身边要超过 20 秒', () => {
    for (const def of MONSTERS) {
      const metersPerSecond = def.speed / TICK_SECONDS;
      const worstCaseSeconds = (14 - def.range) / metersPerSecond;
      expect(
        worstCaseSeconds,
        `${def.name} 每秒只走 ${metersPerSecond.toFixed(2)} 米，最坏要 ${worstCaseSeconds.toFixed(0)} 秒才够得着人`,
      ).toBeLessThanOrEqual(20);
    }
  });

  it('每层的护甲常数按层递增（除法减伤的基准）', () => {
    expect(floorById('f1').armorK).toBe(50);
    expect(floorById('f2').armorK).toBe(120);
    expect(floorById('f3').armorK).toBe(200);
  });
});
