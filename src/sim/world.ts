import type { MonsterDef, SkillDef, WeaponKind } from '../types';
import { floorById, monsterById } from '../data/combat-defs';
import type { Rng } from './rng';
import { clampStats, combineStats, computeDamage, levelStats, mitigation, statsFromEquipment } from './stats';
import type { Stats } from './stats';
import { ITEM_DEF_BY_ID } from '../data/items';
import { basicSkillFor, equippedSkillBar } from '../data/skills';
import { allLearnedSkillIds, skillUnlockedByManual, type ManualState } from './manual';
import { randomSlot, rollDrop, rollItem, salvageYield } from './loot';
import type { Item, SlotId } from '../types';


/** 固定逻辑帧：0.2 秒。渲染层插值，逻辑层不受帧率影响。 */
export const TICK_SECONDS = 0.2;

/** 房间与怪物容量。性能红线：同屏 60 只 @60fps。 */
export const MAX_MONSTERS_ON_SCREEN = 60;

export interface Vec2 {
  x: number;
  z: number;
}

export interface Monster {
  uid: number;
  defId: string;
  hp: number;
  maxHp: number;
  pos: Vec2;
  /** 3 个状态：0 待机/巡逻 1 追击 2 攻击 */
  state: 0 | 1 | 2;
  attackCd: number;
  /** 中毒/灼烧等持续伤害的剩余量与来源。 */
  dots: { element: 'burn' | 'freeze' | 'poison'; dps: number; left: number }[];
  /** 冰冻减速剩余时间。 */
  slow: number;
  elite: boolean;
}

export interface FloatingText {
  uid: number;
  text: string;
  kind: 'damage' | 'crit' | 'heal' | 'loot';
  pos: Vec2;
  life: number;
}

export interface LootDrop {
  uid: number;
  item: Item;
  pos: Vec2;
  life: number;
}

export interface WorldLogEntry {
  t: number;
  text: string;
}

/** 五个手动开关（Q9）。 */
export interface PlayerControls {
  /** 自动喝药：血量低于 40% 时自动服丹。关掉就完全不喝。 */
  autoPotion: boolean;
  /** 自动释放主动技。关掉只普攻。 */
  autoSkills: boolean;
  /**
   * 自动拆解凡品：掉落时凡品直接变成强化矿，不进背包。
   *
   * 不开它，背包 80 格而 10 分钟只掉 20 来件，玩家永远等不到「满了」，
   * 拆解这条出口在头十分钟里形同不存在。
   */
  autoSalvageCommon: boolean;

  /**
   * 自动补丹：丹囊空了就拿金币补到上限。
   *
   * ADR-0005 的药钱压力仍然成立 —— 它花的是真金白银，装备差硬撑高层照样烧光。
   * 但「买药」这件事本身不该需要玩家盯着，否则挂机就不省心了。
   */
  autoBuyPotions: boolean;
  /** 主动技优先级顺序（技能 id）。冲突时先放前面的。 */
  skillPriority: string[];
  /** 撤退线：血量低于此比率自动往回走。0 表示不撤退。 */
  retreatAt: number;
}

export interface WorldState {
  tick: number;
  elapsed: number;

  floorId: string;
  malice: number;
  roomIndex: number;

  player: {
    level: number;
    exp: number;
    hp: number;
    maxHp: number;
    pos: Vec2;
    mp: number;
    potions: number;
    gold: number;
    ore: number;
    reforgeStones: number;
    /** 残页：抽秘籍残卷的唯一消耗。只有精英与 Boss 会掉。 */
    scrollPages: number;
    /** 技能的冷却剩余（按技能 id）。 */
    cooldowns: Record<string, number>;
    weaponKind: WeaponKind;
    attackCd: number;
    alive: boolean;
    respawnIn: number;
  };

  controls: PlayerControls;

  /**
   * 秘籍收藏：已拥有的残卷、已习得的秘籍。
   *
   * 放在世界状态里而不是 player 里，是因为它不是「战斗属性」——
   * 它决定**哪些招式可用**，这个判定必须在一处说了算（见 castableSkills）。
   */
  manual: ManualState;

