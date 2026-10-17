# BombIt CLI 与 Agent 使用说明

CLI 与浏览器共用游戏内核，包含拆砖、十关冒险（含 BOSS）、双人对战和六位角色。仅需 Node.js 18 或更新版本，无需安装依赖，也无需启动浏览器或联网。

## 快速开始

在项目目录执行：

```powershell
$game = node cli/bombit.cjs new --agent deepseek --mode adventure --character xiaonuo --seed demo --json | ConvertFrom-Json
$session = $game.session
node cli/bombit.cjs state --session $session --json
node cli/bombit.cjs act --session $session --bomb --frames 1 --json
node cli/bombit.cjs act --session $session --move down --frames 12 --json
node cli/bombit.cjs act --session $session --wait --frames 60 --json
```

`new` 创建并自动保存对局。`state` 观察局面。`act/batch/path/goTo` 消耗游戏时间；思考和读取状态均不会让炸弹倒计时前进。普通磁盘模式下，每条命令都可以在独立进程中执行；Agent 推荐下面的长连接内存模式。

省略 `--json` 会显示带坐标的字符地图。`new --agent NAME` 自动生成规范会话编号，正式开局不得手填 `--session`。进行中的存档位于 `.bombit/sessions/`；结算时自动验证并归档到 `data/replays/`，删除工作存档。归档响应中的 `session` 切换为规范回放名（文件名去掉 `.replay.json`）；后续查看、校验或观看使用返回的新名称。旧名仅保存在 `recording.sourceSession` 元数据中，不能再作为兼容入口。

## 文件路径与命名规范（Agent 必须遵守）

所有路径相对于项目根目录 `E:\BombIt`：

| 路径 | 用途与保留规则 |
|---|---|
| `data/replays/` | 唯一长期对局档案；每局只留一个标准 `.replay.json` |
| `.bombit/sessions/` | 进行中的续玩状态；归档成功后自动删除 |
| `.bombit/tmp/games/<session>/` | 确有必要的单局调试文件；`finish` 自动删除 |
| `.bombit/tmp/tests/<run>/` | 测试用会话、回放、浏览器 profile、日志；成功测试自动清理 |
| `.bombit/cache/browser-replays/current.js` | 浏览器只缓存最近一次观看的回放，可覆盖、可再生成 |
| `examples/`、`tests/`、`tools/` | 可复用的 agent、测试与维护源码，不是运行时产物 |

正式回放统一命名为 `YYYYMMDD-HHMMSS-agent-mode-result-id.replay.json`：

- 时间使用北京时间、对局开始时间。旧档迁移若缺少开始时间，采用旧文件修改时间，并在文件内保留原会话编号。
- `agent` 用小写英文、数字、连字符，例如 `deepseek`、`codex`、`reference`。开局通过 `--agent` 提供，由程序生成会话与回放名称，不自创 `test1/final2/backup` 名称。
- `mode` 为 `dig/adventure/versus`；`result` 为 `win/loss/draw/stopped`；最后六位 ID 防止同秒重名。
- 例：`20261017-213045-deepseek-adventure-win-a1b2c3.replay.json`。不要手工改名或复制第二份。

正常游玩只消费命令返回的数据，不把每一步状态写成 JSON、日志或文本；不要每次观看都另存回放。禁止向项目根目录、`.play/`、`.verify/` 散放临时脚本、截图、状态和浏览器配置。

每局无论输赢都必须收尾。正常结算自动归档；主动中止、策略报错或测试到一半退出时执行：

```powershell
node cli/bombit.cjs finish --session $session --json
```

确认返回 `verified: true`、`archived: true` 和 `replayFile`，并把会话变量更新为返回的规范 `session`。使用这个新名称可重复调用收尾；验证失败时保留工作存档供修复，不删除唯一记录。归档包含最终状态和追溯元数据，浏览器观看与命令校验都不需要原工作存档。

测试必须用 `--session-dir PATH` 或 `BOMBIT_SESSION_DIR` 指向本次测试目录。自定义目录的回放写入其 `replays/` 子目录，测试结束一起清理，不能混入正式档案。浏览器测试失败时证据仅暂存在本次测试目录，修复完成后删除。

