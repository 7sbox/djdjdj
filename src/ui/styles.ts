/** 全局样式。四页共用，写一份。 */
export const CSS = `
:root {
  --bg: #0b0d10; --panel: #14171c; --panel-2: #1b1f26; --line: #2a3038;
  --ink: #d8dee8; --ink-dim: #8b95a5; --gold: #d8b46a;
  --up: #56c27a; --down: #d2564f;
  --rar-common: #b9c0cc; --rar-green: #56c27a; --rar-blue: #4e9fe0;
  --rar-purple: #a874e6; --rar-orange: #e08a3c;
}
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body {
  background: var(--bg); color: var(--ink); overflow: hidden;
  font: 13px/1.5 "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
}
.num { font-variant-numeric: tabular-nums; }

.app { display: flex; flex-direction: column; height: 100%; }

/* 顶栏 */
.topbar {
  display: flex; align-items: center; gap: 14px; padding: 0 14px;
  height: 42px; background: var(--panel); border-bottom: 1px solid var(--line);
  flex: 0 0 auto; font-size: 12px;
}
.topbar .brand { color: var(--gold); font-weight: 700; letter-spacing: 2px; }
.topbar .stat { color: var(--ink-dim); }
.topbar .stat b { color: var(--ink); font-weight: 600; }
.spacer { flex: 1; }

/* 主体 */
.body { flex: 1; display: flex; min-height: 0; }

/* 战斗视口 */
.viewport { flex: 1; position: relative; min-width: 0; background: #0b0d10; }
.viewport canvas { display: block; }

.hud { position: absolute; inset: auto 0 0 0; padding: 12px; pointer-events: none; }
.bar {
  height: 16px; background: #1a1d22; border: 1px solid var(--line);
  border-radius: 2px; overflow: hidden; position: relative;
}
.bar > i { display: block; height: 100%; transition: width .12s linear; }
.bar.hp > i { background: linear-gradient(180deg, #b8443d, #7a2b28); }
.bar.exp { height: 6px; }
.bar.exp > i { background: linear-gradient(180deg, #d8b46a, #8a6f33); }
.bar .label {
  position: absolute; inset: 0; text-align: center; font-size: 11px;
  line-height: 16px; color: #fff; text-shadow: 0 1px 2px #000; font-variant-numeric: tabular-nums;
}

.skills { display: flex; gap: 6px; margin-top: 8px; }
.slot {
  width: 44px; height: 44px; border: 1px solid var(--line); background: #16191e;
  border-radius: 3px; position: relative; display: grid; place-items: center;
  font-size: 10px; color: var(--ink-dim); pointer-events: auto;
}
.slot.ready { border-color: var(--gold); color: var(--ink); }
.slot .cd {
  position: absolute; inset: auto 0 0 0; background: rgba(0,0,0,.62);
  text-align: center; font-size: 10px; color: #ccc;
}

.toggles { display: flex; gap: 8px; margin-top: 8px; pointer-events: auto; flex-wrap: wrap; }
.tg {
  display: flex; align-items: center; gap: 5px; padding: 3px 8px;
  background: #16191e; border: 1px solid var(--line); border-radius: 2px; cursor: pointer;
  font-size: 11px; user-select: none;
}
.tg.on { border-color: var(--gold); color: var(--gold); }
.tg:hover { background: #1e232a; }

.floating {
  position: absolute; pointer-events: none; font-weight: 700; font-size: 13px;
  text-shadow: 0 1px 3px #000; transform: translate(-50%, -50%); white-space: nowrap;
}
.floating.damage { color: #e8e2d6; }
.floating.crit { color: #ffd479; font-size: 17px; }
.floating.heal { color: #6fd08c; }
.floating.loot { color: var(--gold); font-size: 12px; }

/* 右侧面板 */
.panel {
  width: 400px; flex: 0 0 auto; background: var(--panel);
  border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0;
}
.tabs { display: flex; border-bottom: 1px solid var(--line); flex: 0 0 auto; }
.tab {
  flex: 1; padding: 9px 0; text-align: center; cursor: pointer; font-size: 12px;
  color: var(--ink-dim); border-bottom: 2px solid transparent; user-select: none;
}
.tab.on { color: var(--gold); border-bottom-color: var(--gold); background: #171b21; }
.tab:hover { color: var(--ink); }
.pane { flex: 1; overflow-y: auto; padding: 10px; min-height: 0; }
.pane::-webkit-scrollbar { width: 8px; }
.pane::-webkit-scrollbar-thumb { background: #2a3038; border-radius: 4px; }

h4 { margin: 12px 0 6px; font-size: 12px; color: var(--ink-dim); font-weight: 600; }
h4:first-child { margin-top: 0; }

.slotgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.eq {
  aspect-ratio: 1; border: 1px solid var(--line); background: #101318;
  border-radius: 3px; position: relative; display: grid; place-items: center;
  font-size: 10px; color: #4d5661; cursor: pointer;
}
.eq.filled { color: var(--ink); }
.eq .sn { position: absolute; top: 2px; left: 3px; font-size: 9px; color: #5c6672; }
.eq .lv { position: absolute; bottom: 2px; right: 3px; font-size: 9px; color: var(--gold); }
.eq:hover { border-color: var(--gold); }

.list { display: flex; flex-direction: column; gap: 4px; }
.row {
  display: flex; align-items: center; gap: 6px; padding: 5px 7px;
  background: #12151a; border: 1px solid #202630; border-radius: 2px;
  cursor: pointer; font-size: 12px;
}
.row:hover { background: #1a1f26; border-color: var(--gold); }
.row .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .tag { font-size: 10px; color: var(--ink-dim); }

.c-common { color: var(--rar-common); }
.c-green { color: var(--rar-green); }
.c-blue { color: var(--rar-blue); }
.c-purple { color: var(--rar-purple); }
.c-orange { color: var(--rar-orange); }

.empty { color: #4d5661; font-size: 12px; padding: 14px 4px; text-align: center; }

.btn {
  padding: 6px 12px; background: #1e232a; border: 1px solid var(--line);
  color: var(--ink); border-radius: 2px; cursor: pointer; font-size: 12px;
}
.btn:hover { border-color: var(--gold); color: var(--gold); }
.btn:disabled { opacity: .35; cursor: not-allowed; }
.btn.primary { border-color: var(--gold); color: var(--gold); }
.btn.danger { border-color: #6b2b28; color: #d2564f; }
.btnrow { display: flex; gap: 6px; flex-wrap: wrap; }

/* 物品详情 */
.detail {
  border: 1px solid var(--line); background: #101318; border-radius: 3px;
  padding: 9px; margin-top: 8px; font-size: 12px;
}
.detail .title { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.detail .meta { color: var(--ink-dim); font-size: 11px; margin-bottom: 6px; }
.detail .base { color: var(--ink); margin-bottom: 4px; }
.detail .affix { color: #9fb0c4; font-size: 11.5px; }
.detail .divider { border-top: 1px dashed #2a3038; margin: 7px 0; }

/* 悬停对比：绿升红降 */
.diff { display: flex; justify-content: space-between; font-size: 11.5px; }
.diff .up { color: var(--up); }
.diff .down { color: var(--down); }
.diff .same { color: var(--ink-dim); }

.tooltip {
  position: fixed; z-index: 100; pointer-events: none; max-width: 320px;
  background: #0e1116; border: 1px solid var(--line); border-radius: 3px;
  padding: 9px; box-shadow: 0 8px 24px rgba(0,0,0,.6);
}

.log { font-size: 11.5px; color: var(--ink-dim); }
.log div { padding: 2px 0; border-bottom: 1px solid #16191e; }

.kv { display: flex; justify-content: space-between; padding: 2px 0; font-size: 12px; }
.kv span:first-child { color: var(--ink-dim); }

/* 存档导入/导出的提示条。成功绿、失败红，失败时后面那句一定是「当前存档没有被改动」 */
.notice {
  display: flex; align-items: center; gap: 10px; padding: 6px 14px;
  font-size: 11.5px; border-bottom: 1px solid var(--line);
}
.notice .text { flex: 1; }
.notice .close { color: var(--ink-dim); cursor: pointer; user-select: none; }
.notice .close:hover { color: var(--ink); }
.notice.ok { background: #16211a; color: var(--up); }
.notice.err { background: #221716; color: var(--down); }

.startbar { display: flex; gap: 6px; align-items: center; padding: 8px 10px; border-top: 1px solid var(--line); }
.note { font-size: 11px; color: var(--ink-dim); }
`;
