# 本地对局数据

`replays/` 是正式对局唯一的长期存档目录。每局保留一个 `.replay.json`，同时包含完整动作、最终状态和校验信息；可拖入 `replay.html` 观看。

命名：`YYYYMMDD-HHMMSS-agent-mode-result-id.replay.json`。时间为北京时间、对局开始时间；agent 名只用小写英文、数字和连字符；模式为 `dig/adventure/versus`，结果为 `win/loss/draw/stopped`；最后六位用于避免重名。

例如：`20261017-213045-deepseek-adventure-win-a1b2c3.replay.json`。归档后的唯一对外名称就是文件名去掉 `.replay.json`，旧会话名只在 `recording.sourceSession` 中追溯，不能继续作为打开入口。旧档缺少开始时间时，迁移采用旧文件修改时间。

运行中的续玩数据位于 `.bombit/sessions/`，结束并验证归档后删除。临时动作探针、日志和截图只能放 `.bombit/tmp/games/<session>/`。测试文件位于 `.bombit/tmp/tests/` 并由测试自动清理。浏览器回放仅缓存一份 `.bombit/cache/browser-replays/current.js`，可再生成。

不要手工保存每一步响应、重复导出副本或把浏览器配置目录放进项目根目录。详细要求见 `docs/CLI与Agent.md`。

Agent 推荐使用 `serve --memory`：初始状态和显式 `checkpoint` 使用同一个工作存档路径，动作过程不逐步写文件。正常 `finish`、结算或 stdin EOF 后仍只留下一个规范回放；强制终止只能恢复最近检查点。