人类交互入口：双击 `启动CLI.bat`，或执行 `npm run play`。输入 `w/a/s/d [帧数]` 移动，`b` 放弹，`q` 技能，`wait [帧数]` 等待，`look` 观察，`new [dig|adventure|versus]` 新开一局，`quit` 保存退出。新开局保留旧存档。该入口同样在等待输入时暂停。

## 给 Agent 的最小操作约定

1. 执行 `node cli/bombit.cjs rules --json` 阅读角色、技能和规则。
2. 用 `new --agent NAME` 创建唯一会话；保存响应中的 `session` 与 `revision`。
3. 读取 `state.players`、`map.terrain`、`bombs`、`flames`、`poison`，选择动作。
4. 调用 `act`、`batch`、`path` 或 `goTo`；使用返回的最新状态继续，直到 `state.match.over` 为 `true`。
5. 结束或中止时执行 `finish --session ID --json`，确认唯一回放已验证归档，清理该局临时文件。

角色 ID：`xiaonuo`（小诺）、`axiu`（阿修）、`arui`（阿瑞）、`xiaoyan`（小炎）、`xiaotian`（小天）、`weilai`（未来）。未来的技能为放弹被动，不能主动施放。

模式：`dig` 在 180 秒内炸光软砖；`adventure` 清空十关敌人，第 5、10 关有 BOSS；`versus` 是两个外部控制的玩家，先到 2 分获胜。冒险介绍自动确认，换关事件仍会返回。对战不自动补 AI，未提供动作的玩家原地等待。

玩家、小怪与 BOSS 的炸弹统一为 2.4 秒引信，不随火力变化；连锁可提前引爆，小诺时停仍会暂停敌方炸弹。工厂传送带运送玩家、敌人、BOSS 和炸弹；木马环道运送停下的角色与怪物，自主行走时可以离开。只有玩家可获得绕圈护盾。

## 动作与时间

```powershell
node cli/bombit.cjs act --session $session --move right --frames 12 --json
node cli/bombit.cjs act --session $session --skill --frames 1 --json
```

- 世界按 60 帧/秒推进；默认 12 帧，可选整数 1～60 帧。
- `--move` 可取 `up/down/left/right/none`，持续指定帧数；保留像素级移动和碰撞。
- `--bomb` 和 `--skill` 只在第一帧各尝试一次。与移动组合时，第一帧顺序为移动、技能、放弹。想在当前位置放弹，应先单独放弹，再移动。
- `--wait` 不可与移动、放弹或技能组合。
- 每个请求结束即松开输入。基础速度每 12 帧约移动 0.92 格，并非恰好一格；接近路口时用精确位置和更短动作调整。
- 撞墙、炸弹额度不足、技能冷却等会消耗正常时间，并通过事件报告。无效参数不会保存或推进。
- 遇到玩家死亡、进入新关、新回合或整局结束会提前返回，实际推进量看 `advancedFrames`。
- `onDeath` 后若仍有生命，继续 `wait` 等待重生。整局结束后 `act` 推进 0 帧。

双人同时控制时，把双方输入放进同一请求，世界只推进一次：

```powershell
$duel = node cli/bombit.cjs new --agent codex --mode versus --character arui --character2 weilai --seed duel --json | ConvertFrom-Json
node cli/bombit.cjs act --session $duel.session --actions '{"p1":{"move":"right","bomb":true},"p2":{"move":"left"}}' --frames 12 --json
```

只控制一个玩家可用 `--player p2`。双方 agent 应先各自决策，再由一个协调者提交联合动作。

## JSON 协议

成功响应具有 `ok: true`、`session`、`revision`、`state`。动作额外返回 `advancedFrames`、`stopReason`、`events`。协议版本为 `state.protocol: "bombit/1"`。

