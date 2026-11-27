import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { weaponKindFromEquipped } from './world';
import type { Item, SlotId } from '../types';
import { rollItem } from './loot';

const gear = (kind: 'sword' | 'blade' | 'spear'): Partial<Record<SlotId, Item>> => ({
  weapon: rollItem({ slot: 'weapon', itemLevel: 5, rarity: 'green', weaponKind: kind }, createRng(3)),
});

describe('武器种类以身上那把武器为准', () => {
  it('武器槽里的刀 → blade', () => {
    expect(weaponKindFromEquipped(gear('blade'))).toBe('blade');
  });

  it('武器槽里的剑 → sword', () => {
    expect(weaponKindFromEquipped(gear('sword'))).toBe('sword');
  });

  it('武器槽里的枪棍 → spear（不认得的种类不该被硬塞成剑）', () => {
    expect(weaponKindFromEquipped(gear('spear'))).toBe('spear');
  });

  it('空手 → 剑，这是新档的起手武学', () => {
    expect(weaponKindFromEquipped({})).toBe('sword');
  });

  it('脱掉武器回到空手，也回到剑', () => {
    expect(weaponKindFromEquipped({ weapon: undefined })).toBe('sword');
  });
});
