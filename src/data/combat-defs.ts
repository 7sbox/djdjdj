import type { DungeonFloorDef, MonsterDef, SkillDef } from '../types';

/**
 * 8 种怪，但只有 3 个状态机（静立/巡逻 → 追击 → 攻击）。
 * 差异全靠参数：攻击距离、移动速度、伤害类型。
 */
export const MONSTERS: readonly MonsterDef[] = [
  // ── 近战 3 种 ────────────────────────────────────────────
  {
    id: 'm_dog', name: '野狗', tier: 'normal',
    attackForm: 'melee', damageType: 'physical',
    hp: 90, damage: 9, speed: 0.30, range: 1.6, attackInterval: 1.2,
    armor: 12,
    aggroRange: 9, weight: 30,
  },
  {
    id: 'm_golem', name: '石傀', tier: 'normal',
    attackForm: 'melee', damageType: 'physical',
    hp: 260, damage: 18, speed: 0.15, range: 1.8, attackInterval: 2.0,
    // 石头做的，甲比旧公式（10 + 260×0.02 = 15.2）厚 —— 甲是独立旋钮，不是从血量算出来的
    armor: 20,
    aggroRange: 7, weight: 18,
  },
  {
    id: 'm_gu', name: '蛊虫', tier: 'normal',
    attackForm: 'melee', damageType: 'magic',
    hp: 70, damage: 7, speed: 0.28, range: 1.4, attackInterval: 1.0,
    armor: 11,
    aggroRange: 8, weight: 26,
  },
  // ── 远程 3 种 ────────────────────────────────────────────
  {
    id: 'm_archer', name: '山贼弓手', tier: 'normal',
    attackForm: 'ranged', damageType: 'physical',
    hp: 110, damage: 12, speed: 0.16, range: 8, attackInterval: 1.6,
    armor: 6,
    aggroRange: 11, weight: 16,
  },
  {
    id: 'm_warlock', name: '邪术士', tier: 'normal',
    attackForm: 'ranged', damageType: 'magic',
    hp: 80, damage: 22, speed: 0.09, range: 7, attackInterval: 2.8,
    armor: 6,
    aggroRange: 10, weight: 12,
  },
  {
    id: 'm_firei', name: '火魈', tier: 'normal',
    attackForm: 'ranged', damageType: 'magic',
    hp: 130, damage: 15, speed: 0.15, range: 6, attackInterval: 2.0,
    armor: 6,
    aggroRange: 10, weight: 14,
  },
  // ── Boss 2 种 ────────────────────────────────────────────
  // 定档依据见 src/sim/boss-balance.test.ts（30 个种子实测）：
  // 裸装 1 级 0/30 且死前只啃掉 Boss 不到一半血；3 件绿装 14/30、末血中位 9%；
  // 4 件绿装 30/30、末血 9–75%、中位 57%、中位 156 秒打完。
  // 想调它，先让那几条用例继续成立。
  {
    id: 'm_boss_earth', name: '守碑石将', tier: 'boss',
    attackForm: 'melee', damageType: 'physical',
    hp: 4600, damage: 68, speed: 0.12, range: 3.2, attackInterval: 2.2,
    armor: 25,
    aggroRange: 12, weight: 0,
  },
  {
    // 第二层 K=120，护甲要按那一层的 K 配，不能沿用第一层的数字。
    // 旧公式给它是 5 + 7200*0.01 = 77，这里按同一减伤量级还原。
    id: 'm_boss_serpent', name: '幽窟蛇母', tier: 'boss',
    attackForm: 'ranged', damageType: 'magic',
    hp: 7200, damage: 48, speed: 0.14, range: 7.5, attackInterval: 1.9,
    armor: 77,
    aggroRange: 12, weight: 0,
  },
];

export const MONSTER_BY_ID: ReadonlyMap<string, MonsterDef> = new Map(
  MONSTERS.map((m) => [m.id, m]),
);

export function monsterById(id: string): MonsterDef {
  const m = MONSTER_BY_ID.get(id);
  if (!m) throw new Error(`未知怪物: ${id}`);
  return m;
}

/** 3 层地宫。装备等级固定于区域。 */
export const FLOORS: readonly DungeonFloorDef[] = [
  {
    id: 'f1', name: '第一层 · 断碑石廊', itemLevel: 5, monsterLevel: 5,
    monsterIds: ['m_dog', 'm_gu', 'm_archer', 'm_golem'],
    bossId: 'm_boss_earth', armorK: 50,
  },
  {
    id: 'f2', name: '第二层 · 悬尸甬道', itemLevel: 10, monsterLevel: 10,
    monsterIds: ['m_gu', 'm_archer', 'm_warlock', 'm_firei'],
    bossId: 'm_boss_serpent', armorK: 120,
  },
  {
    id: 'f3', name: '第三层 · 归墟地宫', itemLevel: 15, monsterLevel: 15,
    monsterIds: ['m_golem', 'm_warlock', 'm_firei', 'm_archer'],
    bossId: 'm_boss_earth', armorK: 200,
  },
];

