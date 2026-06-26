# Test Checklist：一点运动微信打卡小程序 v1.0

- 项目名称：一点运动微信打卡小程序
- 文档版本：v0.2.0
- 最后更新日期：2026-06-26
- 当前状态：Implementation 校核后测试清单
- 依据文档：docs/00-project-principles.md、docs/01-prd.md、docs/02-spec.md、docs/03-technical-design.md、docs/04-tasks.md

## 1. 本地静态验证

- [ ] 所有小程序端与云函数 JavaScript 文件通过 `node --check`。
- [ ] `cloudfunctions/test-stats.js` 统计单元测试通过。
- [ ] 扫描实现代码，确认无 `TODO`、`FIXME`、mock 数据、未实现占位。
- [ ] 小程序本地包不包含运动照片、视频、大字体或系统缓存文件。

## 2. 云函数部署验证

- [ ] 在微信开发者工具中上传并部署 `cloudfunctions/yidianApi`，选择“云端安装依赖”。
- [ ] 云函数入口 `yidianApi` 可接收 `domain/action/payload/requestId`。
- [ ] 成功响应包含 `success/code/message/data/traceId`。
- [ ] 失败响应使用可识别错误码，并能映射到前端提示文案。

## 3. 数据库与云存储准备

- [ ] 创建集合：`users`、`groups`、`memberships`、`targetConfigs`、`checkinRecords`、`archiveSnapshots`、`archiveMemberSnapshots`、`auditLogs`。
- [ ] 按 `cloudfunctions/database.schema.json` 配置核心索引。
- [ ] 运动照片通过微信云存储上传，记录中仅保存 `fileId/cloudPath` 等元信息。
- [ ] `auditLogs` 不保存图片二进制、临时 URL、token 或大段备注全文。

## 4. 创建与加入小组

- [ ] 创建本月小组，初始状态为 `active`。
- [ ] 创建下月小组，初始状态为 `upcoming`。
- [ ] 小组名称为空或超过限制时被拒绝。
- [ ] 创建者自动生成 `active` membership，并创建 `unset` targetConfig。
- [ ] 成员通过邀请码加入未满员的 `active/upcoming` 小组。
- [ ] 小组满 50 人时拒绝加入。
- [ ] `archived/dissolved` 小组拒绝加入。
- [ ] `exited` 成员可重新加入并追加 activePeriod。
- [ ] `removed` 成员不可重新加入。

## 5. 目标设置

- [ ] 目标类型覆盖 7 项：运动天数、运动次数、月总运动时长、月总最低消耗热量、跑步距离、骑行距离、三环闭合天数。
- [ ] 目标值为空、非数字、小于等于 0 时被拒绝。
- [ ] 运动天数要求 `targetDays/minKcalPerDay`。
- [ ] 运动次数要求 `targetTimes/minKcalPerTime`。
- [ ] 一点币仅保存与展示，不参与统计。
- [ ] `upcoming` 小组目标保存为 `set` 且可修改。
- [ ] `active` 小组首次保存后目标变为 `locked`。
- [ ] `locked/archived/dissolved` 状态拒绝修改目标。

## 6. 打卡与补卡

- [ ] 未设置 locked 目标时，打卡和补卡均提示先设置目标。
- [ ] 打卡仅允许当天 `sportDate === submitDate`。
- [ ] 补卡仅允许昨日或前天。
- [ ] 今日运动误用补卡时提示使用打卡。
- [ ] 每用户每自然日最多 3 次补卡。
- [ ] 同一成员、同一小组、同一运动日期最多 5 条 `valid/edited` 物理有效记录。
- [ ] 5 次上限不因退出、移除或统计排除释放。
- [ ] 打卡和补卡必须上传 1 至 3 张静态图片。
- [ ] GIF、视频或非图片文件被拒绝。
- [ ] 备注超过 100 字被拒绝。
- [ ] 已选目标依赖的运动字段必须填写：热量、时长、跑步距离、骑行距离、三环闭合。
- [ ] 提交当天可修改记录，非提交当天拒绝修改。
- [ ] 修改后记录状态为 `edited`，并保留审计信息。

