import type { Item, WeaponKind } from '../types';
import { FLOOR_BY_ID } from '../data/combat-defs';
import { SLOT_NAMES, WEAPONS } from '../data/items';
import type { Rarity, SlotId } from '../types';
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
    /** 由身上的武器决定，读档后按装备重算一次为准 —— 见 weaponKindFromEquipped。 */
    weaponKind: WeaponKind;
  };
  equipped: Record<string, Item>;
  inventory: Item[];
  floorId: string;
  malice: number;
  controls: {
    autoPotion: boolean;
    autoSkills: boolean;
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

/** 导出文件的格式标记。导入时靠它分辨「这是不是《地宫》的存档」。 */
export const SAVE_FORMAT = 'djdjdj-save';

/** 导出文件的外壳：格式标记 + 版本号 + 存档本体。 */
export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: number;
  data: SaveData;
}

/** 导入失败的原因。消息是给人看的，会原样出现在界面上。 */
export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveValidationError';
  }
}

/**
 * 手动导出：一个能存进 .json 文件、也能直接读的字符串。
 *
 * 外壳里单独写一份版本号，是为了在解析存档本体之前就能判断
 * 「这份文件是不是更新版本的游戏存的」——本体形状可能已经变了。
 */
export function exportSave(data: SaveData): string {
  const envelope: SaveEnvelope = {
    format: SAVE_FORMAT,
    version: data.version,
    savedAt: Date.now(),
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

/** 导出文件名：`djdjdj-save-2026-11-28-04-59.json`。 */
export function saveFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `djdjdj-save-${d}-${t}.json`;
}

/** 认识的全部武器谱系。存档里的 weaponKind 必须是其中之一。 */
const WEAPON_KINDS: ReadonlySet<string> = new Set(WEAPONS.map((w) => w.kind));

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const RARITIES: ReadonlySet<string> = new Set<Rarity>(['common', 'green', 'blue', 'purple', 'orange']);
const SLOTS: ReadonlySet<string> = new Set<SlotId>([
  'head', 'chest', 'hands', 'waist', 'feet', 'weapon', 'ring1', 'ring2',
]);

/** 强化等级上限。词汇表里写死：必成、+9 封顶。 */
const MAX_UPGRADE = 9;

/** 煞气上限。词汇表里写死：0–10。 */
const MAX_MALICE = 10;

/** 一条词条要有 id、掷点与数值，缺一个读进来就会在界面上显示 undefined。 */
function isAffix(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.affixId === 'string' &&
    typeof v.roll === 'number' &&
    typeof v.value === 'number'
  );
}

/** 一件装备要过得了这几关，否则读进来会在界面上炸。 */
function checkItem(v: unknown, where: string): void {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.defId !== 'string') {
    throw new SaveValidationError(`存档里的${where}有损坏的装备，读不了。`);
  }
  if (!SLOTS.has(v.slot as string)) {
    throw new SaveValidationError(`存档里的${where}有一件装备的部位认不出来，读不了。`);
  }
  if (!RARITIES.has(v.rarity as string)) {
    throw new SaveValidationError(`存档里的${where}有一件装备的品质认不出来，读不了。`);
  }
  if (typeof v.itemLevel !== 'number' || typeof v.baseStat !== 'number') {
    throw new SaveValidationError(`存档里的${where}有一件装备缺数值，读不了。`);
  }
  if (typeof v.upgrade !== 'number' || v.upgrade < 0 || v.upgrade > MAX_UPGRADE) {
    throw new SaveValidationError(`存档里的${where}有一件装备的强化等级超出 0–${MAX_UPGRADE}，读不了。`);
  }
  if (!Array.isArray(v.affixes) || !v.affixes.every(isAffix)) {
    throw new SaveValidationError(`存档里的${where}有一件装备的词条坏了，读不了。`);
  }
}

/** 没有外壳的老导出文件长这样：本体自己带 version。 */
function looksLikeBareSave(o: Record<string, unknown>): boolean {
  return (
    typeof o.version === 'number' &&
    isObject(o.player) &&
    Array.isArray(o.inventory) &&
    isObject(o.equipped)
  );
}

/**
 * 手动导入：校验格式、版本和形状，坏的直接拒绝，不做「尽力恢复」。
 *
 * 全部拒绝理由都用 SaveValidationError 抛出，并且说人话 ——
 * 这是玩家存档出事时唯一能看懂的线索。
 */