  monsters: Monster[];
  floating: FloatingText[];
  loot: LootDrop[];

  /** 本场战斗的掉落率加成（由财运等临时效果提供）。 */
  fortuneTicks: number;

  log: WorldLogEntry[];
  /** 本轮房间已刷新次数，用于判断清场。 */
  roomCleared: boolean;
  bossDefeated: boolean;
  /**
   * 挂机是否被中断。死亡后置 true，怪物不再刷新，人物停在城中 —
   * 这就是「挂机被杀了」本身的惩罚：你回来发现进度停了两小时。
   * 玩家点「继续挂机」才恢复。
   */
  interrupted: boolean;
}

export interface WorldDeps {
  rng: Rng;
  equipped: Partial<Record<SlotId, Item>>;
  onLoot: (item: Item) => void;
  onKill: (def: MonsterDef, elite: boolean) => void;
}

let nextUid = 1;
function uid(): number {
  return nextUid++;
}

/** 玩家基础站位：固定视角，人物永远在屏幕中下方，怪物从四周涌来。 */
const PLAYER_HOME: Vec2 = { x: 0, z: 6 };

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function moveToward(from: Vec2, to: Vec2, step: number): Vec2 {
  const d = dist(from, to);
  if (d < 1e-6) return { ...from };
  const t = Math.min(1, step / d);
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

export function createWorld(opts: {
  rng: Rng;
  floorId: string;
  equipped: Partial<Record<SlotId, Item>>;
  malice?: number;
  /** 秘籍收藏的初值（读档时用）。不传就是空收藏。 */
  manual?: ManualState;
}): WorldState {
  const floor = floorById(opts.floorId);
  const level = 1;

  const state: WorldState = {
    tick: 0,
    elapsed: 0,
    floorId: opts.floorId,
    malice: opts.malice ?? 0,
    roomIndex: 0,
    player: {
      level,
      exp: 0,
      hp: 100,
      maxHp: 100,
      pos: { ...PLAYER_HOME },
      mp: 0,
      potions: 5,
      gold: 0,
      ore: 0,
      reforgeStones: 0,
      scrollPages: 0,
      cooldowns: {},
      // 武器决定武学：开局那一身装备就决定你现在会什么
      weaponKind: weaponKindFromEquipped(opts.equipped),
      attackCd: 0,
      alive: true,
      respawnIn: 0,
    },
    controls: {
      autoPotion: true,
      autoSkills: true,
      autoSalvageCommon: false,
      autoBuyPotions: true,
      // 只是起手的顺序偏好；换武器不用改它，pickSkill 会把本武器的招接着排上来
      skillPriority: ['sk_sword_swirl', 'sk_sword_pierce'],
      retreatAt: 0,
    },
    manual: opts.manual ?? { fragments: [], completed: [] },
    monsters: [],
    floating: [],
    loot: [],
    fortuneTicks: 0,
    log: [],
    roomCleared: false,
    bossDefeated: false,
    interrupted: false,
  };

  // 初始化生命值
  const s = playerStats(state, opts.equipped);
  state.player.maxHp = s.hp;
  state.player.hp = s.hp;

  spawnRoom(state, opts.rng, floor.id, 0);
  void floor;
  return state;
}

export function playerStats(state: WorldState, equipped: Partial<Record<SlotId, Item>>): Stats {
  const fromGear = statsFromEquipment(equipped);
  const fromLevel = levelStats(state.player.level);
  return clampStats(combineStats(fromLevel, fromGear));
}

/** 刷怪环带的内径：再靠近就变成贴脸刷了。 */
const SPAWN_RADIUS_MIN = 9;

/**
 * 生成一个「刷出来就在自己仇恨圈里」的坐标。
 *
 * 以前是绕房间原点撒点，而这个房间的中心并不是玩家的位置 —— 于是背对玩家的那一侧
 * 会刷出离玩家 15–20 米、却只有 7–11 米仇恨圈的怪。它永远不追、永远不死，
 * 房间清不空，自动跑图当场死锁。
 *
 * 现在以玩家为圆心撒点，并把半径夹到 [min, aggroRange] 之间：
 *
 * - 上限取 aggroRange，因为出了仇恨圈的怪永远不会进入追击状态；
 * - 下限本来是 SPAWN_RADIUS_MIN，但仇恨圈比它更小的怪（石傀 7 米、蛊虫 8 米）
 *   会被顶到圈外 —— 所以内径必须让位，宁可贴得近一点，也不能刷出一只不动的怪。
 */
function spawnPos(
  rng: Rng,
  playerPos: Vec2,
  aggroRange: number,
): Vec2 {
  // 留 0.5 米余量：既避开浮点误差把「刚好在圈上」算成圈外，
  // 也避开仇恨判定用的是严格比较边缘。
  const maxDist = Math.max(0.5, aggroRange - 0.5);

  // 内径不能顶到外径上，否则半径退化成定值，同种怪全叠在一个圆周上，
  // 看着像「一圈怪站在同一个圈里」。仇恨圈只比余量多一点时（石傀 7 米），
  // 就把环带整体收窄，但至少留 40% 的纵深。
  const minDist = Math.min(SPAWN_RADIUS_MIN, maxDist * 0.6);

  const angle = rng.next() * Math.PI * 2;
  const radius = minDist + rng.next() * (maxDist - minDist);
  return {
    x: playerPos.x + Math.cos(angle) * radius,
    z: playerPos.z + Math.sin(angle) * radius,
  };
}

/** 从怪物池里抽一只。精英概率 12%。 */
function spawnMonsters(
  defIds: readonly string[],
  count: number,
  floorItemLevel: number,
  malice: number,
  rng: Rng,
  eliteChance: number,
  playerPos: Vec2,
): Monster[] {
  const out: Monster[] = [];
  const levelScale = 1 + malice * 0.1;
  for (let i = 0; i < count; i++) {
    const def = monsterById(rng.pick(defIds));
    const elite = def.tier === 'normal' && rng.chance(eliteChance);
    const hpScale = levelScale * (elite ? 3 : 1);
    const hp = Math.round(def.hp * hpScale * (1 + floorItemLevel * 0.08));
    out.push({
      uid: uid(),
      defId: def.id,
      hp,
      maxHp: hp,
      pos: spawnPos(rng, playerPos, def.aggroRange),
      state: 0,
      attackCd: 0,
      dots: [],
      slow: 0,
      elite,
    });
  }
  return out;
}

/** 房间生成：3 个普通房 + 1 个 Boss 房。 */
export function spawnRoom(
  state: WorldState,
  rng: Rng,
  floorId: string,
  roomIndex: number,
): void {
  const floor = floorById(floorId);
  const malice = state.malice;

  if (roomIndex >= 3) {
    // Boss 房：一个 Boss + 4 个小怪
    const boss = monsterById(floor.bossId);
    const bossLevel = 1 + malice * 0.1;
    state.monsters = [
      {
        uid: uid(),
        defId: boss.id,
        hp: Math.round(boss.hp * bossLevel),
        maxHp: Math.round(boss.hp * bossLevel),
        pos: spawnPos(rng, state.player.pos, boss.aggroRange),
        state: 0,
        attackCd: 0,
        dots: [],
        slow: 0,
        elite: false,
      },
      ...spawnMonsters(floor.monsterIds, 4, floor.itemLevel, malice, rng, 0.05, state.player.pos),
    ];
  } else {
    const count = Math.min(14, 6 + roomIndex * 3 + malice);
    state.monsters = spawnMonsters(
      floor.monsterIds,
      count,
      floor.itemLevel,
      malice,
      rng,
      0.12,
      state.player.pos,
    );
  }

  state.roomIndex = roomIndex;
  state.roomCleared = false;
}

/** 主循环：推进一个固定逻辑帧。返回本帧产生的事件。 */
export function stepWorld(state: WorldState, deps: WorldDeps): void {
  state.tick++;
  state.elapsed += TICK_SECONDS;
  const { rng } = deps;
  const p = state.player;

  const stats = playerStats(state, deps.equipped);
  p.maxHp = stats.hp;

  // ── 死亡与复活 ──────────────────────────────────────────
  if (!p.alive) {
    p.respawnIn -= TICK_SECONDS;
    if (p.respawnIn <= 0) {
      p.alive = true;
      p.hp = p.maxHp;
      p.pos = { ...PLAYER_HOME };
      // 复活后不自动重开：挂机已被打断，等玩家点「继续挂机」
      state.monsters = [];
      state.interrupted = true;
      pushLog(state, '你在城中醒来。挂机已中断 —— 点「继续挂机」才会重新开打。');
    }
    tickTimers(state);
    return;
  }

  // ── 撤退线 ──────────────────────────────────────────────
  if (state.controls.retreatAt > 0 && p.hp / p.maxHp < state.controls.retreatAt) {
    p.pos = moveToward(p.pos, PLAYER_HOME, 0.06);
  }

  // ── 自动补丹：有钱就补，按颗买 ────────────────────────────
  if (state.controls.autoBuyPotions && p.potions < WANTED_POTIONS) {
    buyPotion(state);
  }


  // ── 自动喝药（血量低于 40%）───────────────────────────────
  if (state.controls.autoPotion && p.hp / p.maxHp < 0.4 && p.potions > 0) {
    const heal = Math.round(p.maxHp * 0.35);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    p.potions--;
    float(state, `+${heal}`, 'heal', p.pos);
  }

  // ── 怪物的行动 ──────────────────────────────────────────
  for (const m of state.monsters) {
    const def = monsterById(m.defId);

    // 持续伤害
    for (const dot of m.dots) {
      m.hp -= dot.dps * TICK_SECONDS;
      dot.left -= TICK_SECONDS;
    }
    m.dots = m.dots.filter((d) => d.left > 0);
    if (m.slow > 0) m.slow -= TICK_SECONDS;

    if (m.hp <= 0) continue;

    const d = dist(m.pos, p.pos);
    if (d <= def.range) {
      m.state = 2;
      m.attackCd -= TICK_SECONDS;
      if (m.attackCd <= 0) {
        m.attackCd = def.attackInterval;
        const dmg = computeDamage(
          def.damage * (m.elite ? 1.5 : 1),
          1,
          stats.armor,
          0,
          floorById(state.floorId).armorK,
          false,
          0,
        );
        if (rng.chance(stats.dodge)) {
          float(state, '闪避', 'heal', p.pos);
        } else {
          const afterReduce = dmg * (1 - stats.damageReduce);
          p.hp -= afterReduce;
          float(state, `-${Math.round(afterReduce)}`, 'damage', p.pos);
          if (stats.thorns > 0) m.hp -= stats.thorns;
        }
      }
    } else if (d <= def.aggroRange) {
      m.state = 1;
      const speed = def.speed * (m.slow > 0 ? 0.4 : 1);
      m.pos = moveToward(m.pos, p.pos, speed);
    } else {
      m.state = 0;
    }
  }

  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.respawnIn = 3;
    pushLog(state, '你倒下了。装备没有丢失，但挂机被打断。');
    tickTimers(state);
    return;
  }

  // ── 玩家的攻击（自动）─────────────────────────────────────
  p.attackCd -= TICK_SECONDS;
  const nearest = nearestMonster(state, p.pos);
  if (nearest && p.attackCd <= 0) {
    p.attackCd = 1.1 / (1 + stats.attackSpeed);

    // 优先放主动技；没有主动技可放时，用当前武器的普攻 ——
    // 普攻的倍率也是数据里写好的（刀 1.15 / 剑 1.0），不是写死的 1。
    const skill = pickSkill(state, stats);
    const strike = skill ?? basicSkillFor(state.player.weaponKind);
    const power = strike ? strike.power : 1;
    const radius = strike ? strike.radius : 0;
    const targets = radius > 0 ? monstersInRadius(state, p.pos, radius) : [nearest];

    for (const m of targets) {
      const mDef = monsterById(m.defId);
      // 护甲是怪物定义上的独立字段，不由血量推算（见 ADR-0007）
      const armor = mDef.armor;
      const crit = rng.chance(stats.critRate);
      const dmg = computeDamage(
        stats.attack,
        power,
        armor,
        stats.armorPen,
        floorById(state.floorId).armorK,
        crit,
        stats.critDmg,
      );
      m.hp -= dmg;
      float(state, `${dmg}`, crit ? 'crit' : 'damage', m.pos);
      if (stats.lifesteal > 0) p.hp = Math.min(p.maxHp, p.hp + dmg * stats.lifesteal);
      applyElement(state, m, stats, rng);
    }

    if (skill && skill.selfEffect === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2);
    }
  }

  // ── 清理死亡、掉落、经验 ────────────────────────────────
  const survivors: Monster[] = [];
  for (const m of state.monsters) {
    if (m.hp > 0) {
      survivors.push(m);
      continue;
    }
    const def = monsterById(m.defId);
    deps.onKill(def, m.elite);

    // ── 掉落 ─────────────────────────────────────────────
    const dropRes = rollDrop(
      {
        monsterTier: m.elite ? 'elite' : def.tier === 'boss' ? 'boss' : 'normal',
        malice: state.malice,
        dropBonus: stats.dropRate,
      },
      rng,
    );
    if (dropRes.drop && dropRes.rarityRoll) {
      const isBoss = def.tier === 'boss';
      const howMany = isBoss ? 3 : m.elite ? rng.int(1, 2) : 1;
      for (let i = 0; i < howMany; i++) {
        // Boss 的 3 件里第一件**必定**是紫：这是规格 §三 的保底，
        // 也是「打完 Boss 有回报」的全部支点。以前只在掷到凡品/精良时才转紫，
        // 掷到稀有就照蓝掉，跨种子实测 3.7% 的 Boss 一件紫都没有 —— 保底必须是硬的。
        // 掷到传说时保留传说（比紫更好，不该被降级）。
        const rarity: Item['rarity'] = isBoss && i === 0
          ? (dropRes.rarityRoll === 'orange' ? 'orange' : 'purple')
          : dropRes.rarityRoll;
        const item = rollItem(
          {
            slot: randomSlot(rng),
            itemLevel: floorById(state.floorId).itemLevel,
            rarity,
            weaponKind: state.player.weaponKind,
          },
          rng,
        );
        // 自动拆解凡品：直接变矿，不占背包，也不占玩家的注意力
        if (state.controls.autoSalvageCommon && rarity === 'common') {
          const oreGain = salvageYield(rarity);
          state.player.ore += oreGain;
          float(state, `矿+${oreGain}`, 'loot', m.pos);
          continue;
        }
        deps.onLoot(item);
        state.loot.push({ uid: uid(), item, pos: { ...m.pos }, life: 3 });
        float(state, rarityLabel(rarity), 'loot', m.pos);
      }
      if (dropRes.fortune) {
        pushLog(state, '『财运』降临，本场掉落大增。');
      }
    }

    // 经验与金币
    const expGain = Math.round((6 + def.hp * 0.05) * (1 + stats.expBonus));
    const goldGain = Math.round((3 + def.hp * 0.02) * (1 + stats.goldFind));
    gainExp(state, expGain);
    p.gold += goldGain;
    if (def.tier === 'boss') {
      p.reforgeStones += rng.int(2, 4);
      // 残页只有硬仗给：Boss 必掉 2–4 张
      const pages = rng.int(2, 4);
      p.scrollPages += pages;
      float(state, `残页 +${pages}`, 'loot', m.pos);
    } else if (m.elite) {
      if (rng.chance(0.05)) p.reforgeStones += 1;
      // 精英 5% 掉 1 张残页 —— 刷小怪永远刷不出抽卡钱
      if (rng.chance(0.05)) {
        p.scrollPages += 1;
        float(state, '残页 +1', 'loot', m.pos);
      }
    }

    float(state, `+${goldGain}`, 'heal', m.pos);
  }
  state.monsters = survivors;

  // ── 清场：房间清空则推进，整层清空则自动再入 ──────────────
  if (state.interrupted) {
    tickTimers(state);
    return;
  }

  if (state.monsters.length === 0) {
    if (!state.roomCleared) {
      state.roomCleared = true;
      if (state.roomIndex < 3) {
        pushLog(state, `第 ${state.roomIndex + 1} 间已清。`);
      } else {
        state.bossDefeated = true;
        pushLog(state, '这一层已通，煞气 +1。');
      }
    }
    advanceAfterClear(state, rng);
  }

  tickTimers(state);
}

