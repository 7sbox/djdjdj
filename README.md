# 地宫

固定视角 3D 的武侠刷宝挂机游戏。单机优先，之后可能做网游。

**当前状态**：垂直切片的骨架已经能跑 —— 能刷、能掉、能穿、能强化重铸合成、能挂机、能存档。

## 跑起来

```bash
pnpm install
pnpm dev      # http://localhost:5273
pnpm test     # 52 项逻辑测试
pnpm build    # 类型检查 + 打包
```

## 这是什么游戏

不是动作游戏，是**构建游戏**。玩家琢磨的是「这套词条和武学怎么搭配」，而不是「我走位好不好」。人物自己打，你只负责：

1. 吃不吃药
2. 武学自动放不放
3. 要不要再入挖矿

## 先读这些

| 文件 | 内容 |
|---|---|
| [设计规格](docs/design/vertical-slice-spec.md) | 这一版做什么、不做什么、全部数值 |
| [词汇表](GLOSSARY.md) | 项目的词，写议题和测试时用这些 |
| [ADR-0001](docs/adr/0001-web-stack-over-game-engine.md) | 为什么用 Web 而不是 Unity |
| [ADR-0002](docs/adr/0002-divisive-armor-mitigation.md) | 为什么禁止减法减伤 |
| [ADR-0003](docs/adr/0003-item-level-bound-to-zone.md) | 装备等级为什么固定于区域 |
| [ADR-0004](docs/adr/0004-affix-slot-exclusivity.md) | 词条为什么必须严格部位专属 |
| [ADR-0005](docs/adr/0005-death-interrupts-farming.md) | 挂机为什么可以死但不掉装备 |
| [ADR-0006](docs/adr/0006-boss-guaranteed-purple-over-pace.md) | 紫装节奏为什么改成实测值 |

## 结构

```
src/
├── types.ts      共享类型
├── data/         词条、装备、怪物、层、技能（纯数据，无逻辑）
├── sim/          逻辑层：rng / loot / stats / world / equip-ops
├── render/       Three.js 灰盒渲染
├── ui/           Preact 界面
└── storage/      IndexedDB 存档
```

**逻辑层与渲染层彻底分离**：`sim/` 不许 import `render/`，也不许出现任何模型名或贴图名。将来搬服务器时把 `render/` 扔掉即可。

## 不做什么（刻意）

抽卡、牧师、法师、剧情文本、多张地图、装备套装、赛季。这些在切片验证完之前一律不加。
