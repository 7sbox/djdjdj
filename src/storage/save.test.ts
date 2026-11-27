import { describe, expect, it } from 'vitest';
import {
  SAVE_VERSION,
  SaveValidationError,
  exportSave,
  importAndReplace,
  importSave,
  newSave,
  saveFileName,
} from './save';
import type { SaveData } from './save';
import type { Item } from '../types';

/** 抓出 importSave 抛出的错误，断言它带着人话原因。 */
function catchImport(text: string): Error {
  try {
    importSave(text);
  } catch (err) {
    return err as Error;
  }
  throw new Error('这份存档本该被拒绝，却通过了');
}

function validSave(): SaveData {
  return newSave(12345);
}

function withField(mutate: (data: SaveData) => void): string {
  const data = validSave();
  mutate(data);
  return exportSave(data);
}

describe('导入存档：坏文件一律拒绝，并说人话', () => {
  it('导出的是带格式标记的 JSON，不是光秃秃的存档对象', () => {
    const file = exportSave(validSave());
    const envelope = JSON.parse(file) as Record<string, unknown>;
    expect(envelope.format).toBe('djdjdj-save');
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(typeof envelope.savedAt).toBe('number');
    expect(envelope.data).toBeTypeOf('object');
  });

  it('不是 JSON 时，报「不是合法 JSON」', () => {
    const err = catchImport('这不是 JSON，是我随手拖进来的破文本');
    expect(err).toBeInstanceOf(SaveValidationError);
    expect(err.message).toContain('不是合法 JSON');
  });

  it('是合法 JSON 但不是《地宫》存档时，报「不是存档文件」', () => {
    const err = catchImport(JSON.stringify({ name: 'djdjdj', version: '0.0.1' }));
    expect(err).toBeInstanceOf(SaveValidationError);
    expect(err.message).toContain('《地宫》的存档文件');
  });

  it('版本比本程序新时，两个版本号都写进原因里', () => {
    const file = withField((d) => { d.version = SAVE_VERSION + 1; });
    const err = catchImport(file);
    expect(err).toBeInstanceOf(SaveValidationError);
    expect(err.message).toContain('更新');
    expect(err.message).toContain(String(SAVE_VERSION + 1));
    expect(err.message).toContain(String(SAVE_VERSION));
  });

  it('缺少角色数据时点名角色数据', () => {
    const file = withField((d) => { delete (d as Partial<SaveData>).player; });
    expect(catchImport(file).message).toContain('角色');
  });

  it('缺少背包数据时点名背包', () => {
    const file = withField((d) => { delete (d as Partial<SaveData>).inventory; });
    expect(catchImport(file).message).toContain('背包');
  });

  it('缺少装备数据时点名装备', () => {
    const file = withField((d) => { delete (d as Partial<SaveData>).equipped; });
    expect(catchImport(file).message).toContain('装备');
  });

  it('地宫层 ID 不存在时拒绝，不留到读档后崩', () => {
    const file = withField((d) => { d.floorId = 'f99'; });
    const err = catchImport(file);
    expect(err).toBeInstanceOf(SaveValidationError);
    expect(err.message).toContain('f99');
  });

  it('种子不是数字时拒绝', () => {
    const file = withField((d) => { (d as unknown as Record<string, unknown>).seed = 'abc'; });
    expect(catchImport(file).message).toContain('种子');
  });
});

describe('导入存档：好文件原样读回', () => {
  it('导出再导入，拿到的还是同一份存档', () => {
    const data = validSave();
    data.player.level = 7;
    data.player.gold = 4321;
    data.inventory = [];
    data.floorId = 'f2';
    data.malice = 3;
    expect(importSave(exportSave(data))).toEqual(data);
  });

  it('刚建的新档也认', () => {
    const data = newSave(7);
    expect(importSave(exportSave(data))).toEqual(data);
  });
});
describe('导出文件名', () => {
  it('带日期与小时，能一眼分清是哪一次的存档', () => {
    const name = saveFileName(new Date(2026, 10, 28, 4, 59));
    expect(name).toBe('djdjdj-save-2026-11-28-04-59.json');
  });
});
function validItem(): Item {
  return {
    id: 'it_1',
    defId: 'def_head',
    slot: 'head',
    itemLevel: 5,
    rarity: 'green',
    baseStat: 12,
    baseStatType: 'armor',
    affixes: [],
    upgrade: 0,
  };
}

