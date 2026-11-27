import type { Item, Rarity, SlotId } from '../types';
import { MAX_UPGRADE, rollAffixes, synthTargetRarity, upgradeCost, upgradeMultiplier } from './loot';
import type { Rng } from './rng';

/** 装备操作的统一返回：成功就把新物品带回来，失败给出人话原因。 */
export type OpResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface Wallet {
  gold: number;
  ore: number;
  reforgeStones: number;
}

/**
 * 强化：必成、不降级、不失败。上限 +9。
 *
 * 设计讨论里特别定下的一条：强化等级可以无损转移到同部位新装备上，
 * 否则玩家换装会有「我白强化了」的挫败感 —— 这是此类游戏的头号弃坑原因。
 */
export function upgradeItem(
  item: Item,
  wallet: Wallet,
): OpResult<{ item: Item; wallet: Wallet }> {
  if (item.upgrade >= MAX_UPGRADE) {
    return { ok: false, reason: `已经 +${MAX_UPGRADE}，到顶了` };
  }
  const cost = upgradeCost(item.upgrade);
  if (wallet.ore < cost.ore) return { ok: false, reason: `强化矿不足（需要 ${cost.ore}）` };
  if (wallet.gold < cost.gold) return { ok: false, reason: `金币不足（需要 ${cost.gold}）` };

  return {
    ok: true,
    value: {
      item: { ...item, upgrade: item.upgrade + 1 },
      wallet: { ...wallet, ore: wallet.ore - cost.ore, gold: wallet.gold - cost.gold },
    },
  };
}

/**
 * 强化转移：把旧装备的强化等级搬到同部位的新装备上，旧装备归零。
 * 收一点手续费，但不打折。
 */
export function transferUpgrade(
  from: Item,
  to: Item,
  wallet: Wallet,
): OpResult<{ from: Item; to: Item; wallet: Wallet }> {
  if (from.upgrade === 0) return { ok: false, reason: '这件装备没有强化等级' };
  if (from.slot !== to.slot) return { ok: false, reason: '只能转移到同部位' };
  if (from.id === to.id) return { ok: false, reason: '不能转移给自己' };
  if (to.upgrade >= from.upgrade) return { ok: false, reason: '目标装备的强化等级不低' };

  const fee = Math.round(upgradeCost(from.upgrade - 1).gold * 0.3);
  if (wallet.gold < fee) return { ok: false, reason: `手续费不足（需要 ${fee}）` };

  return {
    ok: true,
    value: {
      from: { ...from, upgrade: 0 },
      to: { ...to, upgrade: from.upgrade },
      wallet: { ...wallet, gold: wallet.gold - fee },
    },
  };
}

/**
 * 重铸：只重掷指定的那一条词条，其他词条原样保留。
 * 这是「赌」，但有止损 —— 玩家能直接看见要换掉哪条。
 */
export function reforgeAffix(
  item: Item,
  affixIndex: number,
  wallet: Wallet,
  rng: Rng,
  slots: readonly (SlotId | 'ring')[],
): OpResult<{ item: Item; wallet: Wallet }> {
  if (wallet.reforgeStones < 1) return { ok: false, reason: '重铸石不足' };
  const target = item.affixes[affixIndex];
  if (!target) return { ok: false, reason: '没有这条词条' };

  const normalized = item.slot === 'ring1' || item.slot === 'ring2' ? 'ring' : item.slot;
  if (!slots.includes(normalized)) return { ok: false, reason: '部位不匹配' };

  // 重掷范围与原条数相同，且不能和已有其他词条重复
  const existing = new Set(item.affixes.filter((_, i) => i !== affixIndex).map((a) => a.affixId));
  const rolled = rollAffixes(normalized, item.rarity, item.affixes.length, item.itemLevel, rng)
    .filter((a) => !existing.has(a.affixId) && a.affixId !== target.affixId);

  if (rolled.length === 0) return { ok: false, reason: '这个部位没有其他可出的词条' };

  const next = [...item.affixes];
  next[affixIndex] = rng.pick(rolled);

  return {
    ok: true,
    value: {
      item: { ...item, affixes: next },
      wallet: { ...wallet, reforgeStones: wallet.reforgeStones - 1 },
    },
  };
}

/**
 * 合成：3 件同部位同品质 → 1 件高一品质，词条重新随机。
 * 它是「垃圾变废为宝的出口」，解决满背包废品带来的焦虑。
 */
export function synthItems(
  parts: readonly Item[],
  makeItem: (slot: SlotId, rarity: Rarity, itemLevel: number) => Item,
): OpResult<{ item: Item }> {
  if (parts.length !== 3) return { ok: false, reason: '需要 3 件' };

  const first = parts[0];
  if (!first) return { ok: false, reason: '没有材料' };

  const normalized = (s: SlotId) => (s === 'ring1' || s === 'ring2' ? 'ring' : s);
  for (const p of parts) {
    if (normalized(p.slot) !== normalized(first.slot)) return { ok: false, reason: '部位不同' };
    if (p.rarity !== first.rarity) return { ok: false, reason: '品质不同' };
  }

  const target = synthTargetRarity(first.rarity);
  if (!target) return { ok: false, reason: '传说已经是最高品质' };

  // 新装备等级取三件的平均值，四舍五入
  const avgLevel = Math.round(parts.reduce((a, p) => a + p.itemLevel, 0) / parts.length);
  const item = makeItem(first.slot, target, avgLevel);

  // 强化等级取三件里最高的一件，作为「不让人亏」的兑现
  const bestUpgrade = parts.reduce((a, p) => Math.max(a, p.upgrade), 0);
  return { ok: true, value: { item: { ...item, upgrade: bestUpgrade } } };
}

/** 拆解：只产出强化矿。 */
export function salvageYieldOf(rarity: Rarity): number {
  return { common: 1, green: 3, blue: 8, purple: 20, orange: 50 }[rarity];
}

/** 这件装备的当前实际白值（含强化）。 */
export function effectiveBaseStat(item: Item): number {
  return Math.round(item.baseStat * upgradeMultiplier(item.upgrade));
}

export { upgradeCost };