/** 空手时的起手武学。新档、脱掉武器都落在这里。 */
export const DEFAULT_WEAPON_KIND: WeaponKind = 'sword';

/**
 * 从身上的装备读出武器谱系。武器决定武学，所以这里是它唯一的来源 ——
 * 不要另立一个「玩家当前武器」的字段去跟装备抢话。
 */
export function weaponKindFromEquipped(
  equipped: Partial<Record<SlotId, Item>>,
): WeaponKind {
  const weapon = equipped.weapon;
  if (!weapon) return DEFAULT_WEAPON_KIND;
  const def = ITEM_DEF_BY_ID.get(weapon.defId);
  return def?.weaponKind ?? DEFAULT_WEAPON_KIND;
}

/**
 * 换武器。武学跟着走，所以冷却表也得跟着重置 ——
 * 不清的话，刀招会带着上个武器留下的冷却，换装那一刻像是「白换了」。
 * 换的是同一把武器就不动冷却，免得来回点同一件装备刷 CD。
 */
export function setWeaponKind(state: WorldState, kind: WeaponKind): void {
  if (state.player.weaponKind === kind) return;
  state.player.weaponKind = kind;
  state.player.cooldowns = {};
}

/** 升到下一级所需经验。 */
export function expToNext(level: number): number {
  return Math.round(60 * Math.pow(level, 1.55));
}