| 字段 | 含义 |
|---|---|
| `frame` | 整局累计帧数，换关时不归零 |
| `time` | 当前关卡/回合内秒数，换场归零 |
| `phase` | `playing / level_clear / round_end / finished` |
| `map.terrain` | 每行一个字符串：`#` 硬墙、`+` 软砖、`.` 空地 |
| `map.landmark` | 场景设施与运动轨道；工厂会运送人和炸弹，公园可运送等待中的玩家 |
| `players` | 精确位置、格坐标、生命、炸弹额度、实际速度、技能冷却、护盾与状态 |
| `enemies` | 类型、血量、BOSS 阶段、位置、投弹前摇，不含内部寻路计划 |
| `bombs` | 格坐标、实际位置、引信秒数、火力、归属、滑行和可穿越状态 |
| `flames` | 火焰覆盖格与剩余秒数 |
| `poison` | `c/r` 落点、`warn` 预警秒数、`life` 有效持续秒数 |
| `items` | 已掉落道具，不含砖内未来掉落 |
| `match` | 关卡、回合、比分、胜者和结束状态；`remaining` 用于拆砖/对战计时 |

所有坐标以左上角为原点，列向右、行向下，从 0 开始。每格 48 像素，格中心为 `((col+0.5)*48, (row+0.5)*48)`。文本地图列标签使用十六进制，JSON 坐标为普通数值。

可对 `new/state/act/replay` 添加 `--assist` 获取 `assist.dangerWindows`：每格未来危险区间 `[开始秒数, 结束秒数]`，时间相对于当前局面，包含当前火焰与当前炸弹的连锁预测。移动炸弹采用保守范围；未来新炸弹、地形变化和毒区应另外考虑。它不是安全保证。

主要事件：`bomb_action`、`skill_action` 带 `success/reason`；`blocked` 表示动作第一帧被挡；`onExplode`、`onDeath`、`respawn`、`onEnemyDeath`、`onBossPhase`、`onPickup`、`level_started`、`round_started`、`match_over` 描述玩法变化。`onSkill` 也用于被动觉醒与反弹提示。

## 重试、并发与错误

```powershell
node cli/bombit.cjs act --session $session --move right --frames 12 --request-id step-001 --expect-revision 0 --json
```

每个实际推进的底层动作使 `revision` 增加 1。`batch/path/goTo` 一次请求可能推进多个动作，以返回的 `revision` 为准。`--expect-revision` 不匹配返回 `REVISION_CONFLICT`，应重新观察再决策。

同一 `request-id` 和相同动作重试不会再次推进：如果是最近一次动作，返回原响应并带 `duplicate: true`；更早的动作返回 `ALREADY_APPLIED`。同一编号对应不同动作返回 `REQUEST_ID_CONFLICT`。

保存使用文件锁和原子替换；同一会话正在操作时返回 `SESSION_BUSY`。若运行进程被强制结束并留下 `.lock`，确认该进程已退出后再删除对应锁文件。

失败响应为 `{"ok":false,"error":{"code":"...","message":"..."}}`。单次命令失败退出码为 1，成功为 0。常见错误还有 `SESSION_NOT_FOUND`、`SESSION_EXISTS`、`INVALID_FRAMES`、`INVALID_MOVE`、`INVALID_CHARACTER`。日志不混入 JSON 标准输出。

## 长连接 JSONL

Agent 推荐启动 **`node cli/bombit.cjs serve --memory`**，通过标准输入每行提交一个 JSON，标准输出每行返回一个 JSON。不需要 HTTP 服务、端口或特殊工具插件；逐行错误不会终止后续处理。省略 `--memory` 则继续使用每请求保存的磁盘模式。

内存模式在开局写入初始检查点，随后把局面、动作历史保留在常驻进程里，不逐步加锁或重写会话文件。首次接管对局时加一次锁，直到归档或进程正常退出时释放；其他进程不能并发修改。所有观察和动作应通过同一个进程提交，外部读取工作文件只能看到最近检查点。

需要中途恢复保障时，提交 `{"op":"checkpoint","session":"SESSION_ID"}`，会原子保存当前状态，不推进时间。内存模式被强杀、断电时，最近检查点之后的动作会丢失；不要每步检查点而抵消性能收益。使用 `finish` 明确收尾；输入 EOF 或可捕获的 SIGINT/SIGTERM 也会自动验证归档所有接管的对局，收尾路径写入 stderr，stdout 始终保持一请求一响应。系统硬终止（含 Windows 强制结束进程）不触发收尾。验证失败则保留最新工作存档。硬终止留下的锁按前述规则处理。

