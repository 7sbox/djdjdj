# 仓库协作与权限

仓库：`7sbox/djdjdj`（公开仓库，默认分支 `main`）。

## 协作者

| GitHub 用户 | 角色 | 权限 | 能做什么 |
| --- | --- | --- | --- |
| `7sbox` | Owner | `admin` | 一切，包括改仓库设置、管理协作者、绕过分支保护直接推 `main` |
| `tikisky` | Collaborator | `write` | 读写代码、推特性分支、开 PR、读写议题；**不能**改仓库设置或删仓库 |

`write` 是最小可用档：够写代码，不够动仓库骨架。需要升级到 `maintain`（管标签、议题和多数设置）或 `admin`（完全控制）时，由 Owner 显式决定。

## 分支保护：`main`

`main` 已开启保护，对外部协作者构成硬约束：

- **必须走 PR**：不能直接推 `main`。
- **至少 1 个批准**：PR 需要 reviewer 批准才能合并；`dismiss_stale_reviews` 已开，新提交会作废旧批准。
- **会话必须解决**：所有 review 评论要标为 resolved。
- **禁止强推、禁止删分支**：`allow_force_pushes` 与 `allow_deletions` 均为 `false`。
- **Owner 不受约束**：`enforce_admins` 为 `false`，`7sbox` 仍可直接推 `main`。

PR 作者不能批准自己的 PR，所以 `tikisky` 的 PR 需要 `7sbox` 来批准。

## 邀请协作者

邀请 `tikisky` 用 `push` 权限：

```bash
gh api -X PUT repos/7sbox/djdjdj/collaborators/tikisky -f permission=push
```

- 邀请**7 天后过期**，过期重跑同一条命令即可。
- 对方在接受前状态是 `pending`：<https://github.com/7sbox/djdjdj/invitations>
- 查看待接受邀请：`gh api repos/7sbox/djdjdj/invitations --jq '.[] | {login: .invitee.login, permissions}'`
- 查看已有协作者：`gh api repos/7sbox/djdjdj/collaborators --jq '.[] | {login: .login, permissions}'`

## 调整分支保护

看当前设置：

```bash
gh api repos/7sbox/djdjdj/branches/main/protection --jq \
  '{force: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled, reviews: .required_pull_request_reviews.required_approving_review_count}'
```

改设置时把 JSON 写进文件再 `--input` 传入。**必须写无 BOM 的 UTF-8**，否则 GitHub 返回 `Problems parsing JSON (HTTP 400)`：

```bash
gh api -X PUT repos/7sbox/djdjdj/branches/main/protection --input bp.json
```

## 凭据

推送用各人自己的 GitHub 凭据或 PAT，不要共享 token。Owner 的 `gh` token 只授予了 `gist`、`read:org`、`repo`、`workflow`：邀请个人协作者够用，涉及组织级操作（`admin:org`）时要重新授权。
