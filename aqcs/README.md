# aqcs/ —— 原始素材投放处

这个目录用来放**第三方原始素材**，不纳入版本库（见仓库根目录的 `.gitignore`）。

- 角色图鉴原图（`小诺.jpg`、`阿修.jpg`、`阿瑞.jpg`、`小炎.jpg`、`小天.jpg`）、`奥奇传说高清壁纸.png`、`加速鞋.png`
- 任何你准备重新抠图的角色卡

`tools/extract_characters.py` 从这里读原图，抠好、裁切好的运行期素材写进 `assets/`：

```
aqcs/小诺.jpg  --[ tools/extract_characters.py ]-->  assets/characters/xiaonuo-hd.png
```

素材取材自《奥奇传说》，仅供个人学习与娱乐使用，请勿商用盈利 —— 这也是它不随仓库分发的原因。