```json
{"op":"new","agent":"deepseek","mode":"dig","seed":"agent-demo-3","character":"arui"}
{"op":"state","session":"SESSION_ID","assist":true}
{"op":"act","session":"SESSION_ID","bomb":true,"frames":1,"requestId":"a1","expectRevision":0}
{"op":"act","session":"SESSION_ID","move":"down","frames":12}
{"op":"finish","session":"SESSION_ID"}
```

可用操作：`new/state/act/batch/path/goTo/checkpoint/rules/replay/export/finish`。JSON 字段采用驼峰，例如 `requestId`、`expectRevision`、`character2`。开局传 `agent` 标识操作者，省略 `session` 让程序命名。同时控制双方使用 `actions: {"p1": {...}, "p2": {...}}`。不要同时传 `actions` 和单人动作字段。

上例中的 `SESSION_ID` 是占位符，应替换为上一次响应中的 `session`；归档后的响应会返回规范回放名，继续更新这个变量。

## 一次提交多步与走到指定格

批量执行 1～1024 个原有动作，所有参数先验证，磁盘模式也只在整批结束后保存一次：

```json
{"op":"batch","session":"SESSION_ID","steps":[{"bomb":true,"frames":1},{"move":"down","frames":13},{"move":"right","frames":13}],"requestId":"escape-1","expectRevision":0}
```

每步接受 `frames/player/move/bomb/skill/wait/actions`，仍然是 1～60 帧；放弹、技能只在各步第一帧触发。返回最终 `state`、整段 `advancedFrames/events` 和实际执行的 `completedActions`。遇到阵亡、换关、换回合或结算，立即停下，余下动作不执行；`completedActions` 包含提前停止的最后一步。普通撞墙会报告事件，批量仍按给定脚本继续。安全撤离需要自己规划。

提供相邻格路径，或让 CLI 在当前可行走地图上做最短路：

```json
{"op":"path","session":"SESSION_ID","path":[[1,1],[1,2],[2,2]],"player":"p1","maxFrames":600,"requestId":"route-1"}
{"op":"goTo","session":"SESSION_ID","target":[2,2],"maxFrames":600,"requestId":"route-2"}
```

坐标都是 `[列,行]`。`path` 最多 256 个点，首点是当前格或相邻格，后续点必须上下左右相邻；允许重复当前格以先回到中心。`goTo` 自动绕开当前硬墙、软砖与阻挡炸弹。两者依据实时速度与位置移动，走到格中心附近（误差约半帧位移），不会瞬移，也不需要调用方换算走一格的帧数。其他玩家保持等待，不自动放弹或施放技能。

响应额外包含 `reached`、`plannedPath`、`completedWaypoints`；`stopReason` 为 `path_complete/blocked/frame_limit/dead` 或原有中断事件。默认最多 3600 帧，可用 `maxFrames` 设置 1～3600。无效或开局不可达路径不推进时间；路途中出现动态障碍、传送带偏移等情况可能提前停下。**寻路不预测火焰、毒区或敌人未来投弹，也不保证安全**；危险局面应分短段移动并重新观察。

以上操作均支持 `requestId/expectRevision/assist`，重试整段不会重复执行。路径和批量会展开成原有动作存入同一份标准回放，浏览器无需升级回放格式。也能用独立命令调用：

```powershell
node cli/bombit.cjs batch --session $session --steps '[{"move":"down","frames":13},{"move":"right","frames":13}]' --json
node cli/bombit.cjs path --session $session --path '[[1,1],[1,2],[2,2]]' --max-frames 600 --json
node cli/bombit.cjs goTo --session $session --target '[2,2]' --json
```

内存模式和批量可以叠加使用。用真实完整回放测量本机吞吐（含启动和最终校验归档），测试产物自动清理：

```powershell
node tools/benchmark-cli.cjs data/replays/你的标准回放文件.replay.json
```

2026-10-17 在本机用 DeepSeek 十关通关记录的全部 3231 步实测，包含进程启动、完整回放校验与最终归档；四种模式最终哈希一致：

