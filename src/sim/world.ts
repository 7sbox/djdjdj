import type { MonsterDef, SkillDef, WeaponKind } from '../types';
import { floorById, monsterById, skillById } from '../data/combat-defs';
import type { Rng } from './rng';
import { clampStats, combineStats, computeDamage, levelStats, mitigation, statsFromEquipment } from './stats';
import type { Stats } from './stats';
import { ITEM_DEF_BY_ID } from '../data/items';
import { randomSlot, rollDrop, rollItem } from './loot';
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

/** 三个手动开关（Q9）。 */
export interface PlayerControls {
  /** 自动喝药：血量低于 40% 时自动服丹。关掉就完全不喝。 */
  autoPotion: boolean;
  /** 自动释放主动技。关掉只普攻。 */
  autoSkills: boolean;
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
    /** 技能的冷却剩余（按技能 id）。 */
    cooldowns: Record<string, number>;
    weaponKind: WeaponKind;
    attackCd: number;
    alive: boolean;
    respawnIn: number;
  };

  controls: PlayerControls;

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
      // 优先级表按槽位排，跨武器留着；真正的武器过滤在 pickSkill 里做
      skillPriority: ['sk_sword_swirl', 'sk_sword_pierce', 'sk_blade_cleave', 'sk_blade_sunder', 'sk_sword_step', 'sk_blade_guard'],
      retreatAt: 0,
    },
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

/** 从怪物池里抽一只。精英概率 12%。 */
function spawnMonsters(
  defIds: readonly string[],
  count: number,
  floorItemLevel: number,
  malice: number,
  rng: Rng,
  eliteChance: number,
): Monster[] {
  const out: Monster[] = [];
  const levelScale = 1 + malice * 0.1;
  for (let i = 0; i < count; i++) {
    const def = monsterById(rng.pick(defIds));
    const elite = def.tier === 'normal' && rng.chance(eliteChance);
    const hpScale = levelScale * (elite ? 3 : 1);
    const angle = rng.next() * Math.PI * 2;
    const radius = 9 + rng.next() * 5;
    out.push({
      uid: uid(),
      defId: def.id,
      hp: Math.round(def.hp * hpScale * (1 + floorItemLevel * 0.08)),
      maxHp: Math.round(def.hp * hpScale * (1 + floorItemLevel * 0.08)),
      pos: {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      },
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
        pos: { x: 0, z: -6 },
        state: 0,
        attackCd: 0,
        dots: [],
        slow: 0,
        elite: false,
      },
      ...spawnMonsters(floor.monsterIds, 4, floor.itemLevel, malice, rng, 0.05),
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

    // 优先放主动技
    const skill = pickSkill(state, stats);
    const power = skill ? skill.power : 1;
    const radius = skill ? skill.radius : 0;
    const targets = radius > 0 ? monstersInRadius(state, p.pos, radius) : [nearest];

    for (const m of targets) {
      const mDef = monsterById(m.defId);
      const armor = mDef.attackForm === 'melee' ? 10 + mDef.hp * 0.02 : 5 + mDef.hp * 0.01;
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
      const howMany = def.tier === 'boss' ? 3 : m.elite ? rng.int(1, 2) : 1;
      for (let i = 0; i < howMany; i++) {
        const rarity = i === 0 && def.tier === 'boss'
          ? (dropRes.rarityRoll === 'common' || dropRes.rarityRoll === 'green'
              ? 'purple'
              : dropRes.rarityRoll)
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
    if (def.tier === 'boss') p.reforgeStones += rng.int(2, 4);
    else if (m.elite && rng.chance(0.05)) p.reforgeStones += 1;

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
 * 从身上的装备读出武器种类。武器决定武学，所以这是唯一的真相来源 ——
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
 */
export function pickSkill(state: WorldState, stats: Stats): SkillDef | null {
  if (!state.controls.autoSkills) return null;
  for (const id of state.controls.skillPriority) {
    if ((state.player.cooldowns[id] ?? 0) > 0) continue;
    const def = skillById(id);
    if (!skillFitsWeapon(def, state.player.weaponKind)) continue;
    // 只有伤害型主动技走这里；位移与保命由各自开关处理
    if (def.slot === 0 || def.selfEffect === 'dash' || def.selfEffect === 'shield') continue;
    state.player.cooldowns[id] = def.cooldown * (1 - stats.cooldownReduce);
    return def;
  }
  return null;
}

/** 这个技能能不能被当前武器使用。空 weaponKinds 表示通用。 */
function skillFitsWeapon(def: SkillDef, kind: WeaponKind): boolean {
  return def.weaponKinds.length === 0 || def.weaponKinds.includes(kind);
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
