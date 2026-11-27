import type { Item, SlotId, WeaponKind } from '../types';
import { WEAPON_BY_KIND } from '../data/items';
import { skillsForWeapon } from '../data/skills';
import { HoverCard, ItemCard, ItemRow, SlotGrid } from './ItemCard';

export interface BagProps {
  inventory: Item[];
  equipped: Partial<Record<SlotId, Item>>;
  hover: { item: Item | null; x: number; y: number } | null;
  onHover: (item: Item | null, e: MouseEvent) => void;
  onEquip: (item: Item) => void;
  onSalvage: (item: Item) => void;
  onSalvageAllCommon: () => void;
  selected: Item | null;
  onSelect: (item: Item | null) => void;
}

/** 背包页：8 部位 + 列表 + 悬停对比。 */
export function BagPage(props: BagProps) {
  const { inventory, equipped, hover, onHover, onEquip, onSalvage, onSalvageAllCommon, selected, onSelect } = props;

  const equippedOf = (item: Item): Item | undefined => equipped[item.slot];

  return (
    <div class="pane">
      <h4>已装备</h4>
      <SlotGrid equipped={equipped} onHover={onHover} />

      <h4>
        背包 <span style="color:#4d5661;font-weight:400">（{inventory.length}）</span>
      </h4>

      {inventory.length === 0 ? (
        <div class="empty">还没有掉落。打一轮就有了。</div>
      ) : (
        <>
          <div class="btnrow" style="margin-bottom:6px">
            <button class="btn" onClick={onSalvageAllCommon}>一键拆解凡品</button>
          </div>
          <div class="list">
            {inventory.map((it) => (
              <div
                onMouseEnter={(e) => onHover(it, e)}
                onMouseMove={(e) => onHover(it, e)}
                onMouseLeave={() => onHover(null, new MouseEvent('mouseleave'))}
              >
                <ItemRow
                  item={it}
                  active={selected?.id === it.id}
                  onClick={() => onSelect(it)}
                  extra={it.upgrade > 0 ? `+${it.upgrade}` : undefined}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {selected ? (
        <>
          <h4>选中</h4>
          <ItemCard
            item={selected}
            equipped={equippedOf(selected)}
            onEquip={() => onEquip(selected)}
            onSalvage={() => { onSalvage(selected); onSelect(null); }}
          />
        </>
      ) : null}

      {hover?.item ? (
        <HoverCard x={hover.x} y={hover.y}>
          <ItemCard item={hover.item} equipped={equippedOf(hover.item)} />
        </HoverCard>
      ) : null}
    </div>
  );
}

/** 铁匠页：强化 / 重铸 / 合成 / 拆解 四个页签合一。 */
export function SmithPage(props: {
  inventory: Item[];
  equipped: Partial<Record<SlotId, Item>>;
  selected: Item | null;
  onSelect: (item: Item | null) => void;
  onUpgrade: () => void;
  onReforge: (affixIndex: number) => void;
  onSynth: () => void;
  onSalvage: () => void;
  wallet: { gold: number; ore: number; reforgeStones: number };
  synthCandidates: Item[];
  canSynth: boolean;
  selectedAffix: number | null;
  onSelectAffix: (i: number | null) => void;
  message: string | null;
  hwCost: { ore: number; gold: number };
}) {
  const { inventory, equipped, selected, onSelect, wallet, message } = props;

  return (
    <div class="pane">
      {message ? (
        <div class="detail" style="border-color:#6b5a2b;margin:0 0 8px">{message}</div>
      ) : null}

      <h4>强化（必成，不降级，+9 封顶）</h4>

      {selected ? (
        <>
          <ItemCard
            item={selected}
            equipped={equipped[selected.slot]}
            onSelectAffix={props.onSelectAffix}
            selectedAffix={props.selectedAffix}
          />
          <div class="btnrow" style="margin-top:8px">
            <button
              class="btn primary"
              onClick={props.onUpgrade}
              disabled={selected.upgrade >= 9 || wallet.ore < props.hwCost.ore || wallet.gold < props.hwCost.gold}
            >
              强化到 +{selected.upgrade + 1}
              <span style="color:#8b95a5;margin-left:6px;font-size:11px">
                矿 {props.hwCost.ore} / 金 {props.hwCost.gold}
              </span>
            </button>
            <button
              class="btn"
              onClick={() => props.onReforge(props.selectedAffix ?? 0)}
              disabled={selected.affixes.length === 0 || wallet.reforgeStones < 1}
            >
              重铸所选词条
              <span style="color:#8b95a5;margin-left:6px;font-size:11px">石 {wallet.reforgeStones}</span>
            </button>
            <button class="btn danger" onClick={props.onSalvage}>拆解</button>
          </div>
          <div class="note" style="margin-top:4px">
            重铸只换你点中的那一条，其他属性不动。点上面词条可以选。
          </div>
        </>
      ) : (
        <div class="empty">从下面列表或背包里选一件</div>
      )}

      <h4>合成（3 件同部位同品质 → 1 件高一档）</h4>
      <div class="note" style="margin-bottom:6px">
        新装备的词条重新随机，强化等级取三件里最高的那件。
      </div>
      <div class="btnrow">
        <button class="btn primary" onClick={props.onSynth} disabled={!props.canSynth}>
          合成符合条件的 3 件
        </button>
        <span class="note">
          可用：{props.synthCandidates.length} 件
        </span>
      </div>

      <h4>选择材料 / 目标</h4>
      {inventory.length === 0 ? (
        <div class="empty">背包是空的</div>
      ) : (
        <div class="list">
          {inventory.map((it) => (
            <ItemRow
              item={it}
              active={selected?.id === it.id}
              onClick={() => onSelect(it)}
              extra={it.upgrade > 0 ? `+${it.upgrade}` : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 角色页：三职业切换 + 属性总览 + 武学列表。 */
export function CharacterPage(props: {
  equipped: Partial<Record<SlotId, Item>>;
  stats: { label: string; text: string }[];
  level: number;
  exp: number;
  expToNext: number;
  killLog: { t: number; text: string }[];
  weaponKind: WeaponKind;
}) {
  // 武器决定武学：这一页列的就是当前这把武器能用的四招
  const weaponName = WEAPON_BY_KIND.get(props.weaponKind)?.name ?? '空手';

  return (
    <div class="pane">
      <h4>角色</h4>
      <div class="kv"><span>职业</span><span>战士（{weaponName}）</span></div>
      <div class="kv"><span>等级</span><span class="num">{props.level}</span></div>
      <div class="kv"><span>经验</span><span class="num">{Math.round(props.exp)} / {props.expToNext}</span></div>

      <h4>属性总和</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">
        {props.stats.map((s) => (
          <div class="kv"><span>{s.label}</span><span class="num">{s.text}</span></div>
        ))}
      </div>

      <h4>武学（{weaponName}）</h4>
      <div class="list">
        {skillsForWeapon(props.weaponKind).map((sk) => (
          <div key={sk.id} class="row" style="cursor:default">
            <span class="nm">{sk.name}</span>
            <span class="tag">{sk.slot === 0 ? '普攻' : `${sk.unlockLevel} 级`}</span>
          </div>
        ))}
      </div>
      <div class="note" style="margin-top:6px">
        技能默认自动释放，你只决定优先级顺序（在战斗页拖动）。
      </div>

      <h4>战斗记录</h4>
      <div class="log">
        {props.killLog.length === 0 ? (
          <div class="empty">还没有记录</div>
        ) : (
          props.killLog.slice(-14).reverse().map((l) => <div>{l.text}</div>)
        )}
      </div>
    </div>
  );
}
