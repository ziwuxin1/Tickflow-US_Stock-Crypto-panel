# 两步创建示例：动量领涨策略

本文演示从零创建一个自定义策略的完整流程（美股 / 加密货币通用）。

---

## Step 1：填写规则

用户在创建对话框填写：

| 字段 | 填写内容 |
|------|---------|
| 名称 | **动量领涨** |
| 描述 | 筛选近 5 日累计涨幅领先、当日放量大涨的强势标的 |
| 方向 | 做多 |
| 规则 | 近 5 日累计涨幅不低于 10%，当日涨幅不低于 5%，5 日量比不低于 1.5 倍；按动量、当日涨幅与成交额综合评分排序。所有条件均为当日指标比较，使用 filter 单日模式。 |

点击「AI 生成」，AI 返回完整策略代码（含参数、信号、评分、告警）：

```python
"""动量领涨 — 5日动量领先 + 当日放量大涨"""
import polars as pl

META = {
    "id": "momentum_leader",
    "name": "动量领涨",
    "description": "筛选近5日累计涨幅领先、当日放量大涨的强势标的",
    "tags": ["动量", "短线", "放量"],
    "basic_filter": {
        "price_min": 1.0,
        "price_max": 10000,
        "market_cap_min": 1e8,
        "amount_min": 5e6,
    },
    "params": [
        {
            "id": "momentum_min",
            "label": "5日最低动量",
            "type": "float",
            "default": 0.10,
            "min": 0.03,
            "max": 0.50,
            "step": 0.01,
        },
        {
            "id": "change_min",
            "label": "当日最低涨幅",
            "type": "float",
            "default": 0.05,
            "min": 0.02,
            "max": 0.20,
            "step": 0.01,
        },
        {
            "id": "vol_ratio_min",
            "label": "最低5日量比",
            "type": "float",
            "default": 1.5,
            "min": 1.0,
            "max": 5.0,
            "step": 0.1,
        },
    ],
    "scoring": {
        "momentum_5d": 0.4,
        "change_pct": 0.3,
        "amount": 0.3,
    },
    "order_by": "score",
    "descending": True,
    "limit": 100,
}

ENTRY_SIGNALS = ["signal_n_day_high"]
EXIT_SIGNALS = ["signal_ma20_breakdown"]
STOP_LOSS = -0.06
MAX_HOLD_DAYS = 10
ALERTS = [
    {"field": "signal_n_day_high", "message": "动量领涨：创60日新高"},
]

RULES = """
1. 近 5 个交易日累计涨幅不低于设定阈值（默认 10%）
2. 当日涨幅不低于设定阈值（默认 5%），处于加速上攻状态
3. 5 日量比不低于设定阈值（默认 1.5 倍），量能确认资金介入
"""


def filter(df: pl.DataFrame, params: dict) -> pl.Expr:
    """策略核心过滤逻辑，返回 Polars 布尔表达式。"""
    momentum_min = float(params.get("momentum_min", 0.10))
    change_min = float(params.get("change_min", 0.05))
    vol_ratio_min = float(params.get("vol_ratio_min", 1.5))
    return (
        (pl.col("momentum_5d") >= momentum_min)
        & (pl.col("change_pct") >= change_min)
        & (pl.col("vol_ratio_5d") >= vol_ratio_min)
    )
```

---

## Step 2：预览 + 指令修改

进入第二步，显示完整的策略预览和指令输入框。

用户如果觉得条件太严格（例如加密小币种经常单日大涨但 5 日动量不足），可以输入「把 5 日动量阈值放宽到 8%，量比放宽到 1.3」→ 点 AI 修改。AI 更新 `params` 默认值和 `filter()` 逻辑。

确认无误后点「保存策略」→ 策略池中出现。

---

## 后续使用

打开策略配置，**基础参数**和**策略参数**分别独立：

```
┌─ 配置：动量领涨 ──────────────────────────┐
│  名称 [动量领涨             ] 显示上限 [30]│
│                                            │
│  📊 基础参数          [启用 ●]             │
│    价格 [1]~[10000] USD                    │
│    最低成交额 [500万 USD]                  │
│                                            │
│  ⚙ 策略参数                               │
│    5日最低动量 [0.10]                      │
│    当日最低涨幅 [0.05]                     │
│    最低5日量比 [1.5]                       │
│                                            │
│  ⭐ 评分权重    📈 交易参数                 │
└────────────────────────────────────────────┘
```