/** 结算经验并处理升级。等级只给固定属性，不给装备属性。 */
export function gainExp(state: WorldState, amount: number): void {
  state.player.exp += amount;
  let guard = 0;
  while (state.player.exp >= expToNext(state.player.level) && guard < 100) {
    guard++;
    state.player.exp -= expToNext(state.player.level);
    state.player.level++;
    pushLog(state, `升到 ${state.player.level} 级。`);
  }
}

/**
 * 清场后推进。这是挂机的「自动跑图」核心：
 * 第 1→2→3 间依次推进，Boss 房打完后自动再入本层（煞气 +1）。
 * 没有这段，挂机打到第一间就停住了 —— 这是最容易漏掉的一环。
 */
function advanceAfterClear(state: WorldState, rng: Rng): void {
  if (state.roomIndex < 3) {
    state.roomIndex++;
    spawnRoom(state, rng, state.floorId, state.roomIndex);
  } else {
    // Boss 房已清：自动再入，煞气封顶 10
    if (state.malice < 10) {
      state.malice++;
      spawnRoom(state, rng, state.floorId, 0);
      pushLog(state, `煞气 ${state.malice}：该层重刷，更强也更多好东西。`);
    } else {
      // 煞气到顶就不再自动加，原地重刷第 1 间
      spawnRoom(state, rng, state.floorId, 0);
    }
  }
  state.roomCleared = false;
  state.bossDefeated = false;
}