## 7. 查看与统计

- [ ] active 成员可查看同组 active 成员昵称、目标、打卡状态、照片、备注和统计。
- [ ] exited/removed 成员普通页面不可见且不计入当前统计。
- [ ] 运动天数按同一运动日期累计热量达标计 1 天。
- [ ] 运动次数按单条记录热量达标计 1 次。
- [ ] 三环闭合按运动日期去重计数。
- [ ] 单项目标进度最高显示 100%，完成值保留真实值。
- [ ] 个人综合进度为所有已设置目标进度平均值。
- [ ] 未设置目标显示“未设置目标”。
- [ ] 小组无 active 成员时显示“暂无有效成员”。
- [ ] exited 成员重新加入后，退出前完成状态和完成日期不继承。

## 8. 管理与审计

- [ ] 仅创建者可进入管理操作。
- [ ] 创建者可修改小组名称，普通成员不可修改。
- [ ] 创建者可将创建者身份转让给其他 active 成员。
- [ ] 创建者未转让前不可退出自己创建的小组。
- [ ] 创建者可移除 active 成员，且不能移除自己。
- [ ] 创建者可解散小组。
- [ ] 退出、移除、转让、解散均有二次确认。
- [ ] 退出、移除、转让、解散均写入 `auditLogs`。
- [ ] dissolved 小组普通页面不可见，不进入回顾列表。

## 9. 归档与回顾

- [ ] `systemJob.activateUpcomingGroups` 到生命周期开始后激活 upcoming 小组。
- [ ] upcoming 转 active 时，将 `set` 目标锁定为 `locked`。
- [ ] `systemJob.archiveExpiredGroups` 归档生命周期已结束的 active 小组。
- [ ] 归档时生成 `archiveSnapshots`。
- [ ] 归档时为每个归档时 active 成员生成 `archiveMemberSnapshots`。
- [ ] 归档快照冻结完成状态、完成日期、小组整体完成率和成员目标详情。
- [ ] archived 小组普通页面只读展示快照，不实时重算。
- [ ] 只有快照 `visibleUserIds` 中的用户可查看归档。
- [ ] 归档后新增或修改原始记录，不影响普通回顾页面结果。

## 10. 页面验收

- [ ] 16 个原型页面对应路由均存在。
- [ ] 首页展示 active/upcoming 小组，不展示 archived/dissolved/exited/removed 普通数据。
- [ ] 创建小组页展示本月/下月生命周期说明。
- [ ] 加入小组页展示照片、备注、目标、统计可见性提示。
- [ ] 小组详情页展示成员目标和统计摘要。
- [ ] 小组管理页提供改名、复制邀请码、转让、移除、退出、解散。
- [ ] 目标类型页和目标值页覆盖 7 种目标。
- [ ] 打卡页和补卡页按目标类型动态展示字段。
- [ ] 打卡记录页展示补卡标记、编辑状态、照片数量和备注。
- [ ] 我的首页和我的目标详情显示当前目标和进度。
- [ ] 回顾首页、归档复盘详情、归档成员目标详情均只读读取归档快照。
- [ ] 各页面覆盖 loading、empty、error、forbidden、readonly 状态。

## 11. 发布前门禁

- [ ] 核心流程无阻断问题。
- [ ] 高优先级 Bug 清零。
- [ ] 云函数部署成功。
- [ ] 数据库集合与索引配置完成。
- [ ] 微信开发者工具真机预览通过。
- [ ] 体验版上传成功并可在微信端测试。
- [ ] 未引入 PRD/Spec 明确排除的点赞、评论、排行榜、商城、AI、通知、微信运动步数、自定义目标类型、一点币结算等功能。