export function importSave(text: string): SaveData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveValidationError('这不是合法 JSON：文件可能被别的程序改过，或者选错了文件。');
  }
  if (!isObject(parsed)) {
    throw new SaveValidationError('这不是《地宫》的存档文件：文件内容是空的，或者根本不是存档。');
  }

  const envelope = parsed as Partial<SaveEnvelope>;

  let version: unknown;
  let raw: unknown;
  if (envelope.format === SAVE_FORMAT) {
    version = envelope.version;
    raw = envelope.data;
  } else if (looksLikeBareSave(parsed)) {
    // 加界面之前，导出文件是光秃秃的存档本体。老文件照收，不做「尽力恢复」。
    version = parsed.version;
    raw = parsed;
  } else {
    throw new SaveValidationError('这不是《地宫》的存档文件：认不出文件里的格式标记。请选游戏里「导出存档」下载的 .json 文件。');
  }

  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new SaveValidationError('存档缺少存档版本，读不了。');
  }
  if (version > SAVE_VERSION) {
    throw new SaveValidationError(
      `存档来自更新的版本（v${version}），本程序只认到 v${SAVE_VERSION}。请把游戏更新到同一版本再导入。`,
    );
  }
  if (version < 1) {
    throw new SaveValidationError(`存档版本（v${version}）不对，读不了。`);
  }

  if (!isObject(raw)) {
    throw new SaveValidationError('这不是《地宫》的存档文件：里面没有存档本体。');
  }
  const data = raw as Partial<SaveData>;

  // 存档本体自己也带版本号。改小外壳骗不过去 —— 本体更新照样拒绝。
  if (typeof data.version === 'number' && data.version > SAVE_VERSION) {
    throw new SaveValidationError(
      `存档本体来自更新的版本（v${data.version}），本程序只认到 v${SAVE_VERSION}。请把游戏更新到同一版本再导入。`,
    );
  }

  if (typeof data.seed !== 'number') throw new SaveValidationError('存档缺少随机种子，读不了。');

  const player = data.player;
  if (!isObject(player)) throw new SaveValidationError('存档缺少角色数据，读不了。');
  for (const key of ['level', 'exp', 'hp', 'gold', 'ore', 'reforgeStones', 'potions'] as const) {
    if (typeof player[key] !== 'number') {
      throw new SaveValidationError(`存档里的角色数据不完整（缺 ${key}），读不了。`);
    }
  }
  if (typeof player.weaponKind !== 'string' || !WEAPON_KINDS.has(player.weaponKind)) {
    throw new SaveValidationError('存档里的角色数据不完整（武器谱系不对），读不了。');
  }

  if (typeof data.savedAt !== 'number' || !Number.isFinite(data.savedAt)) {
    throw new SaveValidationError('存档缺少存档时间，读不了。');
  }

  if (!Array.isArray(data.inventory)) throw new SaveValidationError('存档缺少背包数据，读不了。');
  data.inventory.forEach((it, i) => checkItem(it, `背包（第 ${i + 1} 件）`));

  if (!isObject(data.equipped)) throw new SaveValidationError('存档缺少装备数据，读不了。');
  for (const [slot, it] of Object.entries(data.equipped)) {
    const name = SLOT_NAMES[slot as SlotId] ?? slot;
    checkItem(it, `装备栏（${name}）`);
  }

  if (typeof data.floorId !== 'string' || !FLOOR_BY_ID.has(data.floorId)) {
    throw new SaveValidationError(
      `存档里的地宫层「${String(data.floorId)}」本程序没有，读不了。`,
    );
  }
  if (typeof data.malice !== 'number' || data.malice < 0 || data.malice > MAX_MALICE) {
    throw new SaveValidationError(`存档里的煞气不在 0–${MAX_MALICE} 之间，读不了。`);
  }
  if (!isObject(data.controls)) throw new SaveValidationError('存档缺少设置数据，读不了。');

  return data as SaveData;
}

/**
 * 导入并覆盖本地存档。校验不过就直接抛，**一个字节都不写** ——
 * 现有存档与 .bak 都原样留着（写盘走的是 saveGame 的「先备份再写」）。
 *
 * writer 默认就是 saveGame，测试里可以换掉，用来验证「坏档没写盘」。
 */
export async function importAndReplace(
  text: string,
  writer: (data: SaveData) => Promise<void> = saveGame,
): Promise<SaveData> {
  const data = importSave(text);
  await writer(data);
  return data;
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