/** 掉落跳字的品质标签。 */
function rarityLabel(r: Item['rarity']): string {
  return { common: '凡品', green: '精良', blue: '稀有', purple: '史诗', orange: '传说' }[r];
}

function tickTimers(state: WorldState): void {
  for (const k of Object.keys(state.player.cooldowns)) {
    state.player.cooldowns[k] = Math.max(0, (state.player.cooldowns[k] ?? 0) - TICK_SECONDS);
  }

  for (const f of state.floating) {
    f.life -= TICK_SECONDS;
  }
  state.floating = state.floating.filter((f) => f.life > 0);

  for (const l of state.loot) l.life -= TICK_SECONDS;
  state.loot = state.loot.filter((l) => l.life > 0);

  if (state.fortuneTicks > 0) state.fortuneTicks--;
}

/**
 * 按优先级挑一个可用的主动技。冲突时先放优先级靠前的。
 *
 * 优先级表是玩家排的、可以跨武器留着，所以这里还要再按当前武器筛一遍：
 * 拿刀的人不该放出剑招。weaponKinds 为空的技能（如服丹）任何武器都能用。
 *
 * 表只是**顺序**偏好，不是白名单 —— 表里一条本武器的招都没有时（比如旧存档
 * 只记了剑招，人却换上了刀），照样把当前武器的主动技按槽位排下来接着试，
 * 否则换装那一刻人就变成只会站桩。
 */
