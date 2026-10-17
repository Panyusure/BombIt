# Agent 游玩与文件管理

- 玩游戏前阅读 `docs/CLI与Agent.md`。使用 CLI 读取状态和提交动作，正常游玩不需要写临时程序、逐步状态文件或截图。
- Agent 默认使用 `node cli/bombit.cjs serve --memory` 常驻进程；需要恢复点时显式 `checkpoint`。一串已确定动作用 `batch.steps`，相邻格路线用 `path.path`，自动走到某格用 `goTo.target`。这些请求会推进游戏，遇阵亡/换关/结算提前停止；始终消费返回的最新 `session/revision/state`。寻路不保证避开爆炸，危险路段分段观察。内存模式强杀会丢失检查点后的动作，必须正常 `finish` 或关闭 stdin 收尾。
- 开局使用 `new --agent <name>`；name 使用小写英文、数字、连字符，如 `deepseek`、`codex`。由 CLI 生成会话编号；不自创 `test1`、`final2`、`backup` 等命名。
- 正式对局结束后只长期保留 `data/replays/` 内一个标准回放：`YYYYMMDD-HHMMSS-agent-mode-character-result-id.replay.json`，北京时间。`character` 使用实际角色 ID，如 `xiaonuo`；双人对战按 P1/P2 顺序使用 `xiaonuo-vs-axiu`。不要复制或手工改名。归档后响应中的 `session` 切换为规范回放名（不含扩展名），后续命令使用这个名称；旧名仅在 `recording.sourceSession` 中追溯，不作为兼容入口。
- 胜负结算时 CLI 自动验证、归档并删除工作存档。主动中止或 agent 报错退出时必须执行 `finish --session <id> --json`；确认返回 `verified: true` 和 `replayFile`。验证失败时保留续玩存档，先排查，不得为清理而丢弃唯一记录。
- 普通命令响应在内存中消费，不要逐步落盘。确需调试时只用 `.bombit/tmp/games/<session>/`；`finish` 会清理该局的这个目录。禁止再创建 `.play/`、`.verify/` 或根目录下的零散日志、状态 JSON、临时脚本和浏览器 profile。
- 自动化测试必须使用 `.bombit/tmp/tests/<run>/`，对局和回放也隔离在其中；成功测试自动清理。失败证据排查完后清理，不混入正式回放目录。
- 可复用的 agent 源码放 `examples/`，测试源码放 `tests/`，维护工具放 `tools/`。正式素材和文档截图属于源文件，不当作垃圾删除。
- 浏览器回放缓存只使用 `.bombit/cache/browser-replays/current.js`，可覆盖、可再生成。不得为每次观看复制一份回放。
- 自定义测试目录用 `--session-dir` 或 `BOMBIT_SESSION_DIR`，其归档位于该目录的 `replays/`，用完连同测试目录一起清理。
