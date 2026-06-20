# Videocut Skills

> 用 Claude Code Skills 构建的视频剪辑 Agent，专为口播视频设计

## 官方来源

本项目由 **chengfeng / AI产品自由** 原创并维护。

- GitHub: https://github.com/Agentchengfeng
- X: https://x.com/chengfeng240928
- 小红书：AI产品自由
- 公众号：AI产品自由
- B站：AI产品自由
- 抖音 / 视频号：AI产品自由

原始仓库：

```text
https://github.com/Agentchengfeng/chengfeng-videocut-skills
```

如果你使用、转载、翻译、二次发布或改造成自己的 Skill，请保留原作者和原始仓库链接。

本项目使用 **Apache License 2.0**。你可以学习、复制、修改、分发和商用，但重新分发或发布派生版本时，需要保留本仓库的 `LICENSE` 和 `NOTICE.md` 里的来源归属信息。

如果你发现有人删掉来源、换名二次发布：

1. 先保存证据：对方页面链接、截图、发布时间、下载包或 fork 记录。
2. 给对方发一句话要求补回来源：请保留 `chengfeng / AI产品自由`、原始仓库链接和 `NOTICE.md`。
3. 对方拒绝或不处理时，向平台提交版权/开源协议违规投诉，并附上本仓库链接、`LICENSE`、`NOTICE.md` 和对方删除来源的证据。
4. GitHub 上可以开 Issue / Pull Request 要求补回；明显搬运且删来源的，可以走 GitHub DMCA 或平台侵权投诉流程。

## 为什么做这个？

剪映的"智能剪口播"有两个痛点：
1. **无法理解语义**：重复说的句子、说错后纠正的内容，它识别不出来
2. **字幕质量差**：专业术语（Claude Code、MCP、API）经常识别错误

这个 Agent 用 Claude 的语义理解能力解决第一个问题，用自定义词典解决第二个问题。

## 效果演示

**输入**：19 分钟口播原片（各种口误、卡顿、重复）

**输出**：
- 自动识别 608 处问题（静音 114 + 口误/重复 494）
- 剪辑后视频 72MB
- 全程 AI 辅助，人工只需确认

## 核心功能

| 功能 | 说明 | 对比剪映 |
|------|------|----------|
| **语义理解** | AI 逐句分析，识别重说/纠正/卡顿 | 只能模式匹配 |
| **静音检测** | >0.3s 自动标记，可调阈值 | 固定阈值 |
| **重复句检测** | 相邻句开头≥5字相同 → 删前保后 | 无此功能 |
| **句内重复** | "好我们接下来好我们接下来做" → 删重复部分 | 无此功能 |
| **词典纠错** | 自定义专业术语词典 | 无此功能 |
| **自更新** | 记住你的偏好，越用越准 | 无此功能 |

## 快速开始

### 1. 安装 Skills

如果你只想复制命令，直接用 npm 安装：

```bash
npx chengfeng-videocut-skills install
```

这个 npm 包只是一个很小的安装器。执行时会从 GitHub 拉取最新仓库：

```text
https://github.com/Agentchengfeng/chengfeng-videocut-skills
```

所以后续只需要维护 GitHub，用户每次执行命令都会安装仓库里的最新 Skills。

它会把 Skills 安装到：

- `~/.claude/skills/chengfeng-videocut-skills`
- `~/.codex/skills/chengfeng-videocut-skills`

也可以只安装到 Codex：

```bash
npx chengfeng-videocut-skills install --target codex
```

如果你习惯从 GitHub 克隆，也可以用：

```bash
# 克隆到 Claude Code skills 目录
git clone https://github.com/Agentchengfeng/chengfeng-videocut-skills.git ~/.claude/skills/chengfeng-videocut-skills
```

### 2. 配置 API Key

```bash
cd ~/.claude/skills/chengfeng-videocut-skills
cp .env.example .env
# 编辑 .env，填入火山引擎 API Key
```

### 3. 安装环境

打开 Claude Code，输入：

```
/chengfeng-videocut-skills:安装
```

AI 会自动：
- 检查 Python、FFmpeg、Node.js
- 安装 FunASR（口误识别模型，约 2GB）
- 安装 Whisper large-v3（字幕模型，约 3GB）

## 使用流程