export function pickSkill(state: WorldState, stats: Stats): SkillDef | null {
  if (!state.controls.autoSkills) return null;
  for (const def of castableSkills(state)) {
    if ((state.player.cooldowns[def.id] ?? 0) > 0) continue;
    state.player.cooldowns[def.id] = def.cooldown * (1 - stats.cooldownReduce);
    return def;
  }
  return null;
}

/**
 * 可以自动释放的主动技，按「玩家排的顺序，再接上没排到的」排好。
 *
 * 关键点：**按槽位装配**，每槽只出一招。这是「二选一」的另一半 ——
 * 只做渲染层的二选一、这里仍把同槽两招都放出来，玩家就会发现
 * 穿云式在连星贯日冷却时顶上来，等于白捡一个按钮。
 *
 * 过滤链：
 * 1. equippedSkillBar 决定每槽装配了哪招（含秘籍招是否已习得）。
 * 2. 只取伤害型主动技（1、2 槽）；位移/保命/普攻不走这条路。
 */
function castableSkills(state: WorldState): SkillDef[] {
  const kind = state.player.weaponKind;
  const bar = equippedSkillBar(
    kind,
    allLearnedSkillIds(state.manual),
    state.controls.skillPriority,
  ).filter((d) => d.slot === 1 || d.slot === 2);

  const out: SkillDef[] = [];
  const seen = new Set<string>();

  // 先按玩家排的优先级，再补上没排到的
  for (const id of state.controls.skillPriority) {
    if (seen.has(id)) continue;
    const def = bar.find((b) => b.id === id);
    if (!def) continue;
    if (!skillUnlockedByManual(def, state.manual)) continue;
    seen.add(id);
    out.push(def);
  }
  for (const def of bar) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    out.push(def);
  }

  return out;
}

