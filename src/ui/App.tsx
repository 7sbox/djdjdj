import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Item, SlotId } from '../types';
import { FLOORS, floorById, skillById } from '../data/combat-defs';
import { ITEM_DEFS, RARITY_NAMES } from '../data/items';
import { createRng, type Rng } from '../sim/rng';
import { rollItem } from '../sim/loot';
import {
  DEFAULT_KILL_RATE,
  POTION_PRICE,
  TICK_SECONDS,
  buyPotion,
  changeFloor,
  computeOfflineReward,
  createWorld,
  playerStats,
  reenterFloor,
  resumeFarming,
  stepWorld,
  type WorldState,
} from '../sim/world';
import {
  reforgeAffix,
  salvageYieldOf,
  synthItems,
  upgradeCost,
  upgradeItem,
} from '../sim/equip-ops';
import { loadGame, newSave, saveGame, type SaveData } from '../storage/save';
import { SceneView } from '../render/scene';
import { CSS } from './styles';
import { BagPage, CharacterPage, SmithPage } from './pages';
import { itemName, statSummary } from './format';

const EXP_TABLE = (level: number) => Math.round(40 * Math.pow(level, 1.6));

type Tab = 'battle' | 'bag' | 'smith' | 'char';

const ALL_SLOTS: readonly (SlotId | 'ring')[] = [
  'head', 'chest', 'hands', 'waist', 'feet', 'weapon', 'ring',
];

