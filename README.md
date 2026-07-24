# chengfeng-videocut

给 Codex 用的中文口播剪辑 Marketplace 插件。

公开入口由两个业务入口和一个支持入口组成：

```text
剪口播      -> source_cut.mp4 + subtitles.srt
口播成片    -> final.mp4 + verification.json
上报 Bug    -> 脱敏草稿 -> 用户确认 -> GitHub Issue URL
```

插件不复制剪辑产品本体。两个业务 Skill 负责判断和编排，确定性动作由 `chengfeng-videocut` Runtime 的 CLI / API 执行；只有进入人工审核阶段且 Studio 能力匹配时才打开界面。Bug 支持 Skill 不安装 Runtime、不启动 Studio，也不改项目。

## 安装

发布后用 GitHub-direct npx thin bootstrap 添加 Codex Marketplace。把下列占位符替换为该 bootstrap 已公开的 **40 位 Git commit**；不能使用 `main`、tag 或 `latest`：

```bash
npx -y github:Agentchengfeng/chengfeng-videocut-skills#<published-40hex-bootstrap-commit> install
```

bootstrap 只调用 Codex 官方 `plugin marketplace add --ref <40hex>` 与 `plugin add`，随后做只读回查；它不复制 Skill 文件，也不会安装、升级、启动或修改 Product Runtime。命令 pin 的 bootstrap commit B 与 manifest pin 的 Plugin commit P 是两份独立身份：npm/GitHub tarball 不需要也不会读取自身 `.git`。Marketplace add 后，bootstrap 只会读取 Codex 创建的 marketplace clone，并要求其 `origin` 严格等于固定 GitHub source、`HEAD` 严格等于 P；任一身份无法证明时以 `marketplace_identity_unverified` 停在 Plugin activation 前。发布前该命令故意不可用，避免把本地 `0.2.1` candidate 当作公开包。

可先查看拟调用命令或诊断身份（均不安装 Runtime）：

```bash
npx -y github:Agentchengfeng/chengfeng-videocut-skills#<published-40hex-bootstrap-commit> install --dry-run
npx -y github:Agentchengfeng/chengfeng-videocut-skills#<published-40hex-bootstrap-commit> doctor
```

安装插件后，第一次使用任一业务 Skill 时会先检测产品 Runtime：

```text
doctor
  |
  +-- ready --------------------> 继续当前 Skill
  |
  +-- missing
  |      |
  |      +--> 提示一句安装状态
  |      +--> GitHub Release
  |      +--> SHA-256 校验
  |      +--> 安装后 doctor
  |      +--> 继续当前 Skill
  |
  +-- unhealthy / failed -------> 停止；不覆盖；不打开 Studio
```

Runtime 默认安装到：

```text
~/.chengfeng-videocut
```

Plugin 0.2.0 的产品合同固定为 `v0.2.0` Release、Runtime 0.2.0+ EDL 与用户级常驻 service 能力，以及 Studio 的三个顶层视图与 `managedTimelineEditing=true`。首次安装会从这个精确 Release 下载 `install.sh` 和 `SHA256SUMS.txt`，先验证安装器，再让安装器读取同一个 Release 的产品包；不使用会漂移的 `latest`。Release 不存在、资产不全、哈希不匹配或已有 Runtime 不兼容时均停止，不覆盖现有安装，也不回退 v0.1.1。

每个业务流程在第一次产品 API 前、每次人工审核恢复前都会执行共享 `ensure-running`：

```text
Skill -> Product service ensure -> launchd service ready -> 继续当前流程
                           |
                           +-> identity / port conflict -> 停止，不回退 foreground
```

服务由 Product 管理；Plugin 不直接运行 `launchctl`、`nohup`，也不会把 Codex 当前终端当作 Studio Server 的生命周期所有者。

## 使用

剪口播：

```text
使用“剪口播”处理这条视频。识别口误，等我审核后再物理剪切，并生成剪后字幕。
```

技术 ID：`chengfeng-videocut:cut-talking-head`。

口播成片：

```text
使用“口播成片”把这个项目的剪后视频和字幕做成完整成片。分镜、动画和时间线分别给我审核。
```

技术 ID：`chengfeng-videocut:finish-talking-head`。

直接要求“口播成片”但缺少基础素材包时，Codex 会在同一个任务和 `projectId` 内先补完剪口播，不需要第三个“口播工作台”入口。

上报 Bug：

```text
使用“上报 Bug”整理刚才的问题。先给我看脱敏后的 GitHub Issue 草稿，确认后再提交。
```

技术 ID：`chengfeng-videocut:report-videocut-bug`。它会固定路由到产品或 Skills 仓库、清理常见密钥与本地路径、用脱敏内容指纹查重，并且只在用户确认同一份草稿后提交。

## 架构

```text
Codex
  |
  +-- cut-talking-head
  +-- finish-talking-head
  +-- report-videocut-bug (支持入口)
  +-- show_workflow_confirmation (MCP App)
  |
  v
shared ensure-runtime
  |
  v
GitHub Release Runtime
  |
  +-- service ensure -> macOS user service
  +-- CLI / API
  +-- project truth + revision / CAS
  +-- media cut / render / verify
  +-- Studio（只在 review-ready 时打开）
```

确认卡不是独立 Skill。它只把白名单 action、`projectId` 与 revision 交回当前 Codex 对话；卡片本身不执行剪切或导出。

## 仓库结构

```text
chengfeng-videocut-skills/
├── .agents/plugins/marketplace.json
├── plugins/chengfeng-videocut/
│   ├── .codex-plugin/plugin.json
│   ├── .mcp.json
│   ├── runtime-requirements.json
│   ├── dist/server.mjs
│   ├── public/review-confirm.html
│   ├── scripts/
│   ├── references/
│   └── skills/
│       ├── cut-talking-head/
│       ├── finish-talking-head/
│       └── report-videocut-bug/
├── LICENSE
├── NOTICE.md
└── CITATION.cff
```

发布插件包含约 1.1MB 的预打包 MCP Server，不包含 `node_modules`。

## 发布边界

公开 Runtime v0.1.1 不满足 Plugin 0.2.0 的合同，不能再作为自动安装目标。发布顺序必须是：

```text
Runtime v0.2.0 Release
  -> install.sh 与产品包进入 SHA256SUMS
  -> 隔离环境首次安装 / doctor / Studio capability / 两条工作流 E2E
  -> Plugin 0.2.0 Marketplace 发布
```

在 Runtime v0.2.0 补齐云端 transcribe/import、内置 renderer 并完成真实项目 E2E 前，不把“两条工作流已经完全自动化”作为公开承诺。

## 开发验证

```bash
cd plugins/chengfeng-videocut
npm install
npm run build
npm test
```

另外运行 Skill validator、Plugin validator，并在隔离 Codex 任务中确认发现两个业务 Skill 和一个 Bug 支持 Skill。

## 官方来源

本项目由 **chengfeng / AI产品自由** 原创并维护。

```text
GitHub: Agentchengfeng
X: chengfeng240928
小红书 / 公众号 / B站 / 抖音 / 视频号: AI产品自由
```

原始仓库：<https://github.com/Agentchengfeng/chengfeng-videocut-skills>

## 协议

本项目使用 Apache License 2.0。转载、翻译、二次发布或改造时，请保留原作者、原始仓库链接、`LICENSE` 和 `NOTICE.md`。
