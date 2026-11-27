/**
 * 全项目共用的类型定义。
 *
 * 硬约束（来自设计讨论）：
 * - 这里的任何东西都不允许出现模型名、贴图名、Mesh 名。外观与数值彻底解耦。
 * - 装备等级 = 区域等级，固定不变。
 * - 等级只给固定属性和技能解锁，不给装备属性。
 */

/** 职业。首个切片只实现 warrior，其余占位。 */
export type JobId = 'warrior' | 'priest' | 'mage';

/** 品质。白 绿 蓝 紫 橙。 */
export type Rarity = 'common' | 'green' | 'blue' | 'purple' | 'orange';

/** 装备部位。8 个。 */
export type SlotId = 'head' | 'chest' | 'hands' | 'waist' | 'feet' | 'weapon' | 'ring1' | 'ring2';

/** 戒指两个槽共用同一套生成规则。 */
export type SlotKind = Exclude<SlotId, 'ring1' | 'ring2'> | 'ring';

/** 武器谱系。7 类。武器决定武学。 */
export type WeaponKind = 'sword' | 'blade' | 'spear' | 'fist' | 'bow' | 'zither' | 'whisk';

/** 词条族。 */
export type AffixFamily = 'attack' | 'defense' | 'element' | 'martial' | 'utility';

/** 伤害类型：物理 / 魔法。与攻击形态（近战/远程）正交。 */
export type DamageType = 'physical' | 'magic';

/** 攻击形态：近战 / 远程。 */
export type AttackForm = 'melee' | 'ranged';

/** 元素伤害类型。 */
export type ElementType = 'burn' | 'freeze' | 'poison';

/** 词条定义。18 条。 */
export interface AffixDef {
  id: string;
  name: string;
  family: AffixFamily;
  /** 是否百分比。true 时 value 是 0.05 这样的比率。 */
  percent: boolean;
  /** 词条数值洗练范围（相对于装备等级的 1.0 基准），实际值 = roll * 等级缩放。 */
  rollMin: number;
  rollMax: number;
  /** 允许出这条的部位。严格部位专属 —— 这是随机系统有无意义的分水岭。 */
  slots: SlotKind[];
  /** 允许出的最低品质。 */
  minRarity?: Rarity;
  /** 单条词条的显示后缀，如 "%"。 */
  suffix?: string;
}

/** 武器类型定义。 */
export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  /** 只有该职业能装备这把武器。 */
  job: JobId;
  /** 该武器绑定的武学族，决定技能与「某武学等级+1」词条生效对象。 */
  martialFamily: string;
  attackForm: AttackForm;
  damageType: DamageType;
}

/** 技能定义。4 槽：1 普攻 + 2 主动 + 1 位移/保命。 */
export interface SkillDef {
  id: string;
  name: string;
  job: JobId;
  weaponKinds: WeaponKind[];
  /** 槽位：0=普攻 1/2=主动 3=位移保命 */
  slot: 0 | 1 | 2 | 3;
  /** 解锁等级。切片里唯一来源是等级。 */
  unlockLevel: number;
  cooldown: number;
  /** 伤害倍率（相对攻击力）。 */
  power: number;
  /** 作用半径，0 为单体。 */
  radius: number;
  damageType: DamageType;
  /** 释放时对自身的处理。 */
  selfEffect?: 'heal' | 'dash' | 'shield';
  description: string;
}

/** 怪物定义。AI 只有 3 个状态：静立/巡逻 → 追击 → 攻击。 */
export interface MonsterDef {
  id: string;
  name: string;
  tier: 'normal' | 'elite' | 'boss';
  attackForm: AttackForm;
  damageType: DamageType;
  hp: number;
  damage: number;
  /**
   * 每逻辑帧移动距离（米/帧）。实际秒速 = speed / TICK_SECONDS（0.2 秒一帧）。
   * 刷怪以玩家为圆心、落在该怪自己的仇恨圈内（见 world.ts 的 spawnPos），
 * 所以移动速度要按「最远 20 秒内够得着人」标定，而不是按房间尺寸。
   */
  speed: number;
  /** 攻击距离（米）。近战约 1.5，远程 6–9。 */
  range: number;
  /** 攻击间隔（秒）。 */
  attackInterval: number;
  /** 首次仇恨半径。 */
  aggroRange: number;
  /** 生成权重。 */
  weight: number;
}

/** 地宫层。3 层，每层 3 房间 + 1 Boss 房。 */
export interface DungeonFloorDef {
  id: string;
  /** 显示名。 */
  name: string;
  /** 该层装备等级（固定，不随玩家等级变化）。 */
  itemLevel: number;
  /** 该层自然产出的怪物等级。 */
  monsterLevel: number;
  /** 怪物池。 */
  monsterIds: string[];
  /** 该层 Boss。 */
  bossId: string;
  /** 该层产生护甲常数 K 的基准。 */
  armorK: number;
}

/** 掉落表一次掷骰的结果。 */
export interface DropRollResult {
  itemId: string | null;
  /** 本场是否触发「财运」。 */
  fortune: boolean;
}

/** 装备实例（带随机属性的具体物品）。 */
export interface Item {
  id: string;
  defId: string;
  slot: SlotId;
  /** 装备等级 = 区域等级。 */
  itemLevel: number;
  rarity: Rarity;
  /** 基础白值那条属性的数值。 */
  baseStat: number;
  /** 基础属性种类，由部位决定。 */
  baseStatType: 'attack' | 'armor' | 'hp';
  affixes: ItemAffix[];
  /** 强化等级 0..9。 */
  upgrade: number;
}

export interface ItemAffix {
  affixId: string;
  roll: number;
  value: number;
}

/** 装备定义（模板，非实例）。 */
export interface ItemDef {
  id: string;
  slot: SlotKind;
  baseName: string;
  weaponKind?: WeaponKind;
}
