# Q版泡泡堂 · BombIt

![version](https://img.shields.io/badge/version-v2.0-5ec8f0)

一个用 **HTML5 Canvas + 原生 JavaScript** 写的 Q 版炸弹人对战小游戏：单人闯关打怪、单人计时拆砖、双人同屏对战，共六位精灵角色、十关冒险、三张主题地图。

**零安装、零依赖、零构建、零联网** —— 整个文件夹拷到任何电脑，双击就能玩。

作者：**初霁**

**v2.0 · Agent 接入泡泡堂**：通过 CLI / JSONL 观察局面、提交动作、自动游玩；支持内存模式、批量动作与格子寻路。人类可从开始菜单右上角的「对局回放」观看 Agent 对局。详见 [v2.0 更新说明](docs/releases/v2.0.md) 与 [Agent 接入手册](docs/CLI与Agent.md)。

启动时显示真实加载进度，原始高清素材准备完成后进入菜单。

> **使用范围**：本项目仅供个人学习与娱乐使用，请勿商用盈利。角色与敌人等第三方素材的权利归原权利人所有。

> **在线游玩**：[GitHub Pages](https://panyusure.github.io/BombIt/)
>
> **下载游玩**：到 [Releases](../../releases) 下载 `BombIt-v2.0.zip`，解压后双击里面的 `启动游戏.bat` 即可。
> 也可以直接 `git clone` 本仓库，双击 `index.html` —— 两种方式都不需要安装任何东西。

![开始界面](docs/screenshot-menu.png)

---

## 怎么玩

| 方式 | 操作 |
|---|---|
| 在线玩 | 打开 [GitHub Pages](https://panyusure.github.io/BombIt/) 即可开始 |
| **推荐** | 下载解压后双击 `启动游戏.bat` |
| 直接玩 | 双击 `index.html`（Chrome / Edge） |

**操作键位**

| 模式 | 玩家 | 移动 | 放炸弹 | 技能 |
|---|---|---|---|---|
| 单人（闯关打怪 / 计时拆砖） | 1P | `↑↓←→` 或 `WASD` | `空格` | `Q` |
| 双人（同屏对战） | 1P | `↑↓←→` | `Enter` | 右 `Shift` |
| 双人（同屏对战） | 2P | `WASD` | `空格` | `F` |

其他：`Esc`/`P` 暂停　`R` 重开本局　`Tab` 切换 1P 备用键位（`IJKL`/`U`/`O`）　`M` 静音

## 玩法

- **单人 · 闯关打怪**：共 10 关，清光每关的敌人过关，第 5、10 关是鲁鲁旦 BOSS 战（三阶段：试探 / 认真 / 暴走）。
- **单人 · 计时拆砖**：限时炸掉全部障碍。
- **双人 · 同屏对战**：先得 2 分者获胜。
- 道具：火力 +1、炸弹数 +1、速度 +10%、生命果实、无敌星、护盾、推弹手套、踢弹。
- 六位精灵各有一个技能：小诺冻结、阿修突进、阿瑞护盾缠斗、小炎吸爆反弹、小天洞察加速，未来的「迁境奇点」是放弹被动（放弹 6 次或击杀 1 只即通灵，减速更强、范围更大）。

![闯关打怪](docs/screenshot-adventure.png)

## 目录结构

```
├── index.html                入口，双击即玩
├── 启动游戏.bat              游戏启动器（推荐入口）
├── 运行测试.bat              一键跑全部测试（需要 Node + Edge/Chrome）
├── assets/
│   ├── characters.js         角色素材配置
│   ├── characters/           高清角色 PNG（含背面、通灵形态）
│   ├── enemies/              小怪与 BOSS 素材
│   └── ui/                   开始界面壁纸
├── src/
│   ├── core/                 配置、随机数、输入
│   ├── game/                 地图生成、移动、规则、威胁图、敌人 AI、赛制
│   ├── render/               绘制工具、素材加载、场景与角色、HUD、特效
│   ├── audio/                音频模块
│   ├── scenes/               菜单、暂停、结算
│   └── main.js               启动 + 固定步长主循环 + 场景状态机
├── tests/
│   ├── headless.js           无头逻辑测试（Node，无需浏览器）
│   └── browser.html          浏览器测试（真实键盘事件 / 渲染 / 音频）
├── tools/                    素材提取与文档截图工具
├── docs/                     设计与使用文档、截图
└── aqcs/                     原始素材投放处（图鉴原图、壁纸原图；第三方素材，未纳入版本库）
```

## CLI 与 Agent 游玩

新增无需浏览器的 CLI，支持全部三种模式、六位角色、JSON 局面、按帧动作、自动存档和确定性回放。仅需 Node.js 18+，无需安装依赖。等待输入时游戏暂停，agent 可以从容观察和决策。

```powershell
$game = node cli/bombit.cjs new --agent codex --mode adventure --seed demo --json | ConvertFrom-Json
$session = $game.session
node cli/bombit.cjs state --session $session --json
node cli/bombit.cjs act --session $session --bomb --frames 1 --json
node cli/bombit.cjs act --session $session --move down --frames 12 --json
```

- 人在终端玩：双击 `启动CLI.bat`，或 `npm run play`。
- 运行示例 agent：`node examples/agent.cjs`，通过 JSONL 独立完成一局拆砖并验证回放。
- Agent 高速接入：`node cli/bombit.cjs serve --memory`，免去逐步落盘；`batch` 一次提交动作数组，`path` 提交相邻格路线，`goTo` 自动走到指定格。需要恢复点时用 `checkpoint`，结束时用 `finish`。
- Agent 接入协议、双人控制与存档说明：[CLI 与 Agent 使用说明](docs/CLI与Agent.md)。
- 在游戏内观看 agent 对局：点击开始菜单右上角「对局回放」，选择或拖入回放 JSON；「返回游戏」保留菜单选择。也可双击 `观看回放.bat` 打开最近一局，支持调速、进度跳转和关卡标记。
- 对局结算自动只留 `data/replays/` 中一个含 Agent、模式、实际角色与结果的规范命名回放；中止时执行 `finish --session 对局名 --json`。临时数据统一进入 `.bombit/tmp/`，测试成功自动清理。目录与命名规则见 [本地数据说明](data/README.md) 和 [Agent 约定](AGENTS.md)。

## 跑测试

```
运行测试.bat          :: 逻辑测试 + 浏览器测试（需装 Node 和 Edge/Chrome）
node tests\headless.js  :: 只跑逻辑测试
npm test              :: 逻辑测试 + CLI 测试 + agent 完整通关
npm run test:browser   :: 浏览器测试
```

无头逻辑测试覆盖地图生成与连通性、爆炸与连锁、敌人 AI、威胁图、移动手感、赛制判定、技能与通灵等；浏览器测试覆盖键位表、真实键盘与鼠标事件、场景状态机、渲染与缩放、运行期零报错。

## 文档

- [使用说明](docs/使用说明.md) —— 键位、模式、道具、技能、常见问题
- [设计方案](docs/设计方案.md) —— 技术选型、架构、数值与美术流水线
- [技能与场景](docs/技能与场景.md) · [敌人与BOSS](docs/敌人与BOSS.md) · [角色背景与文案](docs/角色背景与文案.md)

## 说明

游戏代码为原生 JavaScript，无任何第三方库。角色与敌人美术取材自《奥奇传说》并做了抠图与重制，相关权利归原权利人所有。本项目仅供个人学习与娱乐使用，请勿商用盈利。
