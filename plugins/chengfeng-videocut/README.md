# chengfeng-videocut Codex Plugin

公开入口分成两个业务入口和两个支持入口：

```text
剪口播      -> source_cut.mp4 + subtitles.srt
口播成片    -> final.mp4 + verification.json
上报 Bug    -> 脱敏草稿 -> 用户确认 -> GitHub Issue URL
检查更新    -> 官方 Marketplace 快照 -> 来源证明 -> 用户确认 -> 复读版本
```

两个业务 Skill 共用 `scripts/ensure-runtime.cjs`、`scripts/ensure-running.cjs` 和 `runtime-requirements.json`。Plugin package `0.2.1` 消费 Runtime compatibility contract `0.2.0`：只接受 Runtime 0.2.0+ 与声明的 EDL、常驻 service 能力；缺失时从精确的 `v0.2.0` Release 获取安装器和校验清单，校验后安装并执行 doctor。随后由 Product `service ensure --json` 幂等安装或恢复 macOS 用户服务；Plugin 不直接使用 `launchctl`、`nohup` 或 foreground 后台进程。Release 尚未发布、资产不完整或服务身份不匹配时安全停止，不会安装或覆盖旧 Runtime。Studio 只在人工审核状态且通过 `ensure-studio.cjs` 顶层视图能力门禁后打开。

`report-videocut-bug` 不安装 Runtime、不启动 Studio，也不改项目。它只生成脱敏 Issue 草稿，用户确认同一份正文后才调用 GitHub CLI；没有明确 Issue URL 就不宣称上报成功。

`check-videocut-updates` 的 `--inspect` 不 refresh；用户明确说检查更新后，它只对 Git Marketplace 运行官方 `codex plugin marketplace upgrade` 并比较 installed/available。本地 Marketplace 返回 `marketplace_not_refreshable`。官方 CLI 没有独立 stage：refresh 后的 snapshot 是唯一检查来源。激活前必须有 40-hex immutable commit、发布者 SHA-256 与 snapshot 内可重算的同一包清单哈希；裸 semver/tag 一律不可信。当前公开基线缺这些证明时返回 `update_metadata_untrusted`，不下载、不调用 `plugin add`。用户明确确认且传回所见 version/ref/SHA-256 后才以官方 `codex plugin add` 激活；随后必须从 installed cache 复读 version/ref/checksum 并重算 bundle inventory digest，任一不可观察或不一致即 `plugin_activation_unsupported`。失败绝不删除 cache、复制目录或更新 Runtime/项目。

Plugin 是独立的 `0.2.1` 候选版本；`runtime-requirements.json` 仍要求 Product Runtime `0.2.0`。两者不能互相替代。

`show_workflow_confirmation` 是同一插件中的 MCP App 工具，不是业务或支持 Skill；剪口播确认时，它会把 action、projectId、项目 revision、Cuts revision 与 EDL revision 一起交回当前 Codex 对话。旧入口缺少 EDL revision 时 fail-closed，不会自动追随最新版。

## 开发验证

```bash
npm install
npm run build
npm test
```

发布目录需要 `dist/server.mjs` 与 `public/`，不包含 `node_modules/`。
