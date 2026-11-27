import { MANUALS, DRAW_COST, type ManualState } from '../sim/manual';
import type { SkillDef, WeaponKind } from '../types';
import { candidatesForSlot } from '../data/skills';
import { skillById } from '../data/combat-defs';

/** 残卷的卷次序号，只在 UI 上显示用。 */
const NUMERALS = ['一', '二', '三', '四'] as const;

/**
 * 秘籍残卷的界面：看收藏、凑残卷、抽卡。
 *
 * 放在角色页的「武学」区，不塞进铁匠页 —— 铁匠管装备，秘籍属于角色成长。
 */
export function ManualPage(props: {
  manual: ManualState;
  gold: number;
  scrollPages: number;
  /** 玩家当前武器谱系，用于显示「这本谱对你有没有用」。 */
  weaponKind: WeaponKind;
  onDraw: () => void;
  /** 最近一次抽卡结果，给玩家看「抽到了什么」。 */
  lastDraw: { fragmentName: string; duplicate: boolean; completed: boolean } | null;
}) {
  const canDraw = props.gold >= DRAW_COST.gold && props.scrollPages >= DRAW_COST.pages;

  return (
    <div>
      <h4>秘籍残卷</h4>
      <div class="note" style="margin-bottom:8px">
        抽的是残卷，不是角色也不是装备。凑齐一本即习得新招 —— 新的招式会和原有招式抢同一个槽位，
        换的是打法，不是更大的数字。
      </div>

      {MANUALS.map((m) => {
        const owned = m.fragments.filter((f) => props.manual.fragments.includes(f)).length;
        const done = props.manual.completed.includes(m.id);
        const total = m.fragments.length;

        return (
          <div class="detail" style="margin-bottom:8px">
            <div class={`title ${done ? 'c-orange' : ''}`}>
              《{m.name}》
              {done ? <span class="tag" style="margin-left:6px">已习得</span> : null}
            </div>
            <div class="meta">
              {m.weaponKind === 'sword' ? '剑法' : m.weaponKind} · {owned} / {total} 页
              {props.weaponKind !== m.weaponKind ? ' · 你当前不使这类兵器' : ''}
            </div>

            <div style="display:flex;gap:4px;margin:6px 0">
              {m.fragments.map((f, i) => {
                const has = props.manual.fragments.includes(f);
                return (
                  <div
                    style={{
                      flex: 1,
                      height: 34,
                      border: `1px solid ${has ? '#d8b46a' : '#2a3038'}`,
                      background: has ? '#1e232a' : '#101318',
                      borderRadius: 2,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 10,
                      color: has ? '#d8b46a' : '#4d5661',
                    }}
                  >
                    {has ? `卷${NUMERALS[i]}` : '未得'}
                  </div>
                );
              })}
            </div>

            <div class="affix" style="color:#9fb0c4">{m.description}</div>

            {done ? (
              <div class="note" style="margin-top:6px;color:#56c27a">
                已习得「{skillById(m.skillId).name}」。它的槽位与同槽招式二选一，见下方「主动技 2 号槽」。
              </div>
            ) : null}
          </div>
        );
      })}

      <div class="btnrow" style="margin-top:8px">
        <button class="btn primary" onClick={props.onDraw} disabled={!canDraw}>
          抽一张残卷
          <span style="color:#8b95a5;margin-left:6px;font-size:11px">
            金 {DRAW_COST.gold} / 残页 {DRAW_COST.pages}
          </span>
        </button>
      </div>

      {!canDraw ? (
        <div class="note" style="margin-top:4px;color:#8b95a5">
          {props.gold < DRAW_COST.gold ? '金币不够。' : ''}
          {props.scrollPages < DRAW_COST.pages ? '残页不够 —— 残页只有精英怪（5%）和 Boss（必掉 2–4）才给。' : ''}
        </div>
      ) : null}

      {props.lastDraw ? (
        <div
          class="detail"
          style={`margin-top:8px;border-color:${props.lastDraw.duplicate ? '#6b5a2b' : '#56c27a'}`}
        >
          {props.lastDraw.duplicate
            ? `抽到重复的「${props.lastDraw.fragmentName}」，已返还残页。`
            : `抽到「${props.lastDraw.fragmentName}」。`}
          {props.lastDraw.completed ? (
            <span style="color:#d8b46a;margin-left:4px">集齐了！已习得新招。</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 已习得招式后，主动技 2 号槽变成「二选一」。
 *
 * 这是抽卡的兑现处：不是一个新按钮，而是**多一种打法可选**。
 */
export function SlotChoice(props: {
  weaponKind: WeaponKind;
  learned: readonly string[];
  current: string | null;
  onChoose: (skillId: string) => void;
}) {
  const options = candidatesForSlot(props.weaponKind, 2, props.learned);
  if (options.length <= 1) return null;

  return (
    <div style="margin-top:6px">
      {options.map((s: SkillDef) => {
        const active = props.current === s.id;
        return (
          <div
            class="row"
            style={active ? 'border-color:#d8b46a;background:#1a1f26' : undefined}
            onClick={() => props.onChoose(s.id)}
          >
            <span class="nm">{s.name}</span>
            <span class="tag">{active ? '当前装配' : '换上'}</span>
            <span class="tag">倍率 {s.power} · 冷却 {s.cooldown}s</span>
          </div>
        );
      })}
    </div>
  );
}
