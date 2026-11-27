import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Item, SlotId } from '../types';
import { SLOTS } from '../data/items';
import { RARITY_CLASS, affixLine, compareItems, itemBaseLine, itemName, rarityName, slotLabel, upgradeNote } from './format';

/** 悬停详情卡。整个游戏使用时间最长的组件。 */
export function ItemCard(props: {
  item: Item;
  /** 当前该部位穿着的装备，给了就显示对比。 */
  equipped?: Item | undefined;
  onEquip?: () => void;
  onSalvage?: () => void;
  onSelectAffix?: (index: number) => void;
  selectedAffix?: number | null;
}) {
  const { item, equipped, onEquip, onSalvage, onSelectAffix, selectedAffix } = props;
  const diff = useMemo(
    () => (equipped && equipped.id !== item.id ? compareItems(item, equipped) : []),
    [item, equipped],
  );

  return (
    <div class="detail">
      <div class={`title ${RARITY_CLASS[item.rarity]}`}>
        {itemName(item)}
        <span class="tag" style="margin-left:6px;font-weight:400">· {rarityName(item.rarity)}</span>
      </div>
      <div class="meta">
        {slotLabel(item.slot)} · 需求等级 {Math.max(1, item.itemLevel - 4)}
        {item.upgrade > 0 ? ` · ${upgradeNote(item.upgrade)}` : ''}
      </div>

      <div class="base">{itemBaseLine(item)}</div>

      {item.affixes.length === 0 ? (
        <div class="affix" style="color:#5c6672">（凡品无词条）</div>
      ) : (
        item.affixes.map((a, i) => (
          <div
            class="affix"
            style={{
              cursor: onSelectAffix ? 'pointer' : 'default',
              background: selectedAffix === i ? '#1e2733' : 'transparent',
              padding: '1px 2px',
            }}
            onClick={() => onSelectAffix?.(i)}
          >
            {affixLine(a.affixId, a.value)}
            {onSelectAffix ? <span style="color:#4d5661"> · 可重铸</span> : null}
          </div>
        ))
      )}

      {diff.length > 0 && (
        <>
          <div class="divider" />
          <div style="color:#8b95a5;font-size:11px;margin-bottom:3px">
            换上的变化（对比当前 {equipped ? itemName(equipped) : '空'}）
          </div>
          {diff.map((d) => (
            <div class="diff">
              <span style="color:#8b95a5">{d.label}</span>
              <span class={d.dir > 0 ? 'up' : d.dir < 0 ? 'down' : 'same'}>{d.text}</span>
            </div>
          ))}
        </>
      )}

      {(onEquip || onSalvage) && (
        <>
          <div class="divider" />
          <div class="btnrow">
            {onEquip && <button class="btn primary" onClick={onEquip}>装备</button>}
            {onSalvage && <button class="btn danger" onClick={onSalvage}>拆解</button>}
          </div>
        </>
      )}
    </div>
  );
}

/** 一个简洁的物品行。 */
export function ItemRow(props: {
  item: Item;
  onClick?: () => void;
  extra?: string;
  active?: boolean;
}) {
  return (
    <div
      class="row"
      onClick={props.onClick}
      style={props.active ? 'border-color:#d8b46a;background:#1a1f26' : undefined}
    >
      <span class={`nm ${RARITY_CLASS[props.item.rarity]}`}>{itemName(props.item)}</span>
      <span class="tag">{slotLabel(props.item.slot)}</span>
      {props.extra ? <span class="tag">{props.extra}</span> : null}
    </div>
  );
}

/** 悬停定位的浮动卡片（跟随鼠标）。 */
export function HoverCard(props: { x: number; y: number; children: preact.ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: props.x, y: props.y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.min(props.x + 14, window.innerWidth - w - 8);
    const y = Math.min(props.y + 14, window.innerHeight - h - 8);
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [props.x, props.y, props.children]);

  return (
    <div class="tooltip" ref={ref} style={`left:${pos.x}px;top:${pos.y}px`}>
      {props.children}
    </div>
  );
}

/** 部位网格：点一下选中。 */
export function SlotGrid(props: {
  equipped: Partial<Record<SlotId, Item>>;
  onHover: (item: Item | null, e: MouseEvent) => void;
  onClick?: (slot: SlotId) => void;
}) {
  return (
    <div class="slotgrid">
      {SLOTS.map((slot) => {
        const it = props.equipped[slot];
        return (
          <div
            class={`eq ${it ? 'filled' : ''}`}
            onClick={() => props.onClick?.(slot)}
            onMouseEnter={(e) => props.onHover(it ?? null, e)}
            onMouseMove={(e) => props.onHover(it ?? null, e)}
            onMouseLeave={() => props.onHover(null, new MouseEvent('mouseleave'))}
          >
            <span class="sn">{slotLabel(slot)}</span>
            {it ? (
              <>
                <span class={RARITY_CLASS[it.rarity]} style="font-size:10px;padding:0 2px">
                  {itemName(it).slice(0, 3)}
                </span>
                <span class="lv">{it.upgrade > 0 ? `+${it.upgrade}` : ''}</span>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
