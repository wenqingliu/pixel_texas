# AGENTS.md — PIXEL TEXAS 开发指南

给 AI 编码代理 / 新协作者的项目工作手册。README.md 面向玩家，本文件面向改代码的人。

## 一句话

小丑牌画风的无限注德州扑克：Node.js + `ws` 服务端（唯一依赖），原生 ES Module + Canvas 前端（无构建步骤），自写测试 runner，全中文注释。

## 常用命令

```bash
npm start                        # 启动服务器（端口 3000，PORT 可覆盖）
npm test                         # 全部测试（test/run_all.js 顺序跑 5 个文件）
node test/hand.test.js           # 单跑某个测试文件
node scripts/stress.js 3 100     # 多房间压测（房间数 每房间手数）
```

改完代码跑 `npm test` 是硬性要求。CI（GitHub Actions）会在 push 时自动跑同一套测试。

## 架构地图

**服务器权威**：洗牌、评估、结算全在服务端；底牌只私发给对应连接；客户端只做表现层。

| 文件 | 职责 |
| --- | --- |
| server/index.js | HTTP 静态服务（含 /shared/ 映射）+ WS 协议入口 + 消息限流 + 退出落盘 |
| server/lobby.js | 房间注册、快速匹配、档案/进度/成就落盘、关卡解锁判定 |
| server/room.js | 座位、行动节奏（TIMING/ACTION_PACING）、快照构建、挑战关卡机、锦标赛、休息倒计时 |
| server/hand.js | 牌局状态机（下注轮/边池/摊牌）+ 规则钩子（河牌预览/加注配给/明牌手/技能牌） |
| server/evaluator.js | 打分核心 re-export 自 shared/ + crypto 洗牌 |
| server/bots/bot.js | 三档 AI（easy/normal/hard）+ 人格覆盖（station/maniac/rock）+ 对手画像 |
| server/storage.js | JSON 原子写（tmp+rename+.bak），`PT_DATA_DIR` 环境变量可隔离数据目录 |

**客户端**（纯表现层，入口 main.js）：

| 文件 | 职责 |
| --- | --- |
| client/js/main.js | 全局状态 S、WS 消息分发 onMsg/handleEv、动作表 act、主循环 tick |
| client/js/render.js | 渲染门面（re-export，main.js 的导入面，保持稳定） |
| render-core.js | 共享动画状态 anim、下注显示模型、背景、Toast |
| render-menu/table/panels.js | 主菜单+房间等待 / 牌桌 / 面板+关卡+结算 |
| cards.js avatar.js | 像素卡牌（四色）、32×32 半幅镜像头像 |
| equity.js fx.js music.js ui.js theme.js | 浏览器蒙卡 / 粒子音效 / 8-bit 音乐 / 即时模式控件 / 主题 |

**shared/（两端同源，零依赖）**：`evaluator.js`（牌型打分）、`achievements.js`（成就判定）、`levels.js`（关卡/技能牌/人格定义）。**改这三个文件 = 两端同时生效，不允许在 server/ 或 client/ 里另写一份平行实现。**

## 协议与状态同步

- WS JSON 消息，`t` 字段区分类型；`ev` 事件驱动客户端动画，`room` 全量快照做状态同步
- **快照节流**：手牌事件 150ms 窗口合并广播（room.js `_syncSoon`），常态事件即时发
- **CLIENT_EV_SKIP**（room.js）：客户端不消费的事件不发广播，新增客户端事件处理时记得从这里移出
- 私有信息（底牌/窥牌/河牌预览）只能走 per-token 的 sendTo 或快照条件字段，不能进公共广播

## 硬性约定（踩过的坑）

1. **`TIMING.ACTION_TIME / 30000` 比例因子是测试提速钩子**（server.test.js 把 ACTION_TIME 改成 400），勿删。
2. **改客户端动作动画时长必须同步调 `ACTION_PACING`**（room.js）：节拍 = 动画 ~740ms + 停顿 ≈ 1s。两边错位会出现"下家说话压上家筹码"。
3. **botDecide 新增行为分支必须同步加合法性测试**（bot.test.js 的人格对跑模式）：曾因分支引用了后面才定义的 `raiseTo`（TDZ）在线上崩溃。
4. **bot 决策调用必须 try/catch 兜底**（room.js `_botAct` 与断线托管路径）：单次决策异常降级为托管，不能杀服务器。
5. **Hand 构造参数按关卡传规则钩子**（riverPreview/openHand/raiseQuota/foldRefundSeat/splitBiasSeat），room.js startHand 是唯一组装点。
6. **过关联/休息倒计时/加注配给都要过 maybeAutoNext 与 startHand 的守卫**，防止自动开局抢跑。
7. **头像 = 半幅镜像绘制**：PATTERNS 每行 16 字符（左半），渲染时镜像补全——天然对称居中。改图案跑一次行宽校验。
8. **render.js 只做 re-export**，main.js 的导入面不要绕过门面直接引 render-*.js。
9. `data/` 不进 git；档案写入只走 storage.js（原子写+.bak），测试用 `PT_DATA_DIR` 隔离。
10. 调试钩子：页面里 `window.__S`（状态）、`__act`（动作）、`__tick`（手动驱动一帧）、`__net`（消息时序）。headless/后台标签页 rAF 会被节流，自动化测试用 `__tick` 驱动渲染。

## 测试覆盖（test/）

| 文件 | 覆盖 |
| --- | --- |
| evaluator.test.js | 7 选 5 与暴力对拍 6 万手 + 两端同源断言 |
| hand.test.js | 1500 手随机整局筹码守恒 + 边池 |
| bot.test.js | 决策合法性 + 画像生效性（统计界）+ 三人格对跑 |
| lobby.test.js | 设置钳位 / 档案清理与复活 / 成就判定 / 关卡解锁与规则钩子 / storage 原子写 |
| server.test.js | 全链路：登录→练习→匹配→顶替→重连→锦标赛→回放→档案（TIMING 提速） |

测试风格：自写 assert + 轮询等待（`until`），**禁止裸 sleep 后直接断言**。

## 发布/运维

- push 触发 CI；细粒度 GitHub token 推 `.github/workflows/` 需要勾选 **Workflows: Read and write** 权限
- 档案在服务器重启后保留（原子写），房间状态不持久化（LAN 场景可接受）
