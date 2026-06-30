# Test Execution Guide：一点运动微信打卡小程序 v1.0

- 文档版本：v0.2.0
- 最后更新日期：2026-06-26
- 适用范围：Implementation 后的微信开发者工具、云开发控制台和微信端体验版测试

## 1. 本地验证

在项目根目录执行：

```powershell
Get-ChildItem -Recurse -File -Include *.js -Path '.\cloudfunctions\yidianApi','.\program' | ForEach-Object { node --check $_.FullName }
node '.\cloudfunctions\test-stats.js'
```

通过标准：

- 所有 JS 文件语法检查无输出且退出码为 0。
- `test-stats.js` 输出所有统计测试通过。

## 2. 微信开发者工具配置

1. 打开微信开发者工具。
2. 导入项目根目录：`D:\codex project\一点运动`。
3. 确认 `project.config.json` 中 `miniprogramRoot` 为 `program/`、`cloudfunctionRoot` 为 `cloudfunctions/`。
4. 在“云开发”中选择正确环境。

## 3. 云开发数据库准备

在云开发控制台创建以下集合：

- `users`
- `groups`
- `memberships`
- `targetConfigs`
- `checkinRecords`
- `archiveSnapshots`
- `archiveMemberSnapshots`
- `auditLogs`

索引按 `cloudfunctions/database.schema.json` 配置。

## 4. 部署云函数

1. 在微信开发者工具文件树中右键 `cloudfunctions/yidianApi`。
2. 选择“上传并部署：云端安装依赖”。
3. 部署完成后，在云开发控制台确认 `yidianApi` 云函数存在。
4. 进入 `yidianApi` 的函数配置，将云函数超时时间设置为 30 秒；不得使用默认 3 秒配置。
5. 如需定时归档，在云函数触发器中配置 `monthlyGroupStatusTransition`，建议每月 1 日凌晨执行。

## 5. 主流程手动测试

### 5.1 创建与加入

1. 创建本月小组，验证 `groups.status=active`。
2. 创建下月小组，验证 `groups.status=upcoming`。
3. 使用邀请码加入小组，验证生成或恢复 `active` membership。
4. 验证 `removed` 成员不可重入，`exited` 成员可重入且 activePeriodSeq 递增。

### 5.2 目标设置

1. 选择 7 种目标中的任意组合，至少覆盖一次骑行距离。
2. 填写目标值和一点币。
3. 验证 active 小组首次保存后为 `locked`，upcoming 小组保存后为 `set`。
4. 验证非法目标值被拒绝。

### 5.3 打卡与补卡

1. 按目标类型填写必需运动字段。
2. 上传 1 至 3 张静态图片。
3. 验证打卡 `sportDate` 为今天，补卡只允许昨日或前天。
4. 验证缺少照片、备注超长、缺少目标依赖字段均被拒绝。
5. 验证每日 3 次补卡和同运动日期 5 条物理有效记录上限。

### 5.4 查看、统计与管理

1. 小组详情页查看 active 成员目标和统计摘要。
2. 成员目标详情验证 7 种目标统计口径。
3. 创建者管理页验证改名、转让、移除、退出、解散。
4. 验证敏感操作二次确认并写入 `auditLogs`。

## 6. 归档专项测试

手动触发归档：

```json
{
  "domain": "systemJob",
  "action": "archiveExpiredGroups"
}
```

通过标准：

- 过期 active 小组变为 `archived`。
- 生成 `archiveSnapshots` 和 `archiveMemberSnapshots`。
- `set` targetConfig 被锁定为 `locked`。
- 写入 `GROUP_ARCHIVE` 审计日志。

手动触发 upcoming 激活：

```json
{
  "domain": "systemJob",
  "action": "activateUpcomingGroups"
}
```

通过标准：

- 到达生命周期开始时间的 upcoming 小组变为 `active`。
- 已保存的 `set` 目标变为 `locked`。

## 7. 微信端体验版测试

1. 在微信开发者工具点击“预览”，用微信扫码真机测试。
2. 完成创建、加入、目标、打卡、补卡、查看、管理、回顾主流程。
3. 点击“上传”，填写版本号和备注。
4. 登录微信公众平台，小程序后台进入“管理版本”。
5. 将上传版本设为体验版。
6. 添加体验成员后，在微信端打开体验版测试。
