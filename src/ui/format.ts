import type { Item, Rarity, SlotId } from '../types';
import { affixById } from '../data/affixes';
import { ITEM_DEFS, RARITY_NAMES, SLOT_NAMES } from '../data/items';
import { effectiveBaseStat } from '../sim/equip-ops';
import { upgradeMultiplier } from '../sim/loot';
import type { Stats } from '../sim/stats';

export const RARITY_CLASS: Record<Rarity, string> = {
  common: 'c-common', green: 'c-green', blue: 'c-blue', purple: 'c-purple', orange: 'c-orange',
};

export function itemName(item: Item): string {
  const def = ITEM_DEFS.find((d) => d.id === item.defId);
  const base = def?.baseName ?? '未知';
  return item.upgrade > 0 ? `${base} +${item.upgrade}` : base;
}

export function slotLabel(slot: SlotId): string {
  return SLOT_NAMES[slot];
}

export function itemBaseLine(item: Item): string {
  const v = effectiveBaseStat(item);
  switch (item.baseStatType) {
    case 'attack': return `攻击 ${v}`;
    case 'armor': return `护甲 ${v}`;
    case 'hp': return `生命 ${v}`;
  }
}

export function affixLine(affixId: string, value: number): string {
  const def = affixById(affixId);
  const v = def.percent ? `${(value * 100).toFixed(1)}%` : `${Math.round(value)}`;
  return `${def.name} +${v}`;
}

/**
 * 悬停对比：把一件候选装备与当前穿的那件比，逐条给出升/降。
 *
 * 这是整个游戏使用时间最长的交互 —— 不能让玩家自己算。
 * 返回的是「换了之后」的差值，正数为绿，负数为红。
 */
export interface DiffLine {
  label: string;
  delta: number;
  /** 展示文本，带正负号与百分比。 */
  text: string;
  /** 1 升 / -1 降 / 0 不变 */
  dir: 1 | -1 | 0;
  percent: boolean;
}

export function compareItems(next: Item, current: Item | undefined): DiffLine[] {
  const lines: DiffLine[] = [];

  const push = (label: string, a: number, b: number, percent = false) => {
    const delta = a - b;
    const dir: 1 | -1 | 0 = delta > 0.00001 ? 1 : delta < -0.00001 ? -1 : 0;
    if (dir === 0) {
      lines.push({ label, delta, text: '不变', dir, percent });
      return;
    }
    const shown = percent ? `${(delta * 100).toFixed(1)}%` : `${Math.round(delta)}`;
    lines.push({
      label,
      delta,
      text: `${delta > 0 ? '+' : ''}${shown}`,
      dir,
      percent,
    });
  };

  if (current) {
    push(itemBaseLine(current).split(' ')[0]!, effectiveBaseStat(next), effectiveBaseStat(current));
  }

  // 词条：以 next 为基准逐条比对，当前装备缺的那条算 0
  const curMap = new Map<string, number>();
  for (const a of current?.affixes ?? []) curMap.set(a.affixId, a.value);
  const nextMap = new Map<string, number>();
  for (const a of next.affixes) nextMap.set(a.affixId, a.value);

  const allIds = new Set([...nextMap.keys(), ...curMap.keys()]);
  for (const id of allIds) {
    const def = affixById(id);
    push(def.name, nextMap.get(id) ?? 0, curMap.get(id) ?? 0, def.percent);
  }

  // 强化等级单独一行
  if (next.upgrade !== current?.upgrade) {
    push('强化', next.upgrade, current?.upgrade ?? 0);
  }

  return lines;
}

/** 预估装备更换后的属性变化（用于角色页总览）。 */
export function statSummary(stats: Stats): { label: string; text: string }[] {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return [
    { label: '攻击', text: `${Math.round(stats.attack)}` },
    { label: '护甲', text: `${Math.round(stats.armor)}` },
    { label: '生命', text: `${Math.round(stats.hp)}` },
    { label: '暴击率', text: pct(stats.critRate) },
    { label: '暴击伤害', text: pct(stats.critDmg) },
    { label: '攻速', text: pct(stats.attackSpeed) },
    { label: '破甲', text: pct(stats.armorPen) },
    { label: '闪避', text: pct(stats.dodge) },
    { label: '减伤', text: pct(stats.damageReduce) },
    { label: '反伤', text: `${Math.round(stats.thorns)}` },
    { label: '灼烧', text: `${Math.round(stats.burn)}` },
    { label: '冰冻', text: `${Math.round(stats.freeze)}` },
    { label: '中毒', text: `${Math.round(stats.poison)}` },
    { label: '剑法等级', text: `${Math.round(stats.martialSword)}` },
    { label: '刀法等级', text: `${Math.round(stats.martialBlade)}` },
    { label: '冷却缩减', text: pct(stats.cooldownReduce) },
    { label: '掉落率', text: pct(stats.dropRate) },
    { label: '金币', text: pct(stats.goldFind) },
    { label: '吸血', text: pct(stats.lifesteal) },
    { label: '经验', text: pct(stats.expBonus) },
  ];
}

export function rarityName(r: Rarity): string {
  return RARITY_NAMES[r];
}

/** 强化后的白值倍数，给玩家看「+9 到底强多少」。 */
export function upgradeNote(level: number): string {
  const m = upgradeMultiplier(level);
  return `+${Math.round((m - 1) * 100)}% 白值`;
}