export const FLOOR_BY_ID: ReadonlyMap<string, DungeonFloorDef> = new Map(
  FLOORS.map((f) => [f.id, f]),
);

export function floorById(id: string): DungeonFloorDef {
  const f = FLOOR_BY_ID.get(id);
  if (!f) throw new Error(`未知地宫层: ${id}`);
  return f;
}

/**
 * 技能。切片里只有等级解锁这一条来源（秘籍残卷留到之后）。
 * 4 槽：1 普攻（自动）+ 2 主动（可排优先级）+ 1 位移/保命。
 */
export const SKILLS: readonly SkillDef[] = [
  // 剑
  {
    id: 'sk_sword_basic', name: '劈山式', job: 'warrior', weaponKinds: ['sword'],
    slot: 0, unlockLevel: 1, cooldown: 0, power: 1.0, radius: 0,
    damageType: 'physical', description: '基础剑招，单体伤害。',
  },
  {
    id: 'sk_sword_swirl', name: '回风扫叶', job: 'warrior', weaponKinds: ['sword'],
    slot: 1, unlockLevel: 5, cooldown: 5, power: 1.6, radius: 3.2,
    damageType: 'physical', description: '原地横扫，命中范围内所有敌人。',
  },
  {
    id: 'sk_sword_pierce', name: '穿云式', job: 'warrior', weaponKinds: ['sword'],
    slot: 2, unlockLevel: 10, cooldown: 9, power: 2.6, radius: 0,
    damageType: 'physical', description: '突进直刺，单体重伤。',
  },
  {
    id: 'sk_sword_step', name: '游身步', job: 'warrior', weaponKinds: ['sword'],
    slot: 3, unlockLevel: 3, cooldown: 12, power: 0, radius: 0,
    damageType: 'physical', selfEffect: 'dash', description: '瞬间拉开距离，脱离包围。',
  },
  // ── 剑：秘籍招式（等级不给，只能抽残卷集齐习得）────────────────
  // 「抽卡不是废纸」的兑现点。它在**玩法轴**上和上面四招不同，不是数值更大：
  // 劈山/穿云是单体，回风是贴身小圈；这一招是覆盖极大的清扫，
  // 但倍率低于穿云、冷却长于回风 —— 换的是「清一群」还是「砍死一个」。
  {
    id: 'sk_sword_chain', name: '连星贯日', job: 'warrior', weaponKinds: ['sword'],
    slot: 2, unlockLevel: 0, cooldown: 11, power: 1.5, radius: 5.5,
    damageType: 'physical',
    description: '剑光成串贯出，扫过极大范围。倍率不如穿云式，但一次盖住整群小怪。',
  },
  // 刀
  {
    id: 'sk_blade_basic', name: '断岳斩', job: 'warrior', weaponKinds: ['blade'],
    slot: 0, unlockLevel: 1, cooldown: 0, power: 1.15, radius: 0,
    damageType: 'physical', description: '基础刀招，伤害略高于剑。',
  },
  {
    id: 'sk_blade_cleave', name: '横扫千军', job: 'warrior', weaponKinds: ['blade'],
    slot: 1, unlockLevel: 5, cooldown: 6, power: 1.4, radius: 4.0,
    damageType: 'physical', description: '大范围横扫，附带破甲。',
  },
  {
    id: 'sk_blade_sunder', name: '开碑手', job: 'warrior', weaponKinds: ['blade'],
    slot: 2, unlockLevel: 10, cooldown: 10, power: 3.0, radius: 0,
    damageType: 'physical', description: '蓄力一击，单体重伤。',
  },
  {
    id: 'sk_blade_guard', name: '卸甲势', job: 'warrior', weaponKinds: ['blade'],
    slot: 3, unlockLevel: 3, cooldown: 14, power: 0, radius: 0,
    damageType: 'physical', selfEffect: 'shield', description: '短暂硬直减伤。',
  },
  // 通用（保底）
  {
    id: 'sk_potion', name: '服丹', job: 'warrior', weaponKinds: [],
    slot: 3, unlockLevel: 1, cooldown: 8, power: 0, radius: 0,
    damageType: 'physical', selfEffect: 'heal', description: '自动服下回春丹。',
  },
];

/**
 * 只能靠秘籍残卷习得的招式（等级不给，unlockLevel: 0）。
 *
 * 定义在这里而不是 manual.ts，是为了让 skills.ts 不用反向依赖 sim 层。
 * 判定它们「没习得就不可用」的逻辑在 sim/manual.ts。
 */
export const MANUAL_SKILL_IDS: ReadonlySet<string> = new Set(['sk_sword_chain']);

export const SKILL_BY_ID: ReadonlyMap<string, SkillDef> = new Map(
  SKILLS.map((s) => [s.id, s]),
);

export function skillById(id: string): SkillDef {
  const s = SKILL_BY_ID.get(id);
  if (!s) throw new Error(`未知技能: ${id}`);
  return s;
}
