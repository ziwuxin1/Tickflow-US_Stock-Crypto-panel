<div align="center">

# 📈 美股&加密智能量化工作台

**自托管、零运维的美股 + 加密货币「选股 + 监控 + 回测 + 个股决策」量化工作台**

**面向个人投资者与量化爱好者而生**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/Python-≥3.11-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Data: TickFlow](https://img.shields.io/badge/Data-TickFlow-00b386.svg)](https://tickflow.org/auth/register?ref=V3KDKGXPEA)
[![Data: Binance](https://img.shields.io/badge/Data-Binance-f0b90b.svg)](https://data-api.binance.vision)
[![Deploy: Docker](https://img.shields.io/badge/Deploy-Docker-2496ed.svg)](./Dockerfile)
[![GitHub stars](https://img.shields.io/github/stars/ziwuxin1/Tickflow-US_Stock-Crypto-panel?style=social)](https://github.com/ziwuxin1/Tickflow-US_Stock-Crypto-panel/stargazers)

</div>

<div align="center">

**[快速开始](#-快速开始)** · **[核心功能](#-核心功能)** · **[配置](#️-配置)** · **[路线图](#-路线图)**

</div>

- 🆓 **免 key 即用** — 美股历史日 K 走 TickFlow free-api,加密行情走 Binance 公共端点全功能,**不填任何 Key 也能跑通全流程**
- 🏠 **自托管零运维** — Docker 单容器部署,数据完全掌握在自己手里
- 🔍 **三位一体** — 选股(17 内置策略)+ 实时监控 + 向量化回测,Polars 毫秒级扫描全美股 + 全币种
- 📈 **个股决策页** — 日 K + 11 类关键价位 + AI 四维分析 + AI 自动预测点位画线;BTC/ETH 专属「周期彩虹」模式(2010 至今全周期着色 + 牛熊/减半标注 + 抄底/卖出价位带)
- 💼 **持仓组合** — 美股 + 加密混合持仓的市值/盈亏跟踪,看板环形图联动
- 🤖 **AI 加持** — 一句话生成策略代码 · AI 四维分析 / 自动预测 · 盘后自动复盘推送飞书;任意 OpenAI 兼容接口均可接入(留空即关闭)
- 📡 **Followin 检索(可选)** — 个股分析页内置 Followin 数据检索控制台:加密/美股新闻·指标·信号检索 + AI 分析智能体自动调工具综合作答
- 🔌 **自由扩展** — 自有量化项目数据,与内置数据同台分析
- 🌐 **双市场同屏** — 美股 + 加密货币共用一套自选/选股/回测/监控;加密 7×24 全天候

 美股数据基于 [TickFlow](https://tickflow.org/auth/register?ref=V3KDKGXPEA)(universe `US_Equity`),加密数据基于 Binance 公共行情(`data-api.binance.vision`,免 key)。**明确不做**:不对标专业终端,不内置「AI 荐股」。

> 有更多稳定免费数据源推荐,或者提交建议/意见的大佬可以邮件到 415333856@qq.com,q群 109338242

觉得有用可以点个 Star,蟹蟹 🌹

---

## 🎯 项目定位

**面向个人投资者与量化爱好者的美股 + 加密货币分析工作台**,聚焦「**选股 + 监控 + 回测 + 个股决策**」四大场景,LLM 能力驱动进行市场分析,掌控市场节奏;让普通投资者也能拥有一套可自定义策略的量化工具。

---

## 📸 界面预览

<table>
  <tr>
    <td width="50%" align="center"><b>看板 Dashboard</b></td>
    <td width="50%" align="center"><b>策略 Screener</b></td>
  </tr>
  <tr>
    <td width="50%"><img src="./screenshots/dashboard.png" alt="看板页面"></td>
    <td width="50%"><img src="./screenshots/screener.png" alt="策略页"></td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>回测 Backtest</b></td>
    <td width="50%" align="center"><b>监控中心 Monitor</b></td>
  </tr>
  <tr>
    <td width="50%"><img src="./screenshots/backtest.png" alt="回测页"></td>
    <td width="50%"><img src="./screenshots/monitor.png" alt="监控中心"></td>
  </tr>
</table>

<div align="center">

### 📸 [查看更多界面截图 »](./screenshots/README.md)

</div>

---

## 🚀 快速开始

### 前置依赖

| 工具                               | 版本   | 安装                                               |
| :--------------------------------- | :----- | :------------------------------------------------- |
| Python                             | ≥ 3.11 | [python.org](https://www.python.org/)              |
| Node                               | ≥ 20   | [nodejs.org](https://nodejs.org/)                  |
| [`uv`](https://docs.astral.sh/uv/) | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| `pnpm`                             | 9      | `npm i -g pnpm`                                    |

### 方式 A:Dev 模式(二次开发推荐)

```bash
cp .env.example .env       # 按需填 TICKFLOW_API_KEY(留空 = None 模式;加密行情始终免 key)
./dev.sh                   # Windows: .\dev.ps1
```

自动检查 / 下载依赖、释放端口、同时起前后端,Ctrl-C 一并关闭。默认:

- 后端 → <http://localhost:3018> · 前端 → <http://localhost:3011>
- 自定义端口:`BACKEND_PORT=8000 FRONTEND_PORT=5173 ./dev.sh`

### 方式 B:Docker(部署最省心)

```bash
cp .env.example .env
docker compose up --build
# 打开 http://localhost:3018
```

<details>
<summary><b>环境适配与高级选项(老 CPU · 手动启动 · 回测依赖)</b></summary>

**老 CPU 兼容(avx2/fma 缺失报错或 exit 132)**:桌面客户端安装包已内置兼容内核(新老 CPU 通吃)。Docker / 源码用户在 `.env` 打开 `BACKEND_EXTRAS=legacy-cpu` 后重建,会给 Polars 切到 `rtcompat` 运行时;需回测则 `BACKEND_EXTRAS=legacy-cpu backtest`。

**手动分别启动:**

```bash
# 后端
cd backend && uv sync --extra backtest   # 含回测依赖
uv run uvicorn app.main:app --reload --port 3018

# 前端
cd frontend && pnpm install && pnpm dev   # http://localhost:3011
```

**回测依赖**:vectorbt → numba 体积较大,作为可选 extras(`uv sync --extra backtest`)。macOS / Intel 无预构建 wheel 时需 `brew install cmake` 现场编译。

</details>

### 🔄 更新代码(已部署用户必读)

拉取新版本只需一条命令:

```bash
git pull
```

**整个 `data/` 目录都不纳入 git**——行情 K线、财务、自选、回测、监控记录等扩展数据,全部是程序运行时生成/拉取的用户数据,`git pull` 物理上无法影响它们。

> ⚠️ **切勿使用以下命令"解决冲突"或"清理",它们会一次性删光 `data/` 下所有未被 git 跟踪的数据:**
> - `git clean -fdx`(最危险,会删掉所有 `.gitignore` 忽略的文件)
> - `git reset --hard`
> - 直接删除整个项目文件夹重新 `git clone`
>
> 若 `git pull` 报冲突,通常是本地误改了被跟踪的文件,请先 `git stash` 暂存再 pull,或单独联系作者,不要直接执行上面的命令。

### 🧭 跑起来后的第一次使用

1. **设置 → 凭据与能力** → 点 **重新检测**,确认档位标签(加密数据免 key,始终可用)
2. **设置** → **立即跑盘后管道**:拉日 K + 计算 enriched 表(美股 None / Free 走 free-api,美东收盘后 1-2 小时可用;加密按 UTC 每日结算)
3. **自选**页加标的(美股如 `AAPL.US`,加密如 `BTCUSDT`)→ **选股**页点策略卡片扫描 / 配自定义信号
4. **个股分析**页搜索标的 → 看关键价位 / 跑 AI 分析;BTC/ETH 可切「周期彩虹」看全周期位置
5. **回测**页选策略 + 区间 → 看净值 / 夏普 / 交易明细(SSE 实时进度)
6. **监控中心**配规则(策略 / 个股信号 / 价格 / 异动),实时弹窗 + 持久化记录;加密标的 7×24 监控

---

## ✨ 核心功能

### 🔍 选股引擎(Screener)

**17 个内置策略**,每个策略一个独立 Python 文件,基于 Polars 表达式向量化实现(`backend/app/strategy/builtin/`):

| 类型        | 代表策略                                                       |
| :---------- | :------------------------------------------------------------ |
| 趋势 / 形态 | 趋势突破 · 均线多头 · MA 金叉 · MACD 金叉放量 · 唐奇安通道突破 |
| 量价 / 动量 | 量价齐升 · 高换手强势 · 动量领涨 · 强势收盘 · 连续强势         |
| 反转 / 波动 | 超跌反弹 · 超卖反转 · 新低反转 · 低波动龙头 · 回踩 MA20        |

**扩展策略的三种方式:**

| 方式              | 说明                                                                                                    |
| :---------------- | :------------------------------------------------------------------------------------------------------ |
| **🎛️ 自定义信号** | 不写代码,UI 上 `字段 + 操作符 + 阈值` 组合编译成 Polars 表达式热加载                                    |
| **🤖 AI 生成**    | 一句话描述思路,LLM 读 `strategy-guide.md` 生成完整策略文件(经 `ast` 校验)→ 落入 `data/strategies/ai/` |
| **📝 代码迁移**   | 参照开发指南把已有策略改写为 Polars 文件放入 `data/strategies/custom/`,引擎自动发现                     |

### 📈 个股分析(Beta)

以「行情 + 关键价位 + AI」为主体的单标的决策页(美股 / 加密通用),Cyberpunk 主题:

- **专用日 K 图表**:主图 + 成交量 + MACD,滚轮缩放 · 拖拽平移 · 双击复位;波浪信号 / 三角区 / 预测线图层
- **11 类关键价位**(纯函数实时计算,毫秒级):压力支撑 · 枢轴点(3 档) · 前高前低 · 布林带 · Keltner 短/中/长通道 · ATR 止损 · 缺口位 · 斐波那契 · 整数关口,曲线 + 水平线分层渲染,价位统计面板结构化列出
- **AI 四维分析**:技术 / 基本面 / 财务 / 消息面流式生成,实战派交易员视角(加密标的自动切换 24/7 交易员视角),历史报告持久化
- **AI 自动预测**:基于最新行情与关键价位自动计算进出场 / 止损 / 目标点位,直接画到 K 线上并生成可视化报告;数据源可选「全网抓取」或「Followin 实时」
- **Followin 数据检索控制台(可选)**:新闻 / 研报 / 推特 / 指标 / 信号检索 + 「AI 分析」智能体模式(自动多轮调用 Followin 工具综合作答,markdown 渲染),推荐问题引导小白上手

#### 🌈 周期彩虹模式(BTC / ETH 专属)

参照「狼波周期指数」语义自研的全周期视图,一眼看清当前处于牛熊周期的哪个阶段:

- **全量历史**:BTC 从 **2010 年**至今(Binance 2017-08 起 + blockchain.info 早期段拼接,parquet 落盘一次性),今日蜡烛实时更新(30s 轮询)
- **周期时间钟着色**:牛市段颜色随时间蓝 → 绿 → 黄 → 橙 → 红单调升温(中途回调不打断),熊市段红 → 蓝降温;60 日涨速可把暴力反弹抬到橙色
- **周期结构标注**:减半日竖线(下次减半倒计时)· 历史牛熊区间底纹(含年份标签)· 进行中熊市自动延伸**预测段**(剩余天数 + 预计见底日,按现代熊市均长推算)
- **抄底 / 卖出价位带**:抄底区间(蓝,最近一轮熊市回撤 ±5pp)· 卖出区间(红,顶对顶倍率外推),横向色带画在图上,开关可显隐
- 当前周期位置百分比 + BULL/BEAR PHASE 徽标;悬停任意点显示日期 / 价格 / 周期位置 / 牛熊状态

> 周期推算仅为历史规律参考,**非投资建议**。

### 💼 持仓组合(Portfolio)

美股 + 加密混合持仓录入与跟踪:总市值 / 今日盈亏 / 累计盈亏 / 资产类结构,看板首页持仓分布环形图可交互(hover 联动 + 数字滚动)。

### 📊 指标流水线(Indicators)

原生 Polars 向量化,全美股 + 全币种一次扫表落盘 enriched Parquet:

- **均线 / 趋势**:MA(5-60)· EMA · MACD · 动量 · 布林带
- **震荡 / 波动**:RSI · KDJ · ATR · 年化波动率 · 振幅
- **量能 / 动量**:量比 · 量均线 · 连涨天数 · 换手率(美股)
- **原子信号**:MA / MACD 金叉死叉 · N 日新高新低 · 布林突破
- **复权**:美股基于除权因子自动前复权,回测与指标口径一致(加密无复权概念)

### 🧪 回测引擎(Backtest)

**三种模式**(个股 / 策略组合 / 自由信号组合),真实约束(次日开盘成交防未来函数 · 手续费 · 滑点 · 止损 · 最大持仓天数),组合管理(最大持仓 · 敞口 · 等权 / 自定义仓位)。美股按 252 交易日年化,加密 7×24 按 365 天年化并支持小数仓位。SSE 流式进度支持切页重连,输出净值曲线 · 夏普 · 最大回撤 · 胜率 · 交易明细。

### 📡 监控中心(Monitor)

统一规则引擎,一个页面管理**四类监控**(策略 · 个股信号 · 价格涨跌 · 全市场异动):

- 多条件 AND/OR + 冷却期去重 + 严重级别(info/warn/critical)
- 多入口配置:监控中心新建 / 个股详情页「加监控」/ 策略卡片一键开启
- 命中后右下角弹窗(可配声效)+ 持久化到 `alerts.jsonl`,菜单未读徽标
- **触发记录详情**:每条记录展示命中的具体条件(如 `RSI>80`)与当前价位,一眼看清为何触发
- **飞书 Webhook 推送**:全局一处配置飞书群机器人地址,启用推送的规则命中即推送到飞书群(支持签名校验);可在设置页设「默认推送渠道」,新建规则自动预填

### 📰 复盘与财务

- **盘后复盘(Review · Beta)**:收盘后自动 AI 复盘市场,可推送至飞书等渠道
- **财务分析(Financials)**:个股财务数据检索与展示(TickFlow 财务接口)
- **大盘指数(Indices)**:指数行情与技术图层(波浪信号 / 三角区 / 预测线)

### 🧰 数据与扩展

- **TickFlow 美股数据**:日 K / 分钟 K / 财务 / 实时行情(universe `US_Equity`,含 ETF)
- **Binance 加密数据**:USDT 现货交易对日 K / 24h 全市场实时行情,公共端点免 key
- **blockchain.info**:BTC 2010-2017 早期日线(免 key,周期彩虹模式用,拉一次落盘)
- **🔌 第三方接入(重点)**:HTTP 定时拉取 · CSV / Excel 上传 · JSON 写入,自动 schema 发现 + 符号归一,页面可视化配置,**可与自有量化项目数据并入 DuckDB 同台分析**
- **定时管道**:APScheduler 分市场调度 —— 美股收盘后(美东时间)自动拉日 K + 重算 enriched + 跑监控,加密每日 UTC 结算
- **令牌桶限流**:适配 TickFlow 各档位 rpm / batch,批量合并 + 增量拉取

---

## ⚙️ 配置

所有配置从根目录 `.env` 读取(复制 `.env.example` 开始),也可在面板 **设置** 页修改。

### 数据源一:TickFlow(美股)

```ini
TICKFLOW_API_KEY=              # 留空 = None 模式(美股历史日K免费);填 Key = 按订阅档位解锁
```

留空即 None 模式,通过 free-api 使用美股历史日 K(美东收盘后 1-2 小时可用);免费注册 Key 后进 Free 模式,开启自选股实时监控。**实时行情按档位**:

| 档位     | 实时能力                                      |
| :------- | :-------------------------------------------- |
| Free     | 自选页前 5 个美股标的实时监控(最低 6 秒刷新) |
| Starter+ | 全市场实时行情                                |
| Pro      | 分钟 K                                        |
| Expert   | WebSocket + 财务数据                          |

> 完整能力矩阵见 [tickflow.org/pricing](https://tickflow.org/pricing/),高等档位含较低档全部权益。

### 数据源二:Binance(加密货币,免 key)

```ini
CRYPTO_API_BASE=https://data-api.binance.vision   # Binance 公共行情端点(api.binance.com 部分地区不可达)
CRYPTO_UNIVERSE_SIZE=300                          # 按 24h 成交额取前 N 个 USDT 现货交易对
```

加密行情全功能免 key:历史日 K、全市场 24h 实时行情、7×24 监控与回测,开箱即用,不受 TickFlow 档位限制。周期彩虹模式的 BTC 早期历史(2010-2017)由 blockchain.info 免 key 补齐。

### AI(可选)

用于自然语言生成策略、AI 四维分析与自动预测。**所有配置留空即跳过**,不影响核心功能。支持任意 OpenAI 兼容接口:

```ini
AI_PROVIDER=openai_compat              # openai_compat | ollama
AI_BASE_URL=https://api.deepseek.com/v1
AI_API_KEY=                            # 留空 = 关闭 AI
AI_MODEL=deepseek-chat
AI_DAILY_TOKEN_BUDGET=500000           # 每日 token 预算上限
```

### 服务与数据

```ini
HOST=0.0.0.0          # 监听地址
PORT=3018             # 服务端口
LOG_LEVEL=INFO        # DEBUG | INFO | WARNING | ERROR
DATA_DIR=./data       # Parquet / DuckDB 数据存储目录
```

### 访问密码

面板首次设置访问密码时,出于安全考虑**仅允许本机或内网访问**(防公网陌生人抢先设置锁死面板)。公网服务器部署有两种方式设首个密码:

1. **环境变量预置(推荐)** — 在 `.env` 填入 `AUTH_PASSWORD`,首次启动自动初始化(哈希后写入 `auth.json`,之后不再读取):
   ```ini
   AUTH_PASSWORD=你的密码    # 至少 6 位;仅首次生效,已设过则不覆盖
   ```
2. **SSH 端口转发** — 本机执行 `ssh -L 3018:127.0.0.1:3018 用户@服务器IP`,浏览器开 `http://127.0.0.1:3018` 设密码

> 详细步骤与重置密码见 [docs/deploy-password.md](./docs/deploy-password.md)。设完密码后改密码走页面 UI(`设置 → 修改密码`)。

---

## 🏗️ 技术栈

| 层           | 选型                                                                                                                |
| :----------- | :------------------------------------------------------------------------------------------------------------------ |
| **后端**     | FastAPI · Pydantic v2 · APScheduler · sse-starlette                                                                 |
| **数据**     | Polars(计算)· DuckDB(查询)· Parquet(存储)                                                                     |
| **回测**     | 纯 Polars 事件回测引擎(vectorbt 为可选遗留链路)                                                                    |
| **数据源**   | [TickFlow](https://tickflow.org/auth/register?ref=V3KDKGXPEA) 官方 SDK(美股)· Binance 公共行情(加密)· blockchain.info(BTC 早期历史) |
| **AI**(可选) | OpenAI 兼容接口(DeepSeek / 通义 / Ollama 等)· Followin MCP(可选检索智能体)                                       |
| **前端**     | React 18 · Vite · TypeScript · Tailwind · Tanstack Query · Lightweight Charts · ECharts · SVG 自绘图表 · framer-motion · react-markdown |
| **部署**     | Docker 两阶段构建,前端 dist 拷进后端镜像,**单容器**                                                                |

---

## 🗺️ 路线图

| Phase  | 内容                                                                                                | 状态 |
| :----- | :--------------------------------------------------------------------------------------------------- | :--- |
| 0-1    | 仓库骨架 · FastAPI 壳 · 能力探测 · K 线同步与分析页                                                  | ✅   |
| 2-3    | Polars enriched 流水线 · Screener · 回测(次日开盘成交/手续费/止损)                                 | ✅   |
| 4-5    | 监控引擎 · 四类监控规则 · 实时 SSE 推送 · 持久化记录                                                 | ✅   |
| 6      | 个股分析(专用日 K + 11 类关键价位 + AI 四维分析)                                                   | ✅   |
| **v2** | 美股 + 加密双市场改造 · 绿涨红跌国际配色 · Binance 免 key 数据源                                     | ✅   |
| v2.5   | 个股分析增强:周期彩虹(BTC/ETH)· AI 自动预测画线 · Followin 检索/智能体 · 持仓组合 · 盘后 AI 复盘 | ✅   |
| v3     | 加密分钟 K / WebSocket 实时流 · 点位提醒 · 更多扩展数据源 · 早晚报                                   | 🚧   |

---

## 📚 文档与贡献

- [docs/strategy-guide.md](./docs/strategy-guide.md) —— 策略开发指南(AI 生成与手写规范)
- [docs/](./docs) —— 策略构建步骤、示例

欢迎 Issue 和 PR。新增内置策略:在 `backend/app/strategy/builtin/` 参照现有文件实现 `StrategyDef`,引擎自动发现。

---

## ⚠️ 免责声明

本项目仅供**学习与量化研究**,**不构成任何投资建议**。回测结果与周期推算不代表未来收益。美股与加密货币市场波动剧烈(加密资产尤甚,7×24 无涨跌幅限制),入市需谨慎。数据准确性以数据源 TickFlow / Binance / blockchain.info 官方为准。

## 📄 License

[MIT](./LICENSE) © Tickflow-US_Stock-Crypto-panel contributors · 本项目依赖 [TickFlow](https://tickflow.org/auth/register?ref=V3KDKGXPEA) 与 Binance 公共行情提供数据服务,使用前请遵守其服务条款。

## 社区

本开源项目已链接并认可 [LINUX DO 社区](https://linux.do)。
