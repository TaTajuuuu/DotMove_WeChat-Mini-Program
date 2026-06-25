# 一点运动微信打卡小程序

面向小规模微信运动社群的月度目标、运动打卡、补卡与统计复盘小程序。

## 当前状态

- 产品版本：v1.0.0
- 当前流程：SDD 规格驱动开发
- 当前阶段：阶段 1 - PRD 产品需求文档
- Project Constitution：已定稿
- PRD：待确认

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

- [Project Constitution](docs/00-project-principles.md)：项目原则、范围边界、权限、数据、安全、开发约束
- [PRD](docs/01-prd.md)：产品目标、用户角色、MVP 范围、核心场景、功能需求
- [Spec](docs/02-spec.md)：功能规格、业务规则、验收标准
- [Technical Design](docs/03-technical-design.md)：页面、组件、云函数、数据库、权限与风险方案
- [Tasks](docs/04-tasks.md)：可执行开发任务拆解
- [Test Checklist](docs/05-test-checklist.md)：功能验收与回归测试清单
- [Change Log](docs/06-change-log.md)：需求、规格和实现变更记录

## v1.0 范围摘要

v1.0 聚焦：

- 创建运动小组
- 通过分享、邀请码、二维码加入小组
- 设置小组内昵称
- 设置月度运动目标
- 设置一点币承诺值
- 手动运动打卡
- 补昨日或前天的卡
- 查看个人和小组成员的目标、打卡状态与统计结果
- 统计每类目标完成进度、已完成目标成员及小组整体完成率

v1.0 不包含：

- 复杂社交
- 排行榜
- 商城
- AI 推荐
- 运动建议或动作指导
- 接入微信运动步数
- 通知功能
- 一点币结算、奖惩、统计、充值或返还
- 小程序内搜索公开小组

## 技术栈

- 前端：微信小程序原生框架
- 后端：微信云开发
- 数据库：微信云开发数据库
- 存储：微信云存储

## 项目结构

```text
/一点运动
  /program
  /cloudfunctions
  /docs
    00-project-principles.md
    01-prd.md
    02-spec.md
    03-technical-design.md
    04-tasks.md
    05-test-checklist.md
    06-change-log.md
  /archive
```

## 开发约束

- 先写规格，再写代码。
- 每次只实现一个明确任务。
- 每个阶段正式确认后再进入下一阶段。
- 不跳过核心测试。
- 不随意删除核心业务数据。
- 不引入无必要的大型依赖。
- 小程序主包体积控制在 2MB 以内。
- 本地不得放置大量图片、视频、字体、测试文件。

## AI 协作规则

AI 或开发者执行任务前，必须明确：

- 当前参考哪些文档
- 当前处于哪个 SDD 阶段
- 当前执行哪个任务编号
- 允许修改哪些文件
- 验收标准是什么
- 如何测试

未经确认的需求不得直接进入开发。需求变更应先更新 PRD 或 Spec，再更新任务与代码。
