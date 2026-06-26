# 一点运动微信打卡小程序

面向小规模微信运动社群的月度目标、运动打卡、补卡与统计复盘小程序。

## 当前状态

- 产品版本：v1.0.9
- 当前流程：SDD 规格驱动开发
- 当前阶段：阶段 5 - Implementation 校核完成，可进入 Stage 6 测试
- Project Constitution：v1.0.9 已定稿
- PRD：v1.0.9 已确认
- Spec：v1.0.12 已确认
- Technical Design：v0.6.2 已确认
- Tasks：v0.1.1 已确认
- Test Checklist：v0.2.0 已创建
- Test Execution Guide：v0.2.0 已创建
- Change Log：v0.1.0 已创建（Stage 7 占位，待测试后补充）

## SDD 开发流程

本项目遵循 SDD（Spec-Driven Development，规格驱动开发）流程：

1. Project Constitution / 项目原则
2. PRD / 产品需求文档
3. Spec / 功能规格说明
4. Technical Design / 技术设计方案
5. Tasks / 开发任务拆解
6. Implementation / 逐任务实现
7. Test / 验收与回归测试
8. Change Log / 变更记录

每一阶段必须正式确认后，才能进入下一阶段。

## 核心文档

- [Project Constitution](docs/00-project-principles.md)：项目原则、范围边界、权限、数据、安全、开发约束（v1.0.9 已定稿）
- [PRD](docs/01-prd.md)：产品目标、用户角色、MVP 范围、核心场景、功能需求（v1.0.9 已确认）
- [Spec](docs/02-spec.md)：功能规格、业务规则、验收标准（v1.0.12 已确认）
- [Technical Design](docs/03-technical-design.md)：页面、组件、云函数、数据库、权限与风险方案（v0.6.2 已确认）
- [Tasks](docs/04-tasks.md)：可执行开发任务拆解（v0.1.1 已确认）
- [Test Checklist](docs/05-test-checklist.md)：功能验收与回归测试清单（v0.2.0 已创建）
- [Test Execution Guide](docs/test-execution-guide.md)：微信开发者工具、云开发控制台和体验版测试执行指南（v0.2.0 已创建）
- [Change Log](docs/06-change-log.md)：需求、规格和实现变更记录（v0.1.0 已创建，Stage 7 待测试后补充）

## v1.0 范围摘要

v1.0 聚焦：

- 创建运动小组（本月或下月）
- 设置及修改小组名称
- 通过分享、邀请码加入小组
- 设置小组内昵称
- 设置月度运动目标类型及对应一点币值（一点币仅为展示，不参与结算）
- 设置月度目标类型对应的目标数值
- 手动运动打卡，提交运动照片（至少一张、最多三张）及备注
- 补昨日或前天的卡，提交运动照片及备注
- 查看个人和小组成员的目标、打卡状态与统计结果
- 统计每类目标完成进度、已完成目标成员及小组整体完成率

v1.0 不包含：

- 复杂社交（点赞、评论、提醒对方打卡）
- 排行榜
- 商城
- AI 推荐
- 运动建议或动作指导
- 接入微信运动步数
- 通知功能（订阅消息、打卡提醒、补卡提醒、小组活动开始/结束提醒）
- 一点币结算、奖惩、统计、充值、目标完成返还或未完成扣除
- 自定义运动目标类型
- 创建者设置小组可搜索或不可搜索
- 小程序内搜索公开小组

## 技术栈

- 前端：微信小程序原生框架
- 后端：微信云开发
- 数据库：微信云开发数据库
- 存储：微信云存储

## 项目结构

```text
/一点运动
  /program           # 小程序前端代码
    /pages           # 页面
    /components      # 自定义组件
    /services        # 业务接口调用
    /utils           # 通用工具函数
    /types           # 类型定义
    /config          # 配置文件
  /cloudfunctions    # 云函数
    /yidianApi       # 统一云函数入口
      /common        # auth、response、errors、date、audit、validators、stats
      /domains       # auth、group、target、checkin、review、photo、systemJob
    database.schema.json # 云数据库集合与索引配置说明
  /docs             # 项目文档（SDD流程文档）
    00-project-principles.md  # Project Constitution（v1.0.9 已定稿）
    01-prd.md                # PRD（v1.0.9 已确认）
    02-spec.md               # Spec（v1.0.12 已确认）
    03-technical-design.md   # Technical Design（v0.6.2 已确认）
    04-tasks.md              # Tasks（v0.1.1 已确认）
    05-test-checklist.md     # Test Checklist（v0.2.0 已创建）
    06-change-log.md         # Change Log（v0.1.0 已创建，Stage 7 待测试后补充）
    test-execution-guide.md  # Test Execution Guide（v0.2.0 已创建）
  /archive          # 过期文档归档（不删除，便于追溯）
```

## 开发约束

### 开发流程约束
- 必须先有需求说明、验收标准，再开发代码（先写规格，再写代码）
- 每次只开发一个明确任务，完成后必须测试
- 每一阶段必须正式确认后，才能进入下一阶段
- 每次只做一个阶段里的一个细分任务，只修改任务涉及文件
- 未经确认的需求不得直接进入开发
- 需求变更应先更新 PRD 或 Spec，再更新任务与代码
- 任何时候项目开始失控，都退回到 Spec：重新确认功能边界、业务规则和验收标准

### 技术约束
- 页面层只负责展示和交互，业务规则下沉到云函数
- Service 层负责接口调用，Utils 只放通用工具函数，类型定义集中管理
- 核心业务逻辑应具备可复用性，关键模块之间必须通过清晰接口通信
- 配置项不得硬编码在业务代码中
- 不引入无必要的大型依赖，引入新依赖必须说明用途、风险和替代方案
- 小程序主包体积必须控制在 2MB 以内
- 本地不得放置大量图片、视频、字体、测试文件
- 打卡和补卡上传的运动照片必须使用云存储，不得放入小程序本地代码包

### 数据约束
- 不允许随意删除核心业务数据（用户退出、移除成员或解散小组后，历史数据物理保留）
- 关键业务行为必须可记录、可统计、可分析（创建小组、加入小组、关键功能使用、表单提交、状态变化）
- 敏感操作必须二次确认，重要操作必须保留审计记录

### 禁止事项
- 禁止未确认需求就直接开发
- 禁止为了赶进度跳过核心测试
- 禁止在业务代码中硬编码敏感信息
- 禁止未评估影响就修改数据库结构
- 禁止未记录原因就调整核心业务规则
- 禁止引入无必要的复杂架构
- 禁止为边缘场景牺牲主流程体验
- 禁止未经确认删除用户数据

## AI 协作规则

AI 或开发者执行任务前，必须明确：

- 当前参考哪些文档
- 当前处于哪个 SDD 阶段
- 当前执行哪个任务编号
- 允许修改哪些文件
- 验收标准是什么
- 如何测试

未经确认的需求不得直接进入开发。需求变更应先更新 PRD 或 Spec，再更新任务与代码。