| 模式 | 动作请求数 | 总耗时 |
|---|---:|---:|
| 磁盘模式逐步 `act`（长连接） | 3231 | 23.75 秒 |
| 内存模式逐步 `act` | 3231 | 5.48 秒 |
| 磁盘模式 `batch` | 15 | 5.30 秒 |
| 内存模式 `batch` | 15 | 5.07 秒 |

该端到端基准提升约 4.7 倍；耗时也包含游戏模拟和最终重演校验，不只是文件写入。不同电脑和调用方式的收益会不同。

## 可运行的示例 Agent 与回放

### 在浏览器观看

游戏开始菜单右上角点击 **「对局回放」**，在游戏内打开播放器，选择或拖入 `data/replays/` 中的标准回放。观看后点击「返回游戏」或按 Esc，回到原来的模式与角色选择。GitHub Pages 在线版也支持选择本机回放，文件不会上传。

双击项目里的 **`观看回放.bat`**，默认打开最近归档的一局；不再硬编码旧会话名。观看指定对局：

```powershell
node cli/watch.cjs --session YOUR_SESSION
node cli/watch.cjs --file data/replays/你的标准回放文件.replay.json
```

也可以直接双击 **`replay.html`**，点击「打开回放文件」或拖入 JSON。支持原始 `.replay.json`、CLI `export` 的完整 JSON 响应，以及 `.bombit/sessions/` 中含完整动作记录的会话 JSON。文件只在本机读取，无需联网或启动服务器。

播放器复用游戏中的素材和场景画面，逐动作校验通过后可播放；支持暂停、0.25～16 倍速度、逐帧、下一步动作、前后 5 秒和任意进度拖动。右侧关卡与阵亡标记可直接跳转。显示的总时间是整局累计帧数除以 60，换关不会归零；跳转时会重新生成目标帧的实际局面。播放过程不会写入或推进原存档。

如果加载提示规则版本或某一步校验失败，需要使用与录制时一致的游戏代码；播放器不会忽略差异继续展示错误对局。回放仅支持观看，键盘方向键用于跳转，不能改变 agent 的操作。

### 自动游玩与命令校验

```powershell
node examples/agent.cjs
```

示例只通过 CLI 的 JSONL 观察与行动：寻找能炸砖的位置、规划撤离路线、放弹、避开爆炸、等待，再重复。默认使用固定森林种子 `agent-demo-3`，便于复验；它是拆砖基线策略，不保证任意地图或其他玩法通关。会话由程序规范命名，用 `--seed TEXT` 尝试其他地图。

已验证默认种子从 69 块砖开始，在 143.87 秒清空，770 次动作，零死亡，最终保留 4 条生命。示例会自动验证、收尾，仅保留 `data/replays/` 中一份标准命名回放；文件路径见输出的 `file=`。

```powershell
node cli/bombit.cjs replay --session 返回的规范回放名 --json
node cli/bombit.cjs replay --file data/replays/你的标准回放文件.replay.json --json
```

`finish` 自动生成的标准回放可以直接移到其他电脑用 `replay --file` 校验或拖入浏览器；需要相同引擎版本。`export` 仅供集成程序在内存中取出数据，日常游玩不要另存重复副本。回放操作只重演与验证，不覆盖存档。

当前引擎版本为 `2`（统一敌我引信并加入敌人场景运送）。版本 `1` 的存档和回放不会混入新规则，需要新开会话；原文件保留。

## 开发与验证

```powershell
npm test
npm run test:browser
```

前者运行原有 953 项逻辑检查和 CLI 集成测试（含一次完整 agent 通关）；后者运行真实 Edge/Chrome 的浏览器检查。可用 `BOMBIT_BROWSER` 指定浏览器路径。受限测试环境可显式执行 `node tests/run-browser.cjs --in-process`。

核心文件：`src/game/engine.js` 统一推进；`snapshot.js` 保存随机流、共享对象引用与地图附加属性；`observation.js` 输出公开局面；`cli/session.cjs` 管理会话、并发与回放；`examples/agent.cjs` 演示独立控制端。
