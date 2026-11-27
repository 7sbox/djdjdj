import { useState } from 'preact/hooks';
import type { SkillDef, WeaponKind } from '../types';
import { isPrioritySlot } from '../data/skills';
import { priorityForWeapon } from '../sim/skill-order';

/**
 * 战斗页的技能栏：4 个槽，冷却照旧。
 *
 * 主动技（1/2 号槽）可以拖着重排出手顺序 —— 普攻是自动的，位移保命另有开关，
 * 这两类都不参与优先级，所以按住也拖不动。
 * 拖动只改顺序，不放技能；放谁由 world 的 pickSkill 每帧按顺序挑。
 */
export function SkillBar(props: {
  skills: SkillDef[];
  cooldowns: Record<string, number>;
  /** 当前的优先级表（跨武器保留，可能混着别的武器的招）。 */
  priority: string[];
  weaponKind: WeaponKind;
  onReorder: (fromId: string, toId: string) => void;
}) {
  const { skills, cooldowns, priority, weaponKind, onReorder } = props;
  const [dragging, setDragging] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const order = priorityForWeapon(priority, weaponKind);

  const endDrag = () => {
    setDragging(null);
    setHovered(null);
  };

  return (
    <div class="skills">
      {skills.map((def) => {
        const cd = cooldowns[def.id] ?? 0;
        const draggable = isPrioritySlot(def);
        const rank = draggable ? order.indexOf(def.id) + 1 : 0;
        const classes = [
          'slot',
          cd <= 0 ? 'ready' : '',
          draggable ? 'moveable' : '',
          dragging === def.id ? 'dragging' : '',
          hovered === def.id && dragging && dragging !== def.id ? 'drop' : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={def.id}
            class={classes}
            draggable={draggable}
            title={draggable ? `${def.name} · 第 ${rank} 顺位（拖动换顺序）` : def.name}
            onDragStart={(e) => {
              if (!draggable) return;
              // Firefox 不 setData 就不肯开始拖
              e.dataTransfer?.setData('text/plain', def.id);
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              setDragging(def.id);
            }}
            onDragEnd={endDrag}
            onDragOver={(e) => {
              if (!dragging || !draggable || dragging === def.id) return;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              setHovered(def.id);
            }}
            onDragLeave={() => {
              if (hovered === def.id) setHovered(null);
            }}
            onDrop={(e) => {
              if (!dragging || !draggable || dragging === def.id) { endDrag(); return; }
              e.preventDefault();
              onReorder(dragging, def.id);
              endDrag();
            }}
          >
            {def.name.slice(0, 2)}
            {rank > 0 ? <div class="rank num">{rank}</div> : null}
            {cd > 0 ? <div class="cd num">{cd.toFixed(1)}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
