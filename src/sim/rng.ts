/** 可复现的伪随机数发生器。存档只存种子，读档后序列一致。 */
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  /** 按权重取一项的索引。 */
  weighted(weights: readonly number[]): number;
}

/** mulberry32 —— 32 位状态，够用且快。 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('pick() on empty array');
      return arr[Math.floor(next() * arr.length)]!;
    },
    chance(p) {
      return next() < p;
    },
    weighted(weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i]!;
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },
  };
}

/** 生成物品 id 用的短随机串。 */
export function shortId(rng: Rng): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += Math.floor(rng.next() * 36).toString(36);
  return s;
}