describe('导入存档：装备与设置也要过关', () => {
  it('背包里有损坏装备时，指出是第几件', () => {
    const file = withField((d) => {
      d.inventory = [validItem(), { ...validItem(), slot: undefined } as unknown as Item];
    });
    const err = catchImport(file);
    expect(err).toBeInstanceOf(SaveValidationError);
    expect(err.message).toContain('背包');
    expect(err.message).toContain('第 2 件');
  });

  it('装备栏里有损坏装备时，指出是哪个部位', () => {
    const file = withField((d) => {
      d.equipped = { head: { ...validItem(), rarity: undefined } as unknown as Item };
    });
    const err = catchImport(file);
    expect(err).toBeInstanceOf(SaveValidationError);
    expect(err.message).toContain('装备');
    expect(err.message).toContain('头');
  });

  it('缺少设置数据时拒绝', () => {
    const file = withField((d) => { delete (d as Partial<SaveData>).controls; });
    expect(catchImport(file).message).toContain('设置');
  });

  it('存档时间不是数字时拒绝（否则确认框里会显示 Invalid Date）', () => {
    const file = withField((d) => { d.savedAt = Number.NaN; });
    expect(catchImport(file).message).toContain('存档时间');
  });
});
describe('导入落盘：坏檔进来，原档一个字都不动', () => {
  it('坏存档被拒绝时，写盘函数一次都没被调用', async () => {
    const written: SaveData[] = [];
    const writer = async (d: SaveData) => { written.push(d); };

    await expect(importAndReplace('随手拖进来的破文本', writer)).rejects.toBeInstanceOf(
      SaveValidationError,
    );
    expect(written).toEqual([]);
  });

  it('版本太新的存档同样不写盘', async () => {
    const written: SaveData[] = [];
    const file = withField((d) => { d.version = SAVE_VERSION + 1; });

    await expect(importAndReplace(file, async (d) => { written.push(d); }))
      .rejects.toBeInstanceOf(SaveValidationError);
    expect(written).toEqual([]);
  });

  it('好存档才会落盘，落的就是校验过的那一份', async () => {
    const written: SaveData[] = [];
    const file = exportSave(validSave());

    await importAndReplace(file, async (d) => { written.push(d); });
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual(importSave(file));
  });
});
describe('老导出文件', () => {
  it('加界面之前导出的裸存档（没有外壳）仍然能读回来', () => {
    const data = validSave();
    const bare = JSON.stringify(data, null, 2);
    expect(importSave(bare)).toEqual(data);
  });
});
describe('版本号不能两头骗', () => {
  it('把外壳版本改小、本体却是新版本时，照样拒绝', () => {
    const data = validSave();
    data.version = SAVE_VERSION + 1;
    const tampered = JSON.parse(exportSave(data)) as {
      version: number;
      data: { version: number };
    };
    // 只改外壳，本体里的新版本号原样留着
    tampered.version = SAVE_VERSION;

    expect(() => importSave(JSON.stringify(tampered))).toThrow(SaveValidationError);
  });
});
describe('导入存档：词汇表里写死的边界也要守住', () => {
  it('煞气只能是 0–10', () => {
    expect(catchImport(withField((d) => { d.malice = 999; })).message).toContain('煞气');
    expect(catchImport(withField((d) => { d.malice = -1; })).message).toContain('煞气');
  });

  it('强化等级只能是 0–9', () => {
    const file = withField((d) => {
      d.inventory = [{ ...validItem(), upgrade: 50 }];
    });
    expect(catchImport(file).message).toContain('强化');
  });

  it('不认识的品质与部位要拒绝', () => {
    const badRarity = withField((d) => {
      d.inventory = [{ ...validItem(), rarity: 'rainbow' } as unknown as Item];
    });
    expect(catchImport(badRarity).message).toContain('品质');

    const badSlot = withField((d) => {
      d.inventory = [{ ...validItem(), slot: 'tail' } as unknown as Item];
    });
    expect(catchImport(badSlot).message).toContain('部位');
  });

  it('词条形状不对也要拒绝', () => {
    const file = withField((d) => {
      d.inventory = [{
        ...validItem(),
        affixes: [{ affixId: 'attack_speed' } as unknown as Item['affixes'][number]],
      }];
    });
    expect(catchImport(file).message).toContain('词条');
  });
});