```
┌─────────────────────────────────────────────────────────┐
│  /chengfeng-videocut-skills:安装  → 首次使用，安装环境和模型 │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  /chengfeng-videocut-skills:剪口播 视频.mp4              │
│                                                         │
│  1. 提取音频 → 上传云端                                 │
│  2. 火山引擎转录 → 字级别时间戳                         │
│  3. AI 审核：静音/口误/重复/语气词                      │
│  4. 生成审核网页 → 浏览器打开                           │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  【人工审核 + 执行剪辑】                                │
│                                                         │
│  - 单击跳转播放                                         │
│  - 双击选中/取消                                        │
│  - Shift 拖动多选                                       │
│  - 确认后点击「执行剪辑」→ 自动 FFmpeg 剪辑            │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  /chengfeng-videocut-skills:字幕                         │
│                                                         │
│  - Whisper 转录                                         │
│  - 词典纠错（Claude Code → claude code）                │
│  - 人工确认 → 烧录字幕                                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  /chengfeng-videocut-skills:高清化  （可选）             │
│                                                         │
│  - 2-pass 编码 + 锐化                                   │
│  - 自动匹配原片参数，码率 1.2x                          │
│  - 像剪映一样导出高清                                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  /chengfeng-videocut-skills:自更新  （可选）             │
│                                                         │
│  告诉 AI 你的偏好，它会记住：                           │
│  - "静音阈值改成 1 秒"                                  │
│  - "保留适量嗯作为过渡"                                 │
└─────────────────────────────────────────────────────────┘
```

## Skill 清单

| Skill | 功能 | 输入 | 输出 |
|-------|------|------|------|
| `安装` | 环境准备 | 无 | 安装日志 |
| `剪口播` | 转录 + AI 审核 + 剪辑 | 视频文件 | 剪辑后视频 |
| `高清化` | 2-pass + 锐化导出 | 视频文件 | 高清视频 |
| `导入字幕` | 剪后视频直转字幕 + 推送剪映草稿（默认字号 10 / 行间距 13） | 剪后视频 + 可选原稿 | SRT + 剪映草稿 |
| `自更新` | 记录偏好 | 用户反馈 | 更新规则文件 |
| `口播成片` | 分镜核对 + 时间线预览 + 合成导出 | 视频 + 字幕 + 可选素材 | 1080x1440 竖版 MP4 |

## 目录结构

```
chengfeng-videocut-skills/
├── README.md           # 本文件
├── package.json        # npm 安装器配置
├── .npmignore          # npm 发布排除规则
├── LICENSE             # Apache-2.0 开源协议
├── NOTICE.md           # 官方来源与转载归属声明
├── CITATION.cff        # GitHub 引用信息
├── .env.example        # API Key 模板
├── bin/
│   └── cli.js          # npx 安装入口，从 GitHub 拉取最新 Skills
├── 安装/               # 环境安装 skill
├── 剪口播/             # 核心：转录 + AI 审核 + 剪辑
│   ├── SKILL.md        # 流程说明
│   ├── *.js            # 脚本（生成字幕、审核页面、服务器）
│   ├── *.sh            # 脚本（转录、剪辑）
│   └── 用户习惯/       # 审核规则（可自定义）
│       ├── 1-核心原则.md       # 删前保后
│       ├── 2-语气词检测.md     # 嗯啊呃
│       ├── 3-静音段处理.md     # >0.3s 删除
│       ├── 4-重复句检测.md     # 相邻句开头相同
│       ├── 5-卡顿词.md         # 那个那个、就是就是
│       ├── 6-句内重复检测.md   # A+中间+A 模式
│       ├── 7-连续语气词.md     # 嗯啊、啊呃
│       └── 8-重说纠正.md       # 部分重复、否定纠正
├── 导入字幕/           # 字幕生成与剪映草稿推送
│   ├── SKILL.md
│   └── scripts/
├── 高清化/             # 2-pass + 锐化导出
│   └── scripts/
│       └── hd_export.sh
├── 自更新/             # 自我进化机制
└── 口播成片/           # 分镜核对 -> 时间线预览 -> 合成
    ├── SKILL.md
    ├── templates/      # storyboard-audit.html + timeline-preview.html
    ├── references/
    └── scripts/
```

## 技术架构

```
┌──────────────────┐     ┌──────────────────┐
│   火山引擎 ASR   │────▶│  字级别时间戳    │
│  （云端转录）    │     │  subtitles.json  │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│   Claude Code    │────▶│   AI 审核结果    │
│  （语义分析）    │     │  auto_selected   │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│   审核网页       │────▶│   最终删除列表   │
│  （人工确认）    │     │  delete_segments │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│     FFmpeg       │────▶│   剪辑后视频     │
│  filter_complex  │     │   xxx_cut.mp4    │
└──────────────────┘     └──────────────────┘
```

## 依赖

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| Node.js 18+ | 运行脚本 | `brew install node` |
| FFmpeg | 音视频处理 | `brew install ffmpeg` |
| Python 3.8+ | 模型运行 | 系统自带 |
| 火山引擎 API | 语音转录 | [申请 Key](https://console.volcengine.com/) |

## 常见问题

### Q: 火山引擎转录超时？

上传音频到 uguu.se（脚本默认），不要用 catbox.moe（火山引擎访问慢）。

### Q: 审核网页打不开？

检查端口 8899 是否被占用：`lsof -i :8899`

### Q: 剪辑后音画不同步？

使用 `filter_complex + trim` 而非 `concat demuxer`，脚本已处理。

### Q: 如何添加自定义词典？

编辑 `字幕/词典.txt`，每行一个词：
```
Claude Code
MCP
API
```

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
