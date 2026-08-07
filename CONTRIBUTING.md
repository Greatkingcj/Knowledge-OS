# Contributing

## 开发流程

1. 从 `main` 创建功能分支。
2. 修改 `source.js`；`main.js` 是构建产物，不应手工编辑。
3. 运行 `npm ci` 和 `npm run verify`。
4. 在测试 Vault 中重载插件并完成功能验证。
5. 通过 Pull Request 合并，避免直接改写已发布标签。

## 版本发布

项目使用语义化版本：

- `manifest.json`、`package.json` 与 `versions.json` 必须保持一致。
- 每次发布都要更新 `CHANGELOG.md`。
- 发布提交使用不可变标签 `vX.Y.Z`。
- ZIP 只作为 GitHub Release 附件，不提交到 `main`。

## 隐私边界

不要提交个人 Vault、客户资料、API Key、Cookie、插件 `data.json`、`workspace.json`、缓存或同步配置。
