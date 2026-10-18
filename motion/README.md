# BOMBIT — Motion ID / 《Q版泡泡堂》动效短片

> 48 秒 · 1920×1080 · 120 BPM · 全部由 Canvas 2D 与 Web Audio 实时生成  
> 六位精灵，三种模式，一颗炸弹。一次把平面设计、字体编排、漫画分镜和快节奏剪辑全部塞进游戏预告的尝试。

## 交付物

| 文件 | 说明 |
|---|---|
| [out/BombIt_MotionID_1080p60.mp4](out/BombIt_MotionID_1080p60.mp4) | 成片，H.264 / AAC，1920×1080，约 100 MB |
| [out/BombIt_MotionID_Poster.png](out/BombIt_MotionID_Poster.png) | 主海报，1920×1080 |
| [out/BombIt_MotionID_CoverArt.png](out/BombIt_MotionID_CoverArt.png) | 播放器封面主视觉 |
| [out/BombIt_MotionID_Storyboard.jpg](out/BombIt_MotionID_Storyboard.jpg) | 15 格分镜 / 风格板 |
| [out/BombIt_MotionID_Score.wav](out/BombIt_MotionID_Score.wav) | 原创配乐无损 WAV，48 kHz / 16-bit / Stereo |
| [index.html](index.html) | 可交互网页播放器与完整源代码入口 |

## 时间轴

| 时间 | 段落 | 内容 |
|---|---|---|
| 00:00–00:04 | 冷开场 | 引线、3-2-1、爆炸；四连海报式标题重排 |
| 00:04–00:08 | Hook | 6 / 3 / 1 数字节拍、真实对局截图拼贴、全员集结 |
| 00:08–00:10 | Roster Intro | 「认识一下你的精灵。」六条颜色轨道 |
| 00:10–00:22 | 六精灵 | 小诺、阿修、阿瑞、小炎、小天、未来，每人 2 秒、每拍换版式 |
| 00:22–00:24 | Squad | 六列角色条 + 全员就位 |
| 00:24–00:32 | 三模式 | 闯关打怪 / 计时拆砖 / 同屏对战 |
| 00:32–00:36 | 核心循环 | 放弹 → 爆炸 → 连锁 → BOOM 全屏爆炸 |
| 00:36–00:40 | BOSS | 鲁鲁旦、警告条纹、故障切片、别捣蛋 |
| 00:40–00:44 | 通灵 | 未来·通灵形态、守护灵、编辑栏切换 |
| 00:44–00:48 | 终章 | 全员开炸、主海报、END CARD |

## 观看

**最稳的方式：直接播放 `out/BombIt_MotionID_1080p60.mp4`。**

想在网页里交互观看：

1. 双击 `启动播放器.bat`（需要 Node.js；脚本会在 8188 端口起本地服务并打开页面）。
2. 或直接双击 `index.html`。直接打开时浏览器无法 fetch 预渲染配乐，会在首次播放时用 Web Audio 现场合成约 30 秒；本地服务器模式则会瞬间载入配乐。

播放器快捷键：

- `Space` 播放 / 暂停
- `←` `→` 逐帧或快退 / 快进
- `F` 全屏
- 悬停底部控制条：静音、重播、下载 MP4

## 技术说明

- **零依赖**：原生 Canvas 2D、Web Audio、原生 JavaScript，无构建步骤、无外部动效库。
- **确定性时间轴**：所有画面由 `renderAt(t)` 根据绝对时间计算；音乐每一拍与剪切点共用同一张 120 BPM 时间表。
- **图形系统**：可复用的硬阴影、描边、半调网屏、太阳纹、纸张噪点、贴纸、电视故障切片、漫画爆炸、棋盘 / 格栅、手绘角色 sticker。
- **转场**：横向百叶、虹膜、棋盘格、斜切、滑动、故障条、闪白、分屏等，全部按镜头边界配置。
- **原创配乐**：OfflineAudioContext 合成，48 秒 / 24 小节；包含 kick、snare、hats、sub bass、sidechain、合唱、铃音、fuse、impact、riser 等，最终归一化到 -1 dBFS 左右。
- **成片生成**：网页把 canvas 与音频流合成为 MediaRecorder 的 H.264/AAC MP4；录制时以音频时钟驱动画面，保证声画同步。
- **素材**：角色、敌人、对局截图来自本仓库已有的《Q版泡泡堂》素材；字体使用系统字体（HarmonyOS Sans SC / Impact / Bahnschrift / Consolas）。

## 目录

```text
motion/
├── index.html                  播放器 / 封面 / 控制条
├── style.css
├── src/
│   ├── core.js                 画布工具、字体、图案、角色缓存、BOMB
│   ├── scenes.js               冷开场、Hook、六精灵、Squad
│   ├── scenes-modes.js         模式、核心循环、BOSS、通灵、终章
│   ├── audio.js                48 秒原创配乐合成
│   └── main.js                 时间轴、转场、播放器、录制
├── out/                        成片 / 海报 / 分镜 / 配乐
└── tools/
    ├── cdp.mjs                 轻量 Edge DevTools Protocol 客户端
    ├── serve.mjs               本地静态服务器
    ├── record.mjs              录制最终 MP4 并校验
    ├── render-score.mjs        重新生成配乐 WAV
    ├── render-poster.mjs       导出海报 / 封面
    └── render-storyboard.mjs   导出分镜板
```

## 重新生成

本机安装 Edge（Chromium）与 Node.js 后：

```powershell
# 1) 启动本地服务（在仓库根目录）
node motion/tools/serve.mjs . 8173

# 2) 以远程调试方式启动 Edge
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --remote-debugging-port=9223 `
  --autoplay-policy=no-user-gesture-required `
  --user-data-dir=".bombit/cache/edge-motion" about:blank

# 3) 录制成片（会等到配乐 WAV 载入完成后开始）
$env:CDP_HTTP="http://127.0.0.1:9223"
node motion/tools/record.mjs

# 4) 重新导出海报 / 分镜 / 配乐
node motion/tools/render-poster.mjs
node motion/tools/render-storyboard.mjs
node motion/tools/render-score.mjs
```

> `record.mjs` 默认让页面以 10 Mbps 的目标码率录制，最终文件约 100 MB；画面运动以音频时钟为准，录制结束会自动下载并校验时长、分辨率、帧完整性和音频电平。

## 版权

本项目为《Q版泡泡堂 / BombIt》的非商业粉丝动效习作。角色与游戏素材版权归原权利人所有；请勿商用。所有动效、镜头、字体排版、合成配乐代码均在本仓库内，可自由阅读与学习。