function applyElement(
  state: WorldState,
  m: Monster,
  stats: Stats,
  rng: Rng,
): void {
  void rng;
  const levelScale = 1 + m.maxHp / 2000;
  if (stats.burn > 0 && rng.chance(0.25)) {
    m.dots.push({ element: 'burn', dps: stats.burn * levelScale, left: 4 });
  }
  if (stats.poison > 0 && rng.chance(0.25)) {
    m.dots.push({ element: 'poison', dps: stats.poison * levelScale, left: 6 });
  }
  if (stats.freeze > 0 && rng.chance(0.2)) {
    m.slow = Math.max(m.slow, 1.5);
  }
  void state;
}

function nearestMonster(state: WorldState, from: Vec2): Monster | null {
  let best: Monster | null = null;
  let bestD = Infinity;
  for (const m of state.monsters) {
    if (m.hp <= 0) continue;
    const d = dist(m.pos, from);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

function monstersInRadius(state: WorldState, from: Vec2, radius: number): Monster[] {
  return state.monsters.filter((m) => m.hp > 0 && dist(m.pos, from) <= radius);
}

function float(
  state: WorldState,
  text: string,
  kind: FloatingText['kind'],
  pos: Vec2,
): void {
  // 跳字上限，避免同屏怪物多时爆内存
  if (state.floating.length > 80) return;
  state.floating.push({ uid: uid(), text, kind, pos: { ...pos }, life: 0.8 });
}

function pushLog(state: WorldState, text: string): void {
  state.log.push({ t: state.elapsed, text });
  if (state.log.length > 60) state.log.shift();
}

/**
 * 丹药标价。
 *
 * 标定口径：第一层挂机 30 分钟的金币收入约 1400–1700（每杀一只 3–6 金）。
 * 药价要让「药钱吃掉收入的一大块，但补得起」——吃不起就没法挂，白送就没压力。
 * 实测 6 颗/分钟的上限下，30 分钟大约要补 25–35 颗，取 40 金一颗约花 1000–1400，
 * 刚好把刷怪收入吃掉大半：ADR-0005 想要的「药钱压力」在，但不是死局。
 */
export const POTION_PRICE = 40;

/** 丹囊上限：一次最多带这么多颗。 */
export const WANTED_POTIONS = 10;

/**
 * 补丹：按「能买几颗就买几颗」把丹囊补到上限。
 *
 * 一次买满是个陷阱：丹囊见底时手上往往正好没那么多钱，于是永远补不上、
 * 一直喝到 0 再连续死亡。所以这里逐颗买 —— 有多少钱先补多少颗，
 * 挂机自然会把丹囊维持在能吃几口药的水平。
 *
 * ADR-0005 说的「药钱会烧光」依然成立：花的是真金白银，钱不够就真的补不上。
 */
export function buyPotion(state: WorldState): { ok: boolean; bought: number; reason?: string } {
  const p = state.player;
  const missing = WANTED_POTIONS - p.potions;
  if (missing <= 0) return { ok: false, bought: 0, reason: `丹囊已经满了（${WANTED_POTIONS} 颗）` };

  const affordable = Math.min(missing, Math.floor(p.gold / POTION_PRICE));
  if (affordable <= 0) {
    return { ok: false, bought: 0, reason: `金币不足（一颗要 ${POTION_PRICE}）` };
  }

  const cost = affordable * POTION_PRICE;
  p.gold -= cost;
  p.potions += affordable;
  pushLog(state, `补丹 ${affordable} 颗，花 ${cost} 金。`);
  return { ok: true, bought: affordable };
}

/** 再入本层：煞气 +1，重新刷怪。 */
export function reenterFloor(state: WorldState, rng: Rng): void {
  state.malice = Math.min(10, state.malice + 1);
  state.bossDefeated = false;
  spawnRoom(state, rng, state.floorId, 0);
  pushLog(state, `煞气提升至 ${state.malice}。怪物更强，好东西也更多。`);
}

/** 继续挂机：死亡被打断后由玩家手动恢复。 */
export function resumeFarming(state: WorldState, rng: Rng): void {
  if (!state.interrupted) return;
  state.interrupted = false;
  if (state.player.alive) {
    spawnRoom(state, rng, state.floorId, 0);
    pushLog(state, '重新开打。');
  }
}

/** 换层。 */
export function changeFloor(state: WorldState, rng: Rng, floorId: string): void {
  state.floorId = floorId;
  state.malice = 0;
  state.bossDefeated = false;
  spawnRoom(state, rng, floorId, 0);
  pushLog(state, `进入 ${floorById(floorId).name}。`);
}

/** 离线收益：只给经验、金币、材料，绝不给装备。上限 8 小时。 */
export const OFFLINE_CAP_HOURS = 8;

export function computeOfflineReward(
  hoursAway: number,
  level: number,
  killRatePerMinute: number,
): { exp: number; gold: number; ore: number; capped: number } {
  const capped = Math.min(hoursAway, OFFLINE_CAP_HOURS);
  const minutes = capped * 60;
  const kills = minutes * killRatePerMinute;
  return {
    exp: Math.round(kills * (6 + level * 2)),
    gold: Math.round(kills * 3),
    ore: Math.round(kills * 0.1),
    capped,
  };
}

/** 用于离线奖励估算的默认击杀速度（挂机时每分钟约 12 只）。 */
export const DEFAULT_KILL_RATE = 12;

/** 重新计算生命上限并保留当前血量比率（换装时用）。 */
export function applyEquipmentChange(state: WorldState, equipped: Partial<Record<SlotId, Item>>): void {
  const ratio = state.player.maxHp > 0 ? state.player.hp / state.player.maxHp : 1;
  const s = playerStats(state, equipped);
  state.player.maxHp = s.hp;
  state.player.hp = Math.round(s.hp * ratio);
}

/** 距离函数导出给渲染层做朝向计算。 */
export { dist as distanceBetween };

/** 一次伤害的可见范围校验：确保除法公式永远不为 0。 */
export function damageNeverZero(armor: number, k: number): number {
  return mitigation(armor, 0, k);
}
