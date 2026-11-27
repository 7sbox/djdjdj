import type { Item } from '../types';
import { rollItem } from '../sim/loot';
import type { Rng } from '../sim/rng';

/** 存档版本。改数据结构时递增，读档时做迁移。 */
export const SAVE_VERSION = 1;

const DB_NAME = 'djdjdj';
const STORE = 'saves';
const KEY = 'slot0';
const BACKUP_KEY = 'slot0.bak';

export interface SaveData {
  version: number;
  savedAt: number;
  /** 随机种子 —— 存档只存种子，读档后序列一致。 */
  seed: number;
  player: {
    level: number;
    exp: number;
    hp: number;
    gold: number;
    ore: number;
    reforgeStones: number;
    potions: number;
    weaponKind: 'sword' | 'blade';
  };
  equipped: Record<string, Item>;
  inventory: Item[];
  floorId: string;
  malice: number;
  controls: {
    autoPotion: boolean;
    autoSkills: boolean;
    /** 自动拆解凡品。旧存档里没有这个字段，读档时按 false 处理。 */
    autoSalvageCommon?: boolean;
    skillPriority: string[];
    retreatAt: number;
  };
  /** 上次离线结算的时间戳。 */
  lastSeen: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打不开'));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'));
        t.oncomplete = () => db.close();
      }),
  );
}

/** 写存档。先把当前存档挪到 .bak，再写新的。 */
export async function saveGame(data: SaveData): Promise<void> {
  const existing = await tx<SaveData | undefined>('readonly', (s) => s.get(KEY));
  if (existing) {
    await tx('readwrite', (s) => s.put(existing, BACKUP_KEY));
  }
  await tx('readwrite', (s) => s.put(data, KEY));
}

/** 读取存档。主存档坏了就退回 .bak。 */
export async function loadGame(): Promise<SaveData | null> {
  try {
    const main = await tx<SaveData | undefined>('readonly', (s) => s.get(KEY));
    if (main) return main;
  } catch {
    // 主档读不出来，继续试备份
  }
  const backup = await tx<SaveData | undefined>('readonly', (s) => s.get(BACKUP_KEY));
  return backup ?? null;
}

export async function clearGame(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY));
  await tx('readwrite', (s) => s.delete(BACKUP_KEY));
}

/** 手动导出：一个能存进文本文件的 JSON 字符串。 */
export function exportSave(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

/** 手动导入：校验版本和基本形状，坏的直接拒绝，不做「尽力恢复」。 */
export function importSave(text: string): SaveData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('不是合法 JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('存档格式不对');

  const data = parsed as Partial<SaveData>;
  if (typeof data.version !== 'number') throw new Error('缺少存档版本');
  if (data.version > SAVE_VERSION) throw new Error('存档来自更新的版本，读不了');
  if (!data.player || typeof data.player.level !== 'number') throw new Error('存档缺少角色数据');
  if (!Array.isArray(data.inventory)) throw new Error('存档缺少背包数据');
  if (!data.equipped || typeof data.equipped !== 'object') throw new Error('存档缺少装备数据');

  return data as SaveData;
}

/** 每 5 分钟自动存档。返回一个停止函数。 */
export function startAutoSave(getData: () => SaveData, intervalMs = 5 * 60 * 1000): () => void {
  const id = setInterval(() => {
    void saveGame(getData());
  }, intervalMs);
  return () => clearInterval(id);
}

/** 从存档里重建装备实例（读档时用）。 */
export function reviverForItem(_rng: Rng) {
  return (raw: unknown): Item => {
    const it = raw as Partial<Item>;
    if (!it.id || !it.slot || !it.rarity) throw new Error('存档里有损坏的装备');
    return it as Item;
  };
}

/** 默认新档。 */
export function newSave(seed: number): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    seed,
    player: {
      level: 1,
      exp: 0,
      hp: 100,
      gold: 0,
      ore: 0,
      reforgeStones: 0,
      potions: 5,
      weaponKind: 'sword',
    },
    equipped: {},
    inventory: [],
    floorId: 'f1',
    malice: 0,
    controls: {
      autoPotion: true,
      autoSkills: true,
      skillPriority: ['sk_sword_swirl', 'sk_sword_pierce'],
      retreatAt: 0,
    },
    lastSeen: Date.now(),
  };
}

/** 测试用：造一件指定品质的装备。 */
export function debugItem(rng: Rng, rarity: Item['rarity'], slot: Item['slot']): Item {
  return rollItem({ slot, itemLevel: 10, rarity }, rng);
}
