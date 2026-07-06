# 个人 Portfolio（持仓组合）板块设计

日期：2026-07-06 ｜ 状态：已确认（用户批准）

## 目标

在美股&加密智能量化工作台中新增个人持仓组合板块：记录交易流水，自动汇总当前持仓与盈亏，
展示组合净值曲线。独立页面 + Dashboard 概览卡片，沿用赛博朋克主题。

## 需求决策（用户已确认）

1. **数据模型**：交易流水模式 —— 记录每笔买入/卖出，持仓与盈亏由流水推导。
2. **页面形态**：独立页（侧边栏「持仓组合」）+ Dashboard 概览卡片。
3. **资产范围**：美股（`AAPL.US`）+ 加密（`BTCUSDT`），不记现金余额。
4. **净值曲线**：按日回溯市值曲线（本地日K收盘 × 当日持仓量），实时点接 QuoteService。

## 数据存储

`data/user_data/portfolio_trades.parquet`（沿用 watchlist 的 user_data parquet 模式），
单表、唯一事实来源，无派生状态落盘：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | Utf8 | uuid4，编辑/删除定位 |
| symbol | Utf8 | 与现有行情体系一致的代码 |
| side | Utf8 | `buy` / `sell` |
| price | Float64 | 成交价，> 0 |
| qty | Float64 | 数量，> 0（加密支持小数） |
| fee | Float64 | 手续费，默认 0 |
| traded_at | Utf8 | ISO 日期 `YYYY-MM-DD` |
| note | Utf8 | 备注，可空 |

## 盈亏口径（加权平均成本法）

按 symbol 将流水按 `traded_at, id` 升序结转：

- **买入**：`avg_cost = (持仓量×avg_cost + qty×price + fee) / (持仓量 + qty)`；持仓量增加。
- **卖出**：均价不变；`realized_pnl += (price − avg_cost) × qty − fee`；持仓量减少。
- **超卖拒绝**：卖出数量 > 当时持仓量 → API 400，前端明确报错（含当前可卖数量）。
- **浮动盈亏**：`(现价 − avg_cost) × 持仓量`。现价优先 QuoteService 实时 enriched，
  兜底本地 enriched 最新收盘。
- **今日盈亏**：`(现价 − 昨收) × 持仓量`（昨收取 enriched prev_close/上一交易日收盘）。

## 后端

- `backend/app/services/portfolio.py`：parquet 读写 + 纯函数计算
  （`summarize_positions(trades, prices)`、`build_equity_curve(trades, daily_closes)`
  可独立单测，不依赖 IO/行情）。
- `backend/app/api/portfolio.py`（挂到 routes）：
  - `GET /api/portfolio/trades` — 流水列表（按日期倒序）
  - `POST /api/portfolio/trades` — 新增（校验 symbol 非空、price/qty > 0、超卖拒绝）
  - `PUT /api/portfolio/trades/{id}` / `DELETE /api/portfolio/trades/{id}` —
    改/删后重新校验整条流水时间线不出现负持仓，违反则 400 并说明哪笔冲突
  - `GET /api/portfolio/summary` — 持仓明细数组 + 组合汇总
    （总市值/总成本/浮动盈亏/已实现盈亏/今日盈亏/手续费合计）
  - `GET /api/portfolio/equity_curve` — `[{date, market_value, cost_basis, pnl}]`，
    自最早交易日至今；美股非交易日收盘价前值填充；当日实时点用 QuoteService。

## 前端

- `frontend/src/pages/Portfolio.tsx`，路由 `/portfolio`，侧边栏新增「持仓组合」：
  1. 顶部统计条：总市值 / 总成本 / 浮动盈亏 / 已实现盈亏 / 今日盈亏（涨跌配色沿用 palette）
  2. 净值曲线：ECharts，沿用现有图表主题
  3. 持仓表：赛博朋克表格风格（参考 `WatchlistCpTable`），列：代码/名称/数量/均价/现价/
     市值/浮动盈亏(率)/今日盈亏；点击行跳转个股分析
  4. 交易流水表 + 录入/编辑弹窗：symbol 搜索复用 `/api/kline/instruments/search`
- Dashboard 新增 `frontend/src/components/dashboard/PortfolioCard.tsx`（GlassCard 风格）：
  总市值 + 今日/累计盈亏，空态引导录入，点击跳 `/portfolio`。
- `lib/api.ts` 增加 portfolio API 封装；react-query 管理数据（summary 跟随现有行情刷新节奏）。

## 测试

pytest（`backend/tests/test_portfolio.py`），合成流水数据覆盖：
均价结转、卖出已实现盈亏、超卖拒绝、编辑/删除后的时间线重校验、equity curve
（含非交易日前值填充）、空流水边界。

## 明确不做（YAGNI）

- 现金余额 / 入金出金 / TWR 收益率
- 多组合（账户）支持
- 券商对账单导入（CSV 等）—— 后续按需加
- 净值曲线快照落盘缓存 —— 个人规模现算毫秒级，规模大了再加
