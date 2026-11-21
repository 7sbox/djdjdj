# 分诊标签

这些技能都用五个规范分诊角色来表述。这份文件把这些角色映射到这个仓库的议题跟踪器实际使用的标签字符串。

| mattpocock/skills 里的标签 | 我们跟踪器里的标签 | 含义 |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | 维护者需要评估这条议题 |
| `needs-info` | `needs-info` | 等待报告者补充更多信息 |
| `ready-for-agent` | `ready-for-agent` | 已经完整说明，可以交给 AFK 代理 |
| `ready-for-human` | `ready-for-human` | 需要由人来实现 |
| `wontfix` | `wontfix` | 不打算处理 |

本仓库沿用默认词汇，没有做任何替换映射（两列相同）。

当某个技能提到某个角色时（例如「套用 AFK 就绪的分诊标签」），就使用这张表里对应的标签字符串。

## 寻路标签

`/wayfinder` 另需一组标签，与分诊角色互不重叠：

| 标签 | 用途 |
| --- | --- |
| `wayfinder:map` | 探索地图本身（一张议题） |
| `wayfinder:research` | 地图下的调研工单 |
| `wayfinder:prototype` | 地图下的原型工单 |
| `wayfinder:grilling` | 地图下的拷问工单 |
| `wayfinder:task` | 地图下的实施工单 |

打标签严格按技能规则来：分诊只套上表里的五角色之一，寻路只在地图与它的子工单上套 `wayfinder:*`，不额外强加其他标签。