export function App() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);

  const [tab, setTab] = useState<Tab>('battle');
  const [inventory, setInventory] = useState<Item[]>([]);
  const [equipped, setEquipped] = useState<Partial<Record<SlotId, Item>>>({});
  const [selected, setSelected] = useState<Item | null>(null);
  const [selectedAffix, setSelectedAffix] = useState<number | null>(null);
  const [hover, setHover] = useState<{ item: Item | null; x: number; y: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  // 与渲染无关、变化极快的状态放 ref，避免每帧 setState
  const worldRef = useRef<WorldState | null>(null);
  const seedRef = useRef(Math.floor(Math.random() * 1e9));
  const equippedRef = useRef<Partial<Record<SlotId, Item>>>({});
  const inventoryRef = useRef<Item[]>([]);
  const rngRef = useRef<Rng | null>(null);

  equippedRef.current = equipped;
  inventoryRef.current = inventory;

  // ── 初始化：读档或新档 ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const saved = await loadGame();
      const seed = saved?.seed ?? seedRef.current;
      const rng = createRng(seed);
      rngRef.current = rng;
      seedRef.current = seed;
      const gear = (saved?.equipped ?? {}) as Partial<Record<SlotId, Item>>;

      if (cancelled) return;

      setEquipped(gear);
      equippedRef.current = gear;
      setInventory(saved?.inventory ?? []);
      inventoryRef.current = saved?.inventory ?? [];

      if (saved) {
        // 离线结算：只给成长资源，绝不给装备
        const hoursAway = (Date.now() - saved.lastSeen) / 3_600_000;
        const reward = computeOfflineReward(hoursAway, saved.player.level, DEFAULT_KILL_RATE);
        if (reward.capped > 0.05) {
          setOfflineNote(
            `离线 ${reward.capped.toFixed(1)} 小时：经验 +${reward.exp}、金币 +${reward.gold}、强化矿 +${reward.ore}。装备得自己刷。`,
          );
        }
      }

      const world = createWorld({
        rng,
        floorId: saved?.floorId ?? 'f1',
        equipped: gear,
        malice: saved?.malice ?? 0,
      });

      if (saved) {
        world.player.level = saved.player.level;
        world.player.exp = saved.player.exp;
        world.player.gold = saved.player.gold;
        world.player.ore = saved.player.ore;
        world.player.reforgeStones = saved.player.reforgeStones;
        world.player.potions = saved.player.potions;
        world.player.weaponKind = saved.player.weaponKind;
        world.controls = {
          ...world.controls,
          ...saved.controls,
          autoSalvageCommon: saved.controls.autoSalvageCommon ?? false,
          autoBuyPotions: saved.controls.autoBuyPotions ?? true,
          retreatAt: saved.controls.retreatAt ?? 0,
        };
        const s = playerStats(world, gear);
        world.player.maxHp = s.hp;
        world.player.hp = Math.min(saved.player.hp, s.hp);
      }
      worldRef.current = world;
      forceTick((t) => t + 1);
    })();

    return () => { cancelled = true; };
  }, []);

  // ── 渲染层 ───────────────────────────────────────────────
  useEffect(() => {
    if (!viewportRef.current) return;
    const view = new SceneView(viewportRef.current);
    viewRef.current = view;

    const onResize = () => view.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  // ── 主循环：0.2 秒固定逻辑帧，渲染插值 ────────────────────
  useEffect(() => {
    let raf = 0;
    let acc = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;

      const world = worldRef.current;
      const rng = rngRef.current;
      if (!world || !rng) return;

      while (acc >= TICK_SECONDS) {
        acc -= TICK_SECONDS;
        stepWorld(world, {
          rng,
          equipped: equippedRef.current,
          onLoot: (item) => {
            // 背包上限，防止长挂后爆内存
            let inv = inventoryRef.current;
            if (inv.length >= 80) inv = inv.slice(-75);
            inv = [...inv, item];
            inventoryRef.current = inv;
            setInventory(inv);
          },
          onKill: () => {},
        });
      }

      viewRef.current?.sync(world, dt);
      viewRef.current?.render();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── UI 刷新（低频率，避免每帧重渲染）────────────────────
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  const persist = useCallback(async () => {
    const world = worldRef.current;
    if (!world) return;
    const data: SaveData = {
      ...newSave(seedRef.current),
      savedAt: Date.now(),
      seed: seedRef.current,
      player: {
        level: world.player.level,
        exp: world.player.exp,
        hp: world.player.hp,
        gold: world.player.gold,
        ore: world.player.ore,
        reforgeStones: world.player.reforgeStones,
        potions: world.player.potions,
        weaponKind: world.player.weaponKind,
      },
      equipped: equippedRef.current as Record<string, Item>,
      inventory: inventoryRef.current,
      floorId: world.floorId,
      malice: world.malice,
      controls: world.controls,
      lastSeen: Date.now(),
    };
    await saveGame(data);
  }, []);

  // 自动存档（5 分钟）
  useEffect(() => {
    const id = setInterval(() => { void persist(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [persist]);

  // ── 操作 ────────────────────────────────────────────────
  const equipItem = (item: Item) => {
    const world = worldRef.current;
    const prev = equippedRef.current[item.slot];
    const next = { ...equippedRef.current, [item.slot]: item };
    setEquipped(next);
    equippedRef.current = next;

    // 从背包里移走，把换下来的塞回背包
    const inv = inventoryRef.current.filter((i) => i.id !== item.id);
    if (prev) inv.push(prev);
    setInventory(inv);
    inventoryRef.current = inv;
    setSelected(null);

    if (world) {
      const s = playerStats(world, next);
      world.player.maxHp = s.hp;
      world.player.hp = Math.min(world.player.hp, s.hp);
      if (item.defId.includes('blade')) world.player.weaponKind = 'blade';
      else if (item.defId.includes('sword')) world.player.weaponKind = 'sword';
    }
    setMessage(`已装备 ${itemName(item)}`);
  };

  const salvage = (item: Item) => {
    const world = worldRef.current;
    const gain = salvageYieldOf(item.rarity);
    const inv = inventoryRef.current.filter((i) => i.id !== item.id);
    setInventory(inv);
    inventoryRef.current = inv;
    if (world) world.player.ore += gain;
    setMessage(`拆解得强化矿 ${gain}。`);
    setSelected(null);
  };

  const salvageAllCommon = () => {
    const world = worldRef.current;
    const commons = inventoryRef.current.filter((i) => i.rarity === 'common');
    if (commons.length === 0) { setMessage('没有凡品可拆。'); return; }
    const gain = commons.reduce((a, i) => a + salvageYieldOf(i.rarity), 0);
    const inv = inventoryRef.current.filter((i) => i.rarity !== 'common');
    setInventory(inv);
    inventoryRef.current = inv;
    if (world) world.player.ore += gain;
    setMessage(`拆解 ${commons.length} 件凡品，得强化矿 ${gain}。`);
  };

  const replaceItem = (updated: Item) => {
    if (equippedRef.current[updated.slot]?.id === updated.id) {
      const next = { ...equippedRef.current, [updated.slot]: updated };
      setEquipped(next);
      equippedRef.current = next;
    } else {
      const inv = inventoryRef.current.map((i) => (i.id === updated.id ? updated : i));
      setInventory(inv);
      inventoryRef.current = inv;
    }
    setSelected(updated);
  };

  const doUpgrade = () => {
    const world = worldRef.current;
    if (!world || !selected) return;
    const res = upgradeItem(selected, {
      gold: world.player.gold,
      ore: world.player.ore,
      reforgeStones: world.player.reforgeStones,
    });
    if (!res.ok) { setMessage(res.reason); return; }
    world.player.gold = res.value.wallet.gold;
    world.player.ore = res.value.wallet.ore;
    replaceItem(res.value.item);
    setMessage(`强化成功 +${res.value.item.upgrade}（必成，不掉级）`);
  };

  const doReforge = (affixIndex: number) => {
    const world = worldRef.current;
    const rng = rngRef.current;
    if (!world || !selected || !rng) return;
    const res = reforgeAffix(
      selected,
      affixIndex,
      { gold: world.player.gold, ore: world.player.ore, reforgeStones: world.player.reforgeStones },
      rng,
      ALL_SLOTS,
    );
    if (!res.ok) { setMessage(res.reason); return; }
    world.player.reforgeStones = res.value.wallet.reforgeStones;
    replaceItem(res.value.item);
    setMessage('重铸完成，只换了那一条。');
  };

  const synthCandidates = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const it of inventory) {
      if (it.rarity === 'orange') continue;
      const slot = it.slot === 'ring1' || it.slot === 'ring2' ? 'ring' : it.slot;
      const key = `${slot}:${it.rarity}`;
      const arr = groups.get(key) ?? [];
      arr.push(it);
      groups.set(key, arr);
    }
    const best = [...groups.values()].find((g) => g.length >= 3) ?? [];
    return best.slice(0, 3);
  }, [inventory]);

  const doSynth = () => {
    const world = worldRef.current;
    const rng = rngRef.current;
    if (!world || !rng || synthCandidates.length !== 3) {
      setMessage('凑不齐 3 件同部位同品质。');
      return;
    }
    const res = synthItems(synthCandidates, (slot, rarity, itemLevel) =>
      rollItem({ slot, rarity, itemLevel, weaponKind: world.player.weaponKind }, rng),
    );
    if (!res.ok) { setMessage(res.reason); return; }

    const used = new Set(synthCandidates.map((i) => i.id));
    const inv = [...inventoryRef.current.filter((i) => !used.has(i.id)), res.value.item];
    setInventory(inv);
    inventoryRef.current = inv;
    setMessage(`合成出 ${itemName(res.value.item)}。`);
  };

  const world = worldRef.current;
  const stats = world ? playerStats(world, equipped) : null;
  const summary = stats ? statSummary(stats) : [];

  const onHover = useCallback((item: Item | null, e: MouseEvent) => {
    if (!item) { setHover(null); return; }
    setHover({ item, x: e.clientX, y: e.clientY });
  }, []);

  const hpRatio = world ? Math.max(0, world.player.hp / Math.max(1, world.player.maxHp)) : 1;
  const expToNext = world ? EXP_TABLE(world.player.level) : 1;
  const expRatio = world ? Math.min(1, world.player.exp / expToNext) : 0;

  return (
    <>
      <style>{CSS}</style>
      <div class="app">
        <div class="topbar">
          <span class="brand">地 宫</span>
          <span class="stat">{world ? floorById(world.floorId).name : '—'}</span>
          <span class="stat">煞气 <b class="num">{world?.malice ?? 0}</b></span>
          <span class="stat">金 <b class="num">{world?.player.gold ?? 0}</b></span>
          <span class="stat">矿 <b class="num">{world?.player.ore ?? 0}</b></span>
          <span class="stat">石 <b class="num">{world?.player.reforgeStones ?? 0}</b></span>
          <span class="stat">丹 <b class="num">{world?.player.potions ?? 0}</b></span>
          <button
            class="btn"
            onClick={() => {
              const w = worldRef.current;
              if (!w) return;
              const res = buyPotion(w);
              forceTick((t) => t + 1);
              setMessage(res.ok ? `补丹 ${res.bought} 颗。` : (res.reason ?? '补不了'));
            }}
          >
            补丹 {POTION_PRICE}金
          </button>
          <span class="spacer" />
          <button class="btn" onClick={() => void persist().then(() => setMessage('已存档。'))}>
            存档
          </button>
        </div>

        <div class="body">
          <div class="viewport" ref={viewportRef}>
            <div class="hud">
              <div class="bar hp">
                <i style={`width:${(hpRatio * 100).toFixed(1)}%`} />
                <div class="label num">
                  {Math.round(world?.player.hp ?? 0)} / {Math.round(world?.player.maxHp ?? 0)}
                </div>
              </div>
              <div class="bar exp" style="margin-top:4px">
                <i style={`width:${(expRatio * 100).toFixed(1)}%`} />
              </div>
              <div class="skills">
                {['sk_sword_basic', 'sk_sword_swirl', 'sk_sword_pierce', 'sk_sword_step'].map((id) => {
                  const def = skillById(id);
                  const cd = world?.player.cooldowns[id] ?? 0;
                  return (
                    <div class={`slot ${cd <= 0 ? 'ready' : ''}`}>
                      {def.name.slice(0, 2)}
                      {cd > 0 ? <div class="cd num">{cd.toFixed(1)}</div> : null}
                    </div>
                  );
                })}
              </div>
              <div class="toggles">
                <div
                  class={`tg ${world?.controls.autoPotion ? 'on' : ''}`}
                  onClick={() => {
                    const w = worldRef.current;
                    if (!w) return;
                    w.controls.autoPotion = !w.controls.autoPotion;
                    forceTick((t) => t + 1);
                  }}
                >
                  自动服丹
                </div>
                <div
                  class={`tg ${world?.controls.autoSkills ? 'on' : ''}`}
                  onClick={() => {
                    const w = worldRef.current;
                    if (!w) return;
                    w.controls.autoSkills = !w.controls.autoSkills;
                    forceTick((t) => t + 1);
                  }}
                >
                  自动武学
                </div>
                <div
                  class={`tg ${world?.controls.autoBuyPotions ? 'on' : ''}`}
                  onClick={() => {
                    const w = worldRef.current;
                    if (!w) return;
                    w.controls.autoBuyPotions = !w.controls.autoBuyPotions;
                    forceTick((t) => t + 1);
                  }}
                >
                  自动补丹
                </div>
                <div
                  class={`tg ${world?.controls.autoSalvageCommon ? 'on' : ''}`}
                  onClick={() => {
                    const w = worldRef.current;
                    if (!w) return;
                    w.controls.autoSalvageCommon = !w.controls.autoSalvageCommon;
                    forceTick((t) => t + 1);
                  }}
                >
                  自动拆凡品
                </div>
                {world?.interrupted ? (
                  <div
                    class="tg"
                    style="border-color:#7a2b28;color:#d2564f"
                    onClick={() => {
                      const w = worldRef.current;
                      const rng = rngRef.current;
                      if (!w || !rng) return;
                      resumeFarming(w, rng);
                      forceTick((t) => t + 1);
                    }}
                  >
                    已中断 · 继续挂机
                  </div>
                ) : null}
                <div
                  class="tg"
                  onClick={() => {
                    const w = worldRef.current;
                    const rng = rngRef.current;
                    if (!w || !rng) return;
                    reenterFloor(w, rng);
                    setMessage(`煞气 ${w.malice}，该层重刷。`);
                  }}
                >
                  再入本层
                </div>
                <div
                  class="tg"
                  onClick={() => {
                    const w = worldRef.current;
                    const rng = rngRef.current;
                    if (!w || !rng) return;
                    const idx = FLOORS.findIndex((f) => f.id === w.floorId);
                    const nxt = FLOORS[(idx + 1) % FLOORS.length];
                    if (!nxt) return;
                    changeFloor(w, rng, nxt.id);
                    setMessage(`进入 ${nxt.name}`);
                  }}
                >
                  下一层
                </div>
              </div>
            </div>
          </div>

          <aside class="panel">
            <div class="tabs">
              {([
                ['battle', '战斗'],
                ['bag', '背包'],
                ['smith', '铁匠'],
                ['char', '角色'],
              ] as const).map(([id, label]) => (
                <div class={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</div>
              ))}
            </div>

            {offlineNote && (
              <div style="padding:8px 10px;border-bottom:1px solid #2a3038;font-size:11.5px;color:#d8b46a">
                {offlineNote}
                <span
                  style="color:#4d5661;cursor:pointer;margin-left:6px"
                  onClick={() => setOfflineNote(null)}
                >
                  知道了
                </span>
              </div>
            )}

            {message && tab === 'smith' && (
              <div class="note" style="padding:6px 10px;border-bottom:1px solid #2a3038">{message}</div>
            )}

            {tab === 'battle' && (
              <div class="pane">
                <h4>战斗记录</h4>
                <div class="log">
                  {(world?.log ?? []).slice(-16).reverse().map((l) => <div>{l.text}</div>)}
                </div>
                <h4>本层</h4>
                <div class="kv"><span>装备等级</span><span>{world ? floorById(world.floorId).itemLevel : '—'}</span></div>
                <div class="kv"><span>房间</span><span>{world ? `${Math.min(world.roomIndex + 1, 4)} / 4` : '—'}</span></div>
                <div class="kv"><span>怪物数</span><span class="num">{world?.monsters.length ?? 0}</span></div>
                <div class="note" style="margin-top:8px">
                  人物自己打。你能改的只有五件事：吃不吃药、武学自动放不放、药要不要自动补、凡品要不要自动拆、要不要再入挖矿。
                </div>
              </div>
            )}

            {tab === 'bag' && (
              <BagPage
                inventory={inventory}
                equipped={equipped}
                hover={hover}
                onHover={onHover}
                onEquip={equipItem}
                onSalvage={salvage}
                onSalvageAllCommon={salvageAllCommon}
                selected={selected}
                onSelect={(it) => { setSelected(it); setSelectedAffix(null); }}
              />
            )}

            {tab === 'smith' && (
              <SmithPage
                inventory={inventory}
                equipped={equipped}
                selected={selected}
                onSelect={(it) => { setSelected(it); setSelectedAffix(0); }}
                onUpgrade={doUpgrade}
                onReforge={doReforge}
                onSynth={doSynth}
                onSalvage={() => { if (selected) salvage(selected); }}
                wallet={{
                  gold: world?.player.gold ?? 0,
                  ore: world?.player.ore ?? 0,
                  reforgeStones: world?.player.reforgeStones ?? 0,
                }}
                synthCandidates={synthCandidates}
                canSynth={synthCandidates.length === 3}
                selectedAffix={selectedAffix}
                onSelectAffix={setSelectedAffix}
                message={message}
                hwCost={upgradeCost(selected?.upgrade ?? 0)}
              />
            )}

            {tab === 'char' && (
              <CharacterPage
                equipped={equipped}
                stats={summary}
                level={world?.player.level ?? 1}
                exp={world?.player.exp ?? 0}
                expToNext={expToNext}
                killLog={world?.log ?? []}
              />
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

void ITEM_DEFS;
void RARITY_NAMES;
