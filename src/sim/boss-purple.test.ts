import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createWorld, spawnRoom, stepWorld } from './world';
import type { Item, SlotId } from '../types';

/**
 * 规格 §三：**Boss 掉 3 件，其中必有一件紫**。
 *
 * 这句话以前是假的。旧实现把首件的凡品/精良映射成紫，可掷到稀有（blue）时
 * 首件就照蓝掉，其余两件更完全不管 —— 跨 27 个种子/煞气组合实测 1350 次 Boss 击杀，
 * 有 50 次（3.70%）一件紫都没有，全是 blue/blue/blue 这种。
 *
 * 这句保底是「打完 Boss 有回报」的全部支点，不能靠概率兜着。
 */
describe('Boss 必掉紫', () => {
  it('任何种子、任何煞气下，每次 Boss 掉落都至少有一件紫装', () => {
    const bad: string[] = [];
    let total = 0;

    for (const malice of [0, 5, 10]) {
      for (const seed of [1, 2, 3, 7, 42, 99, 777, 90210, 123456]) {
        const rng = createRng(seed);
        const equipped: Partial<Record<SlotId, Item>> = {};
        const world = createWorld({ rng, floorId: 'f1', equipped, malice });
        let current: string[] = [];
        const deps = {
          rng,
          equipped,
          onLoot: (item: Item) => current.push(item.rarity),
          onKill: () => {},
        };

        for (let round = 0; round < 50; round++) {
          current = [];
          spawnRoom(world, rng, 'f1', 3);
          for (const m of world.monsters) if (m.defId.startsWith('m_boss_')) m.hp = 1;
          for (let i = 0; i < 200 && world.monsters.some((m) => m.hp > 0); i++) stepWorld(world, deps);
          if (current.length > 0) {
            total++;
            if (!current.some((r) => r === 'purple' || r === 'orange')) {
              if (bad.length < 3) bad.push(`煞气${malice}/种子${seed}: ${current.join(' / ')}`);
            }
          }
          world.monsters = [];
        }
      }
    }

    expect(total, '一次 Boss 都没打死，测试没验到东西').toBeGreaterThan(500);
    expect(bad, `有 Boss 掉落里一件紫都没有，例如：\n${bad.join('\n')}`).toHaveLength(0);
  });
});
