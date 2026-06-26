# Technical Design：一点运动微信打卡小程序 v1.0

- 项目名称：一点运动微信打卡小程序
- 文档版本：v0.6.2
- 创建日期：2026-06-22
- 最后更新日期：2026-06-25
- 当前状态：已确认
- 依据文档：docs/00-project-principles.md、docs/01-prd.md、docs/02-spec.md
- 适用阶段：SDD 阶段 3 - Technical Design 技术设计方案
- 当前完成范围：第 1 步至第 13 步，Technical Design 主体已完成，可进入下一阶段 Tasks 拆解

## 1. Technical Design 阶段说明

### 1.1 阶段目标

Technical Design 阶段用于把已确认的 Spec 规则转换为可实现、可维护、可测试的技术方案。

本阶段回答：

- 微信小程序端、云函数、云数据库、云存储分别承担哪些职责。
- 业务对象如何落成数据库集合、字段、索引和状态。
- Spec 中的小组状态、成员关系状态、目标配置状态、打卡记录状态如何实现。
- 权限、可见性、统计资格、物理有效记录上限和归档快照如何在技术层保证一致。
- 云函数、服务层、页面层之间如何通信。
- 运动照片如何上传、存储、校验和展示。
- 后续开发任务应如何基于稳定技术边界拆解。

本阶段不回答：

- 不写具体代码。
- 不拆开发任务。
- 不做 UI 视觉稿。
- 不新增 Spec 以外的产品功能。
- 不改变已确认的业务规则；如发现规则冲突，应回到 Spec 修订并确认。

### 1.2 参考文档

| 文档 | 作用 |
|---|---|
| docs/00-project-principles.md | 项目最高原则、技术栈约束、架构约束、数据安全原则、SDD 工作流 |
| docs/01-prd.md | 产品目标、用户角色、MVP 范围、核心业务规则、产品验收标准 |
| docs/02-spec.md | 已确认功能规格、状态机、验收标准、统计规则、页面状态和提示文案 |

当 Technical Design 与上游文档发生冲突时，优先级为：

1. Constitution
2. PRD
3. Spec
4. Technical Design

如果 Technical Design 发现 Spec 无法直接实现或存在冲突，应先暂停对应设计点，回到 Spec 明确业务规则，再继续技术设计。

### 1.3 编写规则

- 技术设计必须服务于 Spec，不得扩大 v1.0 MVP 范围。
- 每个关键设计决策必须说明对应的业务规则来源或设计原因。
- 数据模型必须保留核心业务数据，不得设计物理删除核心数据作为默认路径。
- 权限、统计、状态流转不得只依赖前端页面控制，必须在云函数或服务层统一校验。
- 页面层只负责展示和交互，不承载核心业务判断。
- 技术方案应优先简单、稳定、可追踪，避免为非 MVP 场景引入复杂架构。

### 1.4 文档结构

本 Technical Design 最终按以下结构展开：

1. Technical Design 阶段说明
2. 整体架构与设计原则
3. 数据模型设计
4. 状态机与核心约束设计
5. 权限与可见性设计
6. 核心云函数与服务接口设计
7. 运动照片与云存储设计
8. 统计与归档设计
9. 前端页面、组件与交互状态设计
10. 错误码、响应结构与日志设计
11. 安全、性能与并发控制设计
12. 测试设计与验收映射
13. Technical Design 验收清单
14. Version History

当前已完成第 1 至第 13 部分。Technical Design 主体已完成，后续可进入 Tasks 阶段。

## 2. 整体架构与设计原则

### 2.1 技术栈

本项目 v1.0 使用 Constitution 已确认的技术栈：

| 层级 | 技术方案 | 说明 |
|---|---|---|
| 小程序端 | 微信小程序原生框架 | 负责页面展示、用户交互、表单输入、本地轻量状态管理 |
| 后端 | 微信云开发云函数 | 负责业务校验、权限判断、状态流转、统计计算、审计记录 |
| 数据库 | 微信云开发数据库 | 存储用户、小组、成员关系、目标配置、打卡记录、归档快照和审计日志 |
| 文件存储 | 微信云存储 | 存储打卡和补卡运动照片 |
| 第三方能力 | 微信登录、微信群分享、云存储 | v1.0 不启用订阅消息，不接入微信运动步数或外部设备数据 |

### 2.2 总体分层

系统采用“小程序端轻逻辑 + 云函数集中业务规则 + 云数据库持久化 + 云存储保存图片”的分层方式。

```text
微信小程序端
  pages / components
    只负责展示、输入、基础交互和状态反馈
  services
    统一调用云函数，处理 loading / error / success
  utils / types / config
    放通用工具、类型定义和常量

云函数层
  统一鉴权
  统一参数校验
  统一业务规则校验
  统一状态流转
  统一统计计算
  统一审计日志

云数据库
  持久化核心业务对象
  保留状态字段和审计关联
  通过索引支撑核心查询

云存储
  保存运动照片
  由数据库记录 fileId、数量、归属记录和访问上下文
```

### 2.3 职责边界

| 模块 | 职责 | 不应承担 |
|---|---|---|
| 页面层 pages | 展示页面、收集输入、触发操作、展示加载/空/错误/无权限/只读状态 | 不直接判断复杂权限，不直接写数据库，不计算核心统计 |
| 组件层 components | 复用表单、列表、照片上传、统计展示等 UI 单元 | 不持久化业务数据，不决定业务状态流转 |
| 小程序 services | 封装云函数调用、统一处理响应结构、转换页面所需展示数据 | 不绕过云函数直接修改核心集合 |
| 小程序 utils | 北京时间日期处理、格式化、轻量本地校验、展示转换 | 不实现服务端权威规则 |
| 云函数 | 登录态识别、权限校验、参数校验、业务写入、状态流转、统计计算、审计记录 | 不承载 UI 展示逻辑 |
| 云数据库 | 保存业务事实、状态、快照、审计记录 | 不依赖前端约定保证数据正确性 |
| 云存储 | 保存运动照片文件 | 不保存业务权限本身，权限由数据库记录和云函数控制 |

### 2.4 核心业务域

Technical Design 后续按以下业务域展开：

| 业务域 | 主要职责 |
|---|---|
| 用户域 | 微信登录身份、用户基础信息、openid 关联 |
| 小组域 | 创建本月/下月小组、小组名称、生命周期、小组状态 |
| 成员关系域 | 加入、退出、移除、重新加入、创建者身份绑定和转让 |
| 目标配置域 | 成员-小组-自然月整组目标配置、unset / set / locked 状态 |
| 打卡记录域 | 打卡、补卡、当天修改、valid / edited / invalidated 状态、物理有效记录上限 |
| 统计域 | 统计资格、目标进度、完成状态、完成日期、小组整体完成率 |
| 归档域 | 月末归档、归档快照、归档只读展示 |
| 图片域 | 运动照片上传、校验、云存储 fileId、加载失败处理 |
| 审计域 | 敏感操作、状态变化、错误日志和问题追溯 |

### 2.5 关键调用方向

小程序端不得直接修改核心业务集合。所有会改变业务状态的操作都必须通过云函数完成。

| 操作类型 | 调用方向 |
|---|---|
| 查询页面数据 | 小程序 service -> 云函数 -> 云数据库 |
| 创建或修改业务数据 | 小程序 service -> 云函数校验 -> 云数据库写入 -> 审计日志 |
| 上传运动照片 | 小程序选择图片 -> 上传云存储 -> 云函数校验并绑定 fileId |
| 统计展示 | 小程序 service -> 云函数读取记录并计算或读取快照 |
| 归档展示 | 小程序 service -> 云函数校验归档可见性 -> 读取 archiveSnapshots |

### 2.6 设计原则

#### 2.6.1 服务端权威原则

权限判断、状态流转、统计资格、5 次物理有效记录上限、补卡 3 次限制、目标锁定等核心规则，必须由云函数或服务端公共逻辑进行最终判定。

前端可以做即时提示和基础校验，但不得作为最终可信来源。

#### 2.6.2 页面层轻逻辑原则

页面层只处理：

- 展示数据。
- 收集用户输入。
- 调用 service。
- 展示加载、成功、失败、空状态、只读和无权限状态。

页面层不得直接拼复杂查询条件来决定统计口径，也不得自行判断成员是否具备最终操作权限。

#### 2.6.3 状态机显式化原则

以下状态必须以明确枚举字段落库，并由统一逻辑控制流转：

- 小组状态：upcoming / active / archived / dissolved
- 成员关系状态：active / exited / removed
- 目标配置状态：unset / set / locked
- 打卡记录状态：valid / edited / invalidated

不得用多个布尔字段组合隐式表达同一个核心状态。

#### 2.6.4 数据物理保留原则

核心业务数据默认物理保留。成员退出、被移除、小组解散、记录作废等场景，应通过状态字段、可见性规则和统计资格规则处理，不通过物理删除处理。

运动照片作为打卡或补卡记录的一部分，也应保留其 fileId 和归属关系，除非后续另有经过确认的数据删除策略。

#### 2.6.5 物理有效记录与统计资格分离原则

`valid / edited` 记录只代表记录本身物理有效，并计入同一成员、同一小组、同一运动日期的 5 次有效打卡上限。

某条记录是否进入某个统计视图，还必须同时满足：

- 成员关系规则。
- 小组状态规则。
- 统计周期规则。
- active 参与区间规则。
- 可见性规则。
- exited 成员重新加入后的补卡例外规则。

后续统计设计必须提供统一判断函数或统一查询封装，避免把 `valid / edited` 直接等同于“进入当前统计”。

#### 2.6.6 归档快照与实时统计分离原则

active 小组使用当前统计口径计算实时统计。

archived 小组普通页面只读展示归档快照，不因后续成员关系、目标配置、打卡记录或重新加入行为重算。

后台审计或争议追溯可以查询原始数据，但不得反写普通页面的归档快照结果。

#### 2.6.7 敏感操作可追踪原则

以下操作必须记录审计日志：

- 创建小组。
- 加入小组。
- 退出小组。
- 移除成员。
- 转让创建者。
- 解散小组。
- 保存或修改目标配置。
- 提交或修改打卡 / 补卡。
- 状态流转。
- 关键错误。

审计日志至少应能追踪操作人、操作对象、操作时间、操作结果和失败原因。

#### 2.6.8 时间口径统一原则

自然日、昨日、前天、自然月、小组生命周期、打卡提交日期、补卡提交日期和运动日期，统一按北京时间计算。

后续设计应提供统一日期工具，避免不同页面或云函数自行实现时间判断。

#### 2.6.9 并发与幂等原则

涉及人数上限、5 次物理有效记录上限、每日补卡 3 次限制、目标配置首次锁定、创建者转让、成员退出和解散小组的操作，必须考虑重复点击、并发提交和网络重试。

后续接口设计应明确：

- 哪些操作需要事务或原子更新。
- 哪些操作需要唯一约束或幂等键。
- 哪些操作需要在写入前后重复校验关键条件。

#### 2.6.10 统一响应与错误码原则

所有云函数返回结构遵循 Constitution 中的统一响应格式：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "操作成功",
  "data": {}
}
```

错误码应可识别、可定位、可映射到 Spec 中的提示文案。前端不得依赖模糊字符串判断业务状态。

#### 2.6.11 MVP 克制原则

Technical Design 不为 v1.0 明确不实现的能力预留复杂实现，包括点赞、评论、排行榜、商城、AI 推荐、通知、微信运动步数、自定义目标类型和一点币结算。

可以保留命名清晰的扩展空间，但不得因此增加当前实现复杂度。

### 2.7 当前架构决策

| 编号 | 决策 | 原因 |
|---|---|---|
| TD-ARCH-001 | 核心写操作统一通过云函数，不允许小程序端直写核心集合 | 保证权限、状态流转、统计资格和审计一致 |
| TD-ARCH-002 | 页面层只做展示和交互，业务规则下沉到云函数和公共服务逻辑 | 避免多页面重复实现同一规则导致口径漂移 |
| TD-ARCH-003 | 使用显式状态字段表达小组、成员关系、目标配置和打卡记录状态 | 对齐 Spec 状态机，降低后续统计和权限判断复杂度 |
| TD-ARCH-004 | 归档快照独立保存，不依赖普通页面实时回放历史数据 | 满足归档后普通页面不重算的规则 |
| TD-ARCH-005 | 物理有效记录计数与当前统计资格使用不同逻辑 | 满足 5 次上限不因退出、移除或统计排除释放次数的规则 |
| TD-ARCH-006 | 敏感操作统一写入审计日志 | 满足数据可追踪和争议追溯要求 |
| TD-ARCH-007 | 运动照片放入云存储，数据库只保存 fileId、归属关系和展示元信息 | 避免本地包体积膨胀，并对齐云存储约束 |

### 2.8 后续章节展开顺序

Technical Design 已按以下章节顺序展开：

1. 第 3 章：数据模型设计。
2. 第 4 章：状态机与核心约束设计。
3. 第 5 章：权限与可见性设计。
4. 第 6 章：云函数与服务接口设计。
5. 第 7 章：运动照片与云存储设计。
6. 第 8 章：统计与归档设计。
7. 第 9 章：前端页面、组件与交互状态设计。
8. 第 10 章：错误码、响应结构与日志设计。
9. 第 11 章：安全、性能与并发控制设计。
10. 第 12 章：测试设计与验收映射。

其中第 8 章必须复用第 3 至第 7 章的数据、状态、权限和接口边界；第 9 章必须把 16 个原型页面落成页面、组件、状态和服务调用映射，确保下一阶段 Tasks 可以按页面和公共组件拆分。

## 3. 数据模型设计
### 3.1 设计目标

数据模型需要支撑 Spec v1.0.12 中已确认的全部 v1.0 MVP 规则，并支撑最新流程图和 16 个原型页面中的数据展示。

本章重点解决：

- 小程序首页、创建页、加入页、小组详情页、管理页、目标页、打卡页、补卡页、记录页、我的页和回顾页需要读取哪些数据。
- 小组、成员关系、目标配置、打卡记录、归档快照和审计日志如何落库。
- 退出后重新加入、被移除不可重入、创建者转让、归档只读和解散不可见如何在数据层表达。
- 5 次物理有效记录上限与当前统计资格如何分离。
- 归档复盘详情页和归档成员目标详情页如何读取冻结结果。

本章不展开具体云函数参数和接口返回；接口设计在第 6 章展开。

### 3.2 数据库集合总览

v1.0 使用以下云数据库集合：

| 集合 | 主要用途 | 是否核心业务数据 |
|---|---|---|
| users | 保存微信用户的最小身份信息 | 是 |
| groups | 保存小组基础信息、生命周期、状态、邀请入口和当前创建者 | 是 |
| memberships | 保存用户与小组的成员关系、角色、昵称和 active 参与区间 | 是 |
| targetConfigs | 保存成员在某小组某自然月的整组目标配置 | 是 |
| checkinRecords | 保存打卡和补卡记录、运动数值、照片、备注和记录状态 | 是 |
| archiveSnapshots | 保存归档小组的冻结总览和可见成员范围 | 是 |
| archiveMemberSnapshots | 保存归档时每个成员的冻结目标完成详情 | 是 |
| auditLogs | 保存敏感操作、状态变化、失败原因和追溯信息 | 是 |

设计决策：

| 编号 | 决策 | 原因 |
|---|---|---|
| TD-DATA-001 | 同一用户在同一小组只保留一份 membership 文档 | 满足“同一用户同一小组不得存在多个 active 成员关系”，并让目标配置可稳定绑定成员-小组-自然月 |
| TD-DATA-002 | membership 文档中使用 activePeriods 记录多段 active 参与区间 | 支撑 exited 成员重新加入后生成新的 active 参与区间，同时保留退出前历史 |
| TD-DATA-003 | targetConfigs 在成员加入时即可创建 unset 文档 | 显式保存 unset / set / locked 状态，避免用“文档不存在”隐式表达核心状态 |
| TD-DATA-004 | checkinRecords 中保存 sportDate、submitDate 和 membershipActivePeriodSeq | 同时支撑运动日期统计、提交日期限制和退出重入后的统计区间判断 |
| TD-DATA-005 | archiveSnapshots 与 archiveMemberSnapshots 分开保存 | 归档总览和成员详情分离，支撑回顾首页、归档复盘详情和归档成员目标详情 |
| TD-DATA-006 | 不设计物理删除字段作为主流程 | 对齐核心业务数据物理保留原则；通过 status、visibility 和统计资格控制展示和计算 |

### 3.3 通用字段约定

所有核心集合默认包含以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| _id | string | 云数据库文档 ID |
| createdAt | Date | 创建时间 |
| updatedAt | Date | 更新时间 |
| createdBy | string | 创建人 userId，系统任务可为空或为 system |
| updatedBy | string | 最后更新人 userId，系统任务可为空或为 system |

时间字段统一使用 Date 类型保存绝对时间；自然日和自然月额外保存字符串字段，便于查询和索引：

| 字段 | 示例 | 用途 |
|---|---|---|
| dateKey | 2026-06-25 | 北京时间自然日 |
| monthKey | 2026-06 | 北京时间自然月 |
| sportDate | 2026-06-22 | 运动日期 |
| submitDate | 2026-06-25 | 提交日期 |

状态字段统一使用明确枚举字符串，不使用多个布尔字段组合表达核心状态。

### 3.4 users 集合

用途：保存微信用户的最小身份信息，用于登录识别、成员关系关联和审计追踪。

字段设计：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 是 | userId |
| openid | string | 是 | 微信 openid，唯一 |
| unionid | string | 否 | 如后续微信能力返回则保存；v1.0 不依赖 |
| profileNickname | string | 否 | 微信资料昵称，仅作为用户自身资料，不作为组内昵称 |
| avatarUrl | string | 否 | 微信头像 URL，如授权可用则保存 |
| status | string | 是 | active |
| lastLoginAt | Date | 否 | 最近登录时间 |
| createdAt / updatedAt | Date | 是 | 通用时间字段 |

索引建议：

| 索引字段 | 唯一 | 用途 |
|---|---|---|
| openid | 是 | 登录后查找或创建用户 |

约束：

- 组内展示昵称不放在 users，而放在 memberships.nickname。
- v1.0 不存储手机号、真实姓名、身份证等非必要敏感信息。

### 3.5 groups 集合

用途：保存小组基础信息、生命周期、状态、邀请入口、当前创建者和人数上限。

字段设计：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 是 | groupId |
| name | string | 是 | 小组名称，按 Spec 校验 1 至 20 个字符 |
| monthKey | string | 是 | 小组生命周期所属自然月，如 2026-06 |
| groupType | string | 是 | currentMonth / nextMonth，仅记录创建时选择 |
| status | string | 是 | upcoming / active / archived / dissolved |
| lifecycleStartAt | Date | 是 | 生命周期开始时间，北京时间自然月 1 日 00:00:00 |
| lifecycleEndAt | Date | 是 | 生命周期结束时间，北京时间自然月最后一日 23:59:59 |
| creatorUserId | string | 是 | 当前创建者 userId，冗余保存便于校验和查询 |
| creatorMembershipId | string | 是 | 当前创建者 membershipId，创建者身份必须绑定 active 成员关系 |
| inviteCode | string | 是 | 邀请码，v1.0 用于加入小组 |
| inviteStatus | string | 是 | active / disabled；dissolved 或 archived 后不可加入 |
| maxMembers | number | 是 | 固定为 50 |
| activeMemberCount | number | 是 | 当前 active 成员数，写操作中维护 |
| archivedAt | Date | 否 | 归档时间 |
| dissolvedAt | Date | 否 | 解散时间 |
| createdAt / updatedAt | Date | 是 | 通用时间字段 |
| createdBy / updatedBy | string | 是 | 通用操作人字段 |

索引建议：

| 索引字段 | 唯一 | 用途 |
|---|---|---|
| inviteCode | 是 | 通过邀请码查找小组 |
| status + monthKey | 否 | 月度状态流转、归档任务查询 |
| creatorUserId + status | 否 | 创建者首页和管理入口查询 |

约束：

- 小组名称允许重复，不作为唯一识别依据。
- 本月小组创建后如果当前日期在生命周期内，status 为 active。
- 下月小组创建后 status 为 upcoming。
- archived 和 dissolved 为不可逆状态。
- dissolved 小组普通页面不可见，不进入首页和回顾页普通列表。

### 3.6 memberships 集合

用途：保存用户与小组的关系、角色、组内昵称、当前状态和 active 参与区间。

字段设计：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 是 | membershipId |
| groupId | string | 是 | 所属小组 |
| userId | string | 是 | 所属用户 |
| openid | string | 是 | 冗余保存，便于云函数按登录态查询 |
| nickname | string | 是 | 小组内昵称，按 Spec 校验 1 至 12 个字符 |
| role | string | 是 | creator / member，当前角色 |
| status | string | 是 | active / exited / removed |
| activePeriodSeq | number | 是 | 当前或最近一次 active 参与区间序号，从 1 递增 |
| activePeriods | array | 是 | active 参与区间列表 |
| joinedAt | Date | 是 | 首次加入时间 |
| lastRejoinedAt | Date | 否 | 最近一次重新加入时间 |
| exitedAt | Date | 否 | 最近一次主动退出时间 |
| removedAt | Date | 否 | 被移除时间 |
| removedBy | string | 否 | 执行移除的 userId |
| createdAt / updatedAt | Date | 是 | 通用时间字段 |
| createdBy / updatedBy | string | 是 | 通用操作人字段 |

activePeriods 元素结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| seq | number | 参与区间序号 |
| startAt | Date | 本段 active 开始时间 |
| endAt | Date/null | 本段 active 结束时间；当前 active 区间为空 |
| startReason | string | join / rejoin / createGroup |
| endReason | string/null | exit / removed |

索引建议：

| 索引字段 | 唯一 | 用途 |
|---|---|---|
| groupId + userId | 是 | 保证同一用户同一小组只有一份成员关系文档 |
| groupId + status | 否 | 查询小组 active 成员列表、人数统计 |
| userId + status | 否 | 首页查询用户 active 小组 |
| userId + groupId + status | 否 | 权限校验和重新加入判断 |

约束：

- 创建小组时，系统同时创建创建者的 active membership，role 为 creator。
- 转让创建者时，原创建者 role 变为 member，新创建者 role 变为 creator，并同步 groups.creatorUserId / creatorMembershipId。
- 创建者退出前必须先转让创建者身份；因此退出成功时该 membership.role 必须已为 member。
- exited 成员重新加入同一小组时，不新建 membership；将 status 改回 active，activePeriodSeq 加 1，并向 activePeriods 追加新区间。
- removed 成员在 v1.0 不允许重新加入；不得将 removed 改回 active。
- activeMemberCount 只统计 status 为 active 的 memberships。

### 3.7 targetConfigs 集合

用途：保存某成员在某小组某自然月的整组目标配置、目标配置状态和一点币。

字段设计：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 是 | targetConfigId |
| groupId | string | 是 | 所属小组 |
| membershipId | string | 是 | 所属成员关系 |
| userId | string | 是 | 所属用户，冗余保存便于查询 |
| monthKey | string | 是 | 自然月，如 2026-06 |
| status | string | 是 | unset / set / locked |
| coinValue | number | 否 | 一点币，仅展示，不参与统计；允许 0 |
| selectedGoalTypes | array | 是 | 已选择目标类型列表 |
| goals | object | 是 | 各目标类型的目标值和阈值 |
| savedAt | Date | 否 | 首次保存目标配置时间 |
| lockedAt | Date | 否 | 锁定时间 |
| createdAt / updatedAt | Date | 是 | 通用时间字段 |
| createdBy / updatedBy | string | 是 | 通用操作人字段 |

goals 结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| calorieTotal.targetKcal | number | 月总最低消耗热量目标 |
| durationTotal.targetMinutes | number | 月总运动时长目标，统一按分钟保存 |
| exerciseDays.targetDays | number | 运动天数目标 |
| exerciseDays.minKcalPerDay | number | 单天最低消耗热量 |
| exerciseTimes.targetTimes | number | 运动次数目标 |
| exerciseTimes.minKcalPerTime | number | 单次最低消耗热量 |
| runningDistance.targetKm | number | 跑步距离目标 |
| cyclingDistance.targetKm | number | 骑行距离目标 |
| ringClosedDays.targetDays | number | 三环闭合天数目标 |

目标类型枚举：

| 枚举值 | 含义 |
|---|---|
| calorieTotal | 月总最低消耗热量 |
| durationTotal | 月总运动时长 |
| exerciseDays | 运动天数 |
| exerciseTimes | 运动次数 |
| runningDistance | 跑步距离 |
| cyclingDistance | 骑行距离 |
| ringClosedDays | 三环闭合天数 |

索引建议：

| 索引字段 | 唯一 | 用途 |
|---|---|---|
| membershipId + groupId + monthKey | 是 | 保证成员-小组-自然月只有一套目标配置 |
| groupId + monthKey + status | 否 | 统计有效目标配置 |
| userId + monthKey | 否 | 我的目标页查询 |

约束：

- 成员加入小组时，为该成员创建对应 monthKey 的 targetConfigs 文档，初始 status 为 unset。
- upcoming 小组保存目标配置后 status 为 set，允许继续修改整组目标配置。
- active 小组首次保存后 status 为 locked。
- upcoming 转 active 时，已有 set 目标配置应转为 locked。
- archived 或 dissolved 小组不得修改 targetConfigs。
- exited 成员重新加入同一小组同一自然月时，不新建 targetConfigs，也不重置 status；继续沿用原目标配置。
- 同一目标类型只能在 goals 中出现一次。

### 3.8 checkinRecords 集合

用途：保存打卡和补卡记录，包括运动日期、提交日期、运动数值、照片、备注、状态和用于统计资格判断的上下文。

字段设计：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 是 | checkinRecordId |
| groupId | string | 是 | 所属小组 |
| membershipId | string | 是 | 所属成员关系 |
| userId | string | 是 | 提交用户 |
| monthKey | string | 是 | sportDate 所属自然月 |
| sportDate | string | 是 | 运动日期，YYYY-MM-DD |
| submitDate | string | 是 | 提交日期，YYYY-MM-DD |
| submitAt | Date | 是 | 提交时间 |
| isMakeup | boolean | 是 | 是否补卡 |
| makeupForExitedPeriod | boolean | 是 | 是否为 exited 成员重新加入后补交退出期间昨日或前天 |
| membershipActivePeriodSeq | number | 是 | 提交时所属 active 参与区间序号 |
| status | string | 是 | valid / edited / invalidated |
| metrics | object | 是 | 运动数值 |
| photos | array | 是 | 运动照片信息，1 至 3 张 |
| remark | string | 否 | 备注运动状态，最多 100 字 |
| editCount | number | 是 | 修改次数 |
| lastEditedAt | Date | 否 | 最近修改时间 |
| invalidatedAt | Date | 否 | 作废时间 |
| invalidatedReason | string | 否 | 作废原因 |
| createdAt / updatedAt | Date | 是 | 通用时间字段 |
| createdBy / updatedBy | string | 是 | 通用操作人字段 |

metrics 结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| caloriesKcal | number/null | 消耗热量，设置热量相关目标时必填 |
| durationMinutes | number/null | 运动时长，设置时长目标时必填 |
| runningKm | number/null | 跑步距离，设置跑步距离目标时必填 |
| cyclingKm | number/null | 骑行距离，设置骑行距离目标时必填 |
| ringClosed | boolean/null | 是否三环闭合，设置三环闭合目标时必填 |

photos 元素结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| fileId | string | 云存储 fileId |
| cloudPath | string | 云存储路径 |
| sort | number | 展示顺序 |
| uploadedAt | Date | 上传时间 |

索引建议：

| 索引字段 | 唯一 | 用途 |
|---|---|---|
| groupId + membershipId + sportDate + status | 否 | 校验同一成员、同一小组、同一运动日期 5 次物理有效记录上限 |
| userId + submitDate + isMakeup + status | 否 | 校验每个用户每自然日 3 次补卡限制 |
| groupId + monthKey + status | 否 | 当前统计和归档统计 |
| membershipId + monthKey + status | 否 | 我的记录、我的目标详情和成员目标详情 |
| groupId + sportDate + status | 否 | 小组详情、成员当天状态 |

约束：

- 打卡记录 sportDate 必须等于 submitDate。
- 补卡记录 sportDate 只能是 submitDate 的昨日或前天。
- 照片数量必须为 1 至 3。
- 运动照片仅保存静态图片 fileId 和展示元信息；文件本体放云存储。
- 当天打卡和补卡当天可多次修改，修改后 status 为 edited。
- 校验 5 次物理有效记录上限时，只统计 status 为 valid 或 edited 的记录，不受当前统计资格影响。
- 校验每日补卡 3 次限制时，按 userId + submitDate + isMakeup 统计提交成功且 status 为 valid 或 edited 的补卡记录。
- 成员退出、被移除或统计范围变化，不应将 valid / edited 记录改为 invalidated。
- invalidated 仅用于记录本身被判定作废的场景，且仍物理保留。
- membershipActivePeriodSeq 用于判断记录是否属于当前 active 参与区间；makeupForExitedPeriod 用于标记退出重入后的允许补卡例外。

### 3.9 archiveSnapshots 集合

用途：保存小组归档时冻结的总览信息、可见成员范围和小组整体完成率。

字段设计：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 是 | archiveSnapshotId |
| groupId | string | 是 | 所属小组 |
| monthKey | string | 是 | 归档自然月 |
| groupName | string | 是 | 归档时小组名称 |
| lifecycleStartAt | Date | 是 | 归档小组生命周期开始时间 |
| lifecycleEndAt | Date | 是 | 归档小组生命周期结束时间 |
| archivedAt | Date | 是 | 归档快照生成时间 |
| visibleMembershipIds | array | 是 | 归档快照生成时 status 为 active 的 membershipId 列表 |
| visibleUserIds | array | 是 | 归档快照生成时 status 为 active 的 userId 列表，便于回顾页查询 |
| activeMemberCount | number | 是 | 归档时 active 成员数 |
| completedMemberCount | number | 是 | 归档时完成月度目标成员数 |
| incompleteMemberCount | number | 是 | 归档时未完成成员数 |
| groupCompletionRate | number | 是 | 小组整体完成率，0 至 100 |
| status | string | 是 | active，表示快照可用于普通归档页展示 |
| createdAt / updatedAt | Date | 是 | 通用时间字段 |
| createdBy / updatedBy | string | 是 | system |

索引建议：

| 索引字段 | 唯一 | 用途 |
|---|---|---|
| groupId + monthKey | 是 | 每个小组每个自然月只生成一份普通归档快照 |
| visibleUserIds | 否 | 回顾首页查询用户可见归档 |
| monthKey + archivedAt | 否 | 归档列表排序 |

约束：

- archiveSnapshots 只用于普通页面只读展示。
- 归档后不因成员关系、目标配置或打卡记录后续变化重算。
- dissolved 小组不进入普通回顾页展示。
- 后台审计或争议追溯读取原始数据时，不得反写 archiveSnapshots。

### 3.10 archiveMemberSnapshots 集合

用途：保存归档时每个成员的冻结目标完成详情，用于归档复盘详情页和归档成员目标详情页。

字段设计：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 是 | archiveMemberSnapshotId |
| archiveSnapshotId | string | 是 | 所属归档快照 |
| groupId | string | 是 | 所属小组 |
| membershipId | string | 是 | 成员关系 ID |
| userId | string | 是 | 成员用户 ID |
| monthKey | string | 是 | 归档自然月 |
| nickname | string | 是 | 归档时小组内昵称 |
| role | string | 是 | 归档时角色 creator / member |
| targetConfigSnapshot | object | 是 | 归档时目标配置快照 |
| progressSnapshot | object | 是 | 归档时各目标完成值、目标值、进度和达成日期 |
| overallProgress | number | 是 | 归档时个人综合进度 |
| completed | boolean | 是 | 是否完成月度目标 |
| completedAt | Date/string/null | 否 | 完成日期；未完成为空 |
| incompleteSummary | string | 否 | 未完成摘要，用于成员完成明细 |
| createdAt / updatedAt | Date | 是 | 通用时间字段 |

targetConfigSnapshot 结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| coinValue | number | 一点币 |
| selectedGoalTypes | array | 已设置目标类型 |
| goals | object | 目标值和阈值快照 |

progressSnapshot 结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| calorieTotal | object/null | 完成值、目标值、进度、达成日期 |
| durationTotal | object/null | 完成值、目标值、进度、达成日期 |
| exerciseDays | object/null | 完成值、目标值、进度、达成日期 |
| exerciseTimes | object/null | 完成值、目标值、进度、达成日期 |
| runningDistance | object/null | 完成值、目标值、进度、达成日期 |
| cyclingDistance | object/null | 完成值、目标值、进度、达成日期 |
| ringClosedDays | object/null | 完成值、目标值、进度、达成日期 |

索引建议：

| 索引字段 | 唯一 | 用途 |
|---|---|---|
| archiveSnapshotId + membershipId | 是 | 每个归档快照中每个成员只有一份成员快照 |
| groupId + monthKey + completed | 否 | 归档复盘详情页成员完成明细 |
| userId + monthKey | 否 | 用户回顾相关查询 |

约束：

- 该集合只保存归档时 status 为 active 的成员快照。
- 退出、被移除或解散后的用户不因后续状态变化影响已生成归档成员快照的普通只读结果；但查看权限仍以 archiveSnapshots.visibleMembershipIds / visibleUserIds 为准。
- 归档成员目标详情页读取该集合，不读取实时 targetConfigs 和 checkinRecords 重算。

### 3.11 auditLogs 集合

用途：保存敏感操作、状态变化、失败原因和问题追溯信息。

字段设计：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 是 | auditLogId |
| actionType | string | 是 | 操作类型 |
| actorUserId | string | 是 | 操作人 |
| actorMembershipId | string | 否 | 操作人在对应小组内的 membershipId |
| groupId | string | 否 | 相关小组 |
| targetType | string | 是 | group / membership / targetConfig / checkinRecord / archiveSnapshot / system |
| targetId | string | 否 | 操作对象 ID |
| result | string | 是 | success / fail |
| errorCode | string | 否 | 失败错误码 |
| message | string | 否 | 失败原因或审计说明 |
| before | object | 否 | 关键字段变更前快照 |
| after | object | 否 | 关键字段变更后快照 |
| requestId | string | 否 | 幂等或追踪 ID |
| createdAt | Date | 是 | 操作时间 |

actionType 枚举：

| 枚举值 | 含义 |
|---|---|
| GROUP_CREATE | 创建小组 |
| GROUP_UPDATE_NAME | 修改小组名称 |
| GROUP_ARCHIVE | 归档小组 |
| GROUP_DISSOLVE | 解散小组 |
| MEMBER_JOIN | 加入小组 |
| MEMBER_REJOIN | 重新加入小组 |
| MEMBER_EXIT | 退出小组 |
| MEMBER_REMOVE | 移除成员 |
| CREATOR_TRANSFER | 转让创建者 |
| TARGET_SAVE | 保存目标配置 |
| TARGET_LOCK | 锁定目标配置 |
| CHECKIN_CREATE | 提交打卡 |
| MAKEUP_CREATE | 提交补卡 |
| CHECKIN_EDIT | 修改打卡或补卡 |
| CHECKIN_INVALIDATE | 作废记录 |
| AUTH_DENY | 权限拒绝 |
| ERROR | 关键错误 |

索引建议：

| 索引字段 | 唯一 | 用途 |
|---|---|---|
| groupId + createdAt | 否 | 小组审计追溯 |
| actorUserId + createdAt | 否 | 用户操作追溯 |
| targetType + targetId + createdAt | 否 | 对象变更追溯 |
| requestId | 否 | 幂等和问题定位 |

约束：

- 移除成员、转让创建者、创建者退出、解散小组必须写 auditLogs。
- 表单提交失败、权限拒绝和关键状态流转失败应记录必要日志，但不得记录不必要的敏感内容。
- auditLogs 不面向普通页面展示。

### 3.12 集合关系

```text
users 1 ── n memberships
groups 1 ── n memberships
groups 1 ── n targetConfigs
memberships 1 ── n targetConfigs
memberships 1 ── n checkinRecords
groups 1 ── n checkinRecords
groups 1 ── 1 archiveSnapshots
archiveSnapshots 1 ── n archiveMemberSnapshots
users / groups / memberships / targetConfigs / checkinRecords ── n auditLogs
```

关键关系说明：

- groups.creatorMembershipId 必须指向一个 status 为 active 且 role 为 creator 的 memberships 文档。
- targetConfigs 绑定 membershipId + groupId + monthKey，不绑定单个目标类型。
- checkinRecords 绑定 membershipId，同时冗余 groupId、userId、monthKey 以支撑查询。
- archiveMemberSnapshots 来自归档时 active memberships、targetConfigs 和 checkinRecords 的冻结计算结果。
- auditLogs 通过 targetType + targetId 指向发生变化的对象。

### 3.13 页面与数据读取映射

| 页面 / 原型 | 主要读取集合 | 说明 |
|---|---|---|
| 首页 / 小组入口页 | memberships、groups、targetConfigs、archiveSnapshots | 当前小组列表展示用户 active 且小组 upcoming / active 的小组；如展示归档摘要入口，必须读取 archiveSnapshots 并跳转回顾页；dissolved、exited、removed 不展示 |
| 创建小组页 | groups、memberships、targetConfigs、auditLogs | 创建小组后同步创建创建者 membership 和 unset targetConfig |
| 加入小组页 | groups、memberships、targetConfigs、auditLogs | 展示待加入小组，加入成功后创建或恢复 membership，并创建或沿用 targetConfig |
| 目标类型设置页 | targetConfigs、groups、memberships | 读取目标配置状态，判断可编辑或只读 |
| 目标值设置页 | targetConfigs、groups、memberships | 保存 selectedGoalTypes、goals、coinValue |
| 小组详情页 | groups、memberships、targetConfigs、checkinRecords | 展示小组资料、active 成员、目标完成状态和近期记录摘要 |
| 小组管理页 | groups、memberships、auditLogs | 创建者管理小组名称、邀请码、转让、移除、退出和解散 |
| 成员目标详情页 | memberships、targetConfigs、checkinRecords | 查看同组 active 成员目标、完成状态、最近打卡 |
| 打卡页 | groups、memberships、targetConfigs、checkinRecords | 提交当天打卡，校验 5 次物理有效记录上限 |
| 补卡页 | groups、memberships、targetConfigs、checkinRecords | 提交昨日或前天补卡，校验每日 3 次和被补日期 5 次上限 |
| 打卡记录页 | checkinRecords、targetConfigs | 展示自己的 valid / edited 记录和补卡标记 |
| 我的首页 | memberships、groups、targetConfigs、checkinRecords、archiveSnapshots | 展示用户当前小组、目标摘要和运动日历；如出现已归档小组入口，读取归档快照并按只读回顾处理 |
| 我的目标详情页 | memberships、groups、targetConfigs、checkinRecords、archiveSnapshots | 展示个人当前目标进度、完成状态和相关记录；归档目标详情走 archiveMemberSnapshots 只读数据 |
| 回顾页 | archiveSnapshots、archiveMemberSnapshots | 展示用户可见的已归档小组列表 |
| 归档复盘详情页 | archiveSnapshots、archiveMemberSnapshots | 展示冻结完成概览和成员完成明细 |
| 归档成员目标详情页 | archiveMemberSnapshots | 展示归档时冻结的成员目标完成详情 |

### 3.14 核心查询与索引映射

| 场景 | 查询条件 | 依赖索引 |
|---|---|---|
| 首页当前小组 | memberships.userId = 当前用户，status = active；关联 groups.status in upcoming / active | memberships: userId + status；groups: status + monthKey |
| 小组 active 成员列表 | memberships.groupId = groupId，status = active | memberships: groupId + status |
| 判断是否可加入 | groups.inviteCode；groups.status；memberships.groupId + userId | groups: inviteCode；memberships: groupId + userId |
| 判断 removed 不可重入 | memberships.groupId + userId 且 status = removed | memberships: groupId + userId |
| 目标配置读取 | targetConfigs.membershipId + groupId + monthKey | targetConfigs: membershipId + groupId + monthKey |
| 5 次物理有效记录上限 | checkinRecords.groupId + membershipId + sportDate + status in valid / edited | checkinRecords: groupId + membershipId + sportDate + status |
| 每日补卡 3 次限制 | checkinRecords.userId + submitDate + isMakeup = true + status in valid / edited | checkinRecords: userId + submitDate + isMakeup + status |
| 当前统计 | checkinRecords.groupId + monthKey + status；memberships.groupId + status；targetConfigs.groupId + monthKey + status | 多集合组合查询 |
| 回顾页可见归档 | archiveSnapshots.visibleUserIds contains 当前用户 | archiveSnapshots: visibleUserIds |
| 归档成员详情 | archiveMemberSnapshots.archiveSnapshotId + membershipId | archiveMemberSnapshots: archiveSnapshotId + membershipId |
| 审计追溯 | auditLogs.groupId + createdAt 或 targetType + targetId + createdAt | auditLogs 对应索引 |

### 3.15 数据可见性与统计资格字段策略

数据模型不在 checkinRecords 中直接保存一个永久的 `isStatEligible` 布尔值。

原因：

- 统计资格依赖成员关系、小组状态、统计周期、active 参与区间、可见性和退出重入补卡例外。
- 这些条件可能随成员退出、重新加入、归档或解散发生变化。
- 如果把统计资格固化为单个布尔字段，容易和 Spec 中“valid / edited 不等于必然进入当前统计”冲突。

实现策略：

| 规则 | 数据支撑 |
|---|---|
| 物理有效记录上限 | checkinRecords.status in valid / edited |
| 当前统计资格 | memberships.status、groups.status、targetConfigs.status、checkinRecords.status、membershipActivePeriodSeq、makeupForExitedPeriod、sportDate、monthKey 共同判断 |
| 普通页面可见性 | memberships.status、groups.status、archiveSnapshots.visibleMembershipIds / visibleUserIds 判断 |
| 归档普通展示 | archiveSnapshots 和 archiveMemberSnapshots 冻结读取，不读取实时统计 |
| 后台审计追溯 | 原始集合 + auditLogs 查询，不反写普通页面快照 |

后续第 8 章统计与归档设计必须把上述策略落成统一函数或统一查询封装。

### 3.16 数据模型边界与非目标

v1.0 数据模型不设计以下内容：

- 点赞、评论、私信、提醒等社交数据。
- 排行榜数据。
- 商城、支付、一点币结算或奖惩流水。
- 微信运动步数或外部设备同步数据。
- 自定义目标类型配置表。
- 订阅消息配置和推送记录。
- 普通用户侧的 dissolved 小组回收站或查看入口。

### 3.17 数据模型一致性检查

| 来源规则 | 数据模型响应 |
|---|---|
| 创建者必须绑定 active 成员关系 | groups.creatorMembershipId 指向 active + creator membership |
| 同一用户同一小组不得多个 active 成员关系 | memberships 使用 groupId + userId 唯一索引 |
| exited 可重入，removed 不可重入 | memberships.status + activePeriods 支撑重入；removed 不提供恢复路径 |
| 目标配置按成员-小组-自然月整组管理 | targetConfigs 使用 membershipId + groupId + monthKey 唯一索引 |
| 退出重入不重置目标配置 | rejoin 沿用同一 targetConfigs 文档 |
| 5 次上限按物理有效记录 | checkinRecords.status valid / edited 独立于统计资格 |
| 每自然日最多 3 次补卡 | checkinRecords.userId + submitDate + isMakeup 查询 |
| 归档后普通页面不重算 | archiveSnapshots + archiveMemberSnapshots 保存冻结结果 |
| 解散后普通页面不可见 | groups.status = dissolved，普通查询过滤 |
| 敏感操作可追踪 | auditLogs 记录转让、退出、移除、解散等操作 |

## 4. 状态机与核心约束设计

### 4.1 设计目标

本章把 Spec 中的小组状态、成员关系状态、目标配置状态和打卡记录状态落成可执行的服务端状态机，并明确核心约束如何通过数据库字段、事务、幂等和审计日志保证。

本章重点解决：

- 哪些状态字段是权威来源。
- 每个状态允许从哪里来、到哪里去。
- 哪些状态变化必须事务化写入多个集合。
- 5 次物理有效记录上限、每日补卡 3 次、创建者绑定 active 成员关系、removed 不可重入、归档快照不可重算等约束如何落库。

本章不展开具体云函数名称、请求参数和响应结构；接口设计在第 6 章展开。

### 4.2 状态字段总览

| 业务对象 | 权威状态字段 | 枚举值 | 主要影响 |
|---|---|---|---|
| 小组 | groups.status | upcoming / active / archived / dissolved | 决定是否可加入、打卡、补卡、改名、管理、普通查看和归档查看 |
| 成员关系 | memberships.status | active / exited / removed | 决定是否为有效成员、是否可操作、是否进入当前统计 |
| 目标配置 | targetConfigs.status | unset / set / locked | 决定是否已设置目标、是否可修改、是否作为有效目标配置 |
| 打卡记录 | checkinRecords.status | valid / edited / invalidated | 决定是否计入 5 次物理有效记录上限，以及是否具备进入统计的基础资格 |

状态机设计原则：

- 所有写操作必须先读取并校验当前状态，再决定是否允许流转。
- 不允许前端直接写入状态字段。
- 不允许用布尔字段替代上述核心状态。
- 不允许通过物理删除表达退出、移除、解散、归档或记录作废。
- 归档和解散是小组生命周期状态，不批量改写 memberships.status；普通可见性由 groups.status 和归档快照共同控制。

### 4.3 小组状态机

权威字段：`groups.status`。

允许状态流转：

| 当前状态 | 触发条件 | 目标状态 | 写入要求 |
|---|---|---|---|
| 无 | 创建本月小组，当前日期处于该自然月生命周期内 | active | 创建 groups、创建者 membership、创建者 targetConfig、auditLogs |
| 无 | 创建下月小组 | upcoming | 创建 groups、创建者 membership、创建者 targetConfig、auditLogs |
| upcoming | 到达 lifecycleStartAt | active | 更新 groups.status；将已 set 的 targetConfigs 锁定为 locked；写 TARGET_LOCK / 状态流转日志 |
| active | 到达生命周期结束后的归档任务时间 | archived | 生成 archiveSnapshots / archiveMemberSnapshots；更新 groups.status、archivedAt、inviteStatus；写 GROUP_ARCHIVE |
| upcoming / active | 创建者确认解散 | dissolved | 更新 groups.status、dissolvedAt、inviteStatus；写 GROUP_DISSOLVE |

禁止状态流转：

| 当前状态 | 禁止流转 | 原因 |
|---|---|---|
| archived | archived -> upcoming / active / dissolved | 归档是自然月结束后的普通页面只读结果；不再恢复参与或改为解散 |
| dissolved | dissolved -> upcoming / active / archived | 解散是创建者主动终止，普通页面不可见且不可恢复 |
| active | active -> upcoming | 生命周期不倒退 |
| upcoming | upcoming -> archived | 未进入生命周期的小组不能自然归档 |

落库方式：

- `groups.lifecycleStartAt` 和 `groups.lifecycleEndAt` 保存北京时间自然月边界对应的绝对时间。
- `groups.inviteStatus` 在 archived 或 dissolved 时置为 disabled，加入校验同时检查 `groups.status` 和 `inviteStatus`。
- `groups.archivedAt` 只在归档成功后写入；`groups.dissolvedAt` 只在解散成功后写入。
- 月末归档必须幂等：以 `archiveSnapshots.groupId + monthKey` 唯一索引防止重复生成普通归档快照。
- 解散不生成普通归档快照，dissolved 小组不进入回顾页。
- archived / dissolved 不批量把 memberships.status 改成 exited 或 removed；成员关系历史仍按 active / exited / removed 保留。

### 4.4 成员关系状态机

权威字段：`memberships.status`，辅助字段为 `memberships.role`、`memberships.activePeriodSeq`、`memberships.activePeriods`。

允许状态流转：

| 当前状态 | 触发条件 | 目标状态 | 写入要求 |
|---|---|---|---|
| 无 | 创建小组时创建者自动入组 | active | role=creator；activePeriodSeq=1；追加 createGroup activePeriod；groups.activeMemberCount +1 |
| 无 | 用户首次加入未满员 upcoming / active 小组 | active | role=member；activePeriodSeq=1；追加 join activePeriod；创建 unset targetConfig；activeMemberCount +1 |
| active | 成员确认退出，且不是未转让的创建者 | exited | 关闭当前 activePeriod，endReason=exit；activeMemberCount -1；写 MEMBER_EXIT |
| exited | 用户通过有效入口重新加入，且小组仍允许加入 | active | activePeriodSeq +1；追加 rejoin activePeriod；沿用原 targetConfig；activeMemberCount +1；写 MEMBER_REJOIN |
| active | 创建者确认移除 active 成员 | removed | 关闭当前 activePeriod，endReason=removed；activeMemberCount -1；写 MEMBER_REMOVE |

角色流转：

| 操作 | 写入要求 |
|---|---|
| 转让创建者 | 原创建者 membership.role 从 creator 改为 member；新创建者 membership.role 从 member 改为 creator；同步 groups.creatorUserId / creatorMembershipId |
| 创建者退出 | 必须先完成转让，使当前操作者 membership.role 已为 member，再按 active -> exited 流转 |

禁止状态流转：

| 当前状态 | 禁止流转 | 原因 |
|---|---|---|
| removed | removed -> active | v1.0 MVP 明确 removed 不可重新加入同一小组 |
| exited / removed | exited / removed -> creator | 创建者必须绑定 active 成员关系 |
| active creator | 直接 active -> exited | 创建者退出前必须先转让 |
| 任意 | 在 archived / dissolved 小组中加入或重入 | archived 只读，dissolved 普通不可见 |

落库方式：

- `memberships.groupId + userId` 使用唯一索引，同一用户同一小组永远只有一份 membership 文档。
- `activePeriods` 只记录成员参与统计的 active 区间；退出或移除时关闭当前区间。
- 重新加入不新建 membership，不新建重复 targetConfig，不重置 targetConfigs.status。
- `checkinRecords.membershipActivePeriodSeq` 保存提交时所属区间，后续统计用它判断是否属于当前 active 参与区间。
- `groups.activeMemberCount` 只在 active / exited / removed 之间发生成员关系变化时维护；归档和解散不通过修改 membership.status 来维护人数。

### 4.5 目标配置状态机

权威字段：`targetConfigs.status`。

允许状态流转：

| 当前状态 | 触发条件 | 目标状态 | 写入要求 |
|---|---|---|---|
| 无 | 成员加入或创建小组 | unset | 创建成员-小组-自然月唯一 targetConfig |
| unset | upcoming 小组中保存合法整组目标 | set | 写入 selectedGoalTypes、goals、coinValue；写 TARGET_SAVE |
| set | upcoming 小组中再次保存合法整组目标 | set | 覆盖整组目标配置；写 TARGET_SAVE |
| unset | active 小组中首次保存合法整组目标 | locked | 写入目标配置并立即锁定；写 TARGET_SAVE |
| set | upcoming 小组进入 active | locked | 批量锁定已保存目标；写 TARGET_LOCK |

禁止状态流转：

| 当前状态 | 禁止操作 | 原因 |
|---|---|---|
| locked | 新增、修改、删除目标类型或目标值 | active 首次保存后或进入 active 后整组锁定 |
| unset / set / locked | archived 或 dissolved 小组中保存目标 | 归档只读；解散普通页面不可见 |
| 任意 | 按单个目标类型分别修改状态 | Spec 要求成员-小组-自然月整组目标配置 |

落库方式：

- `targetConfigs.membershipId + groupId + monthKey` 使用唯一索引。
- “已设置目标”的技术判断为 `status in set / locked` 且 `selectedGoalTypes` 非空。
- active 小组提交打卡或补卡时，目标配置必须已锁定；若发现 active 小组仍存在 set 状态，应先由状态流转任务锁定或由服务端拒绝并记录一致性错误。
- 一点币只保存为目标配置展示字段，不进入统计计算和约束判断。

### 4.6 打卡记录状态机

权威字段：`checkinRecords.status`。

允许状态流转：

| 当前状态 | 触发条件 | 目标状态 | 写入要求 |
|---|---|---|---|
| 无 | active 成员在 active 小组提交当天打卡成功 | valid | 写 sportDate=submitDate、metrics、photos、remark、membershipActivePeriodSeq |
| 无 | active 成员在 active 小组提交昨日或前天补卡成功 | valid | 写 isMakeup=true、sportDate、submitDate、makeupForExitedPeriod |
| valid / edited | 提交者在提交当天修改打卡或补卡成功 | edited | 更新 metrics、photos、remark、editCount、lastEditedAt |
| valid / edited | 记录本身被判定作废 | invalidated | 写 invalidatedAt、invalidatedReason；保留原始记录 |

禁止状态流转：

| 当前状态 | 禁止操作 | 原因 |
|---|---|---|
| invalidated | invalidated -> valid / edited | 作废记录不恢复为普通有效记录 |
| valid / edited | 因退出、移除或统计范围变化改为 invalidated | 统计排除不等于记录作废 |
| 任意 | 物理删除记录表达作废 | 违反数据物理保留原则 |

提交约束：

| 约束 | 服务端判断方式 |
|---|---|
| 小组状态 | groups.status 必须为 active |
| 成员关系 | memberships.status 必须为 active |
| 目标状态 | targetConfigs.status 必须为 locked，且 selectedGoalTypes 非空 |
| 当天打卡 | sportDate 必须等于 submitDate |
| 补卡日期 | sportDate 必须为 submitDate 的昨日或前天 |
| 退出期间补卡例外 | exited 成员重入后，仅当昨日或前天落在退出期间时允许补交，并标记 makeupForExitedPeriod=true |
| 每日补卡 3 次 | 统计 userId + submitDate + isMakeup=true + status in valid / edited 的记录数 |
| 运动日期 5 次上限 | 统计 groupId + membershipId + sportDate + status in valid / edited 的物理有效记录数 |
| 照片数量 | photos 数量必须为 1 至 3 |
| 备注长度 | remark 最多 100 字 |
| 目标依赖字段 | 已选目标依赖的 metrics 字段必须有效填写 |

落库方式：

- 新建打卡或补卡前，在同一写事务或具备并发保护的服务逻辑中重复读取 5 次上限和补卡 3 次上限。
- 修改记录不新增物理记录，不应额外占用 5 次上限；但修改后记录仍以 edited 计入物理有效记录。
- 物理有效记录上限只看 valid / edited，不看当前统计资格。
- 当前统计资格不固化为 checkinRecords 的永久布尔字段，由第 8 章统计与归档设计统一封装。

### 4.7 核心约束落库总表

| 规则 | 落库字段 / 索引 | 写入策略 |
|---|---|---|
| 同一用户同一小组只有一份成员关系 | memberships.groupId + userId 唯一索引 | join / rejoin 先查 membership，再决定创建或恢复 |
| removed 不可重入 | memberships.status=removed | 加入校验命中 removed 时直接拒绝 |
| 创建者必须绑定 active 成员关系 | groups.creatorMembershipId + memberships.role/status | 管理操作前校验 creatorMembershipId 指向 active + creator |
| 小组人数上限 50 | groups.maxMembers、activeMemberCount | 加入 / 重入事务中校验并更新 activeMemberCount |
| 目标配置唯一 | targetConfigs.membershipId + groupId + monthKey 唯一索引 | 加入时创建 unset；重入沿用原文档 |
| 目标锁定 | targetConfigs.status | upcoming 可 set 并修改；active 保存或激活后 locked |
| 5 次物理有效记录上限 | checkinRecords.groupId + membershipId + sportDate + status | 新建记录前按 valid / edited 计数 |
| 每自然日 3 次补卡 | checkinRecords.userId + submitDate + isMakeup + status | 新建补卡前按 valid / edited 计数 |
| 归档只读且不重算 | archiveSnapshots、archiveMemberSnapshots | 归档任务生成冻结快照，普通页只读快照 |
| 解散后普通不可见 | groups.status=dissolved | 普通查询和业务操作统一过滤 / 拒绝 |
| 敏感操作可追踪 | auditLogs | 转让、退出、移除、解散、归档、记录修改均写日志 |

### 4.8 事务与幂等要求

| 操作 | 必须原子完成的写入 | 幂等 / 并发要求 |
|---|---|---|
| 创建小组 | groups + 创建者 membership + 创建者 targetConfig + auditLogs | 使用 requestId 追踪重复提交 |
| 首次加入 | membership + targetConfig + groups.activeMemberCount + auditLogs | 校验未满员；唯一索引防重复 membership |
| 重新加入 | membership.status / activePeriods + activeMemberCount + auditLogs | removed 拒绝；exited 才恢复 |
| 保存目标 | targetConfigs + auditLogs | active 首次保存后立即 locked，防重复点击二次修改 |
| 提交打卡 | checkinRecords + auditLogs | 5 次上限需写前重查 |
| 提交补卡 | checkinRecords + auditLogs | 同时校验 3 次补卡和被补日期 5 次上限 |
| 修改打卡 / 补卡 | checkinRecords + auditLogs | 仅提交当天、仅本人、记录未作废 |
| 转让创建者 | 新旧 memberships.role + groups.creatorUserId / creatorMembershipId + auditLogs | 新创建者必须 active；事务内同时更新 |
| 退出小组 | membership.status / activePeriods + activeMemberCount + auditLogs | 若仍为 creator 直接拒绝 |
| 移除成员 | membership.status / activePeriods + activeMemberCount + auditLogs | 只能移除 active member，不能移除自己作为未转让 creator |
| 解散小组 | groups.status / inviteStatus + auditLogs | 不物理删除，不生成普通归档 |
| 月末归档 | archiveSnapshots + archiveMemberSnapshots + groups.status + auditLogs | groupId + monthKey 唯一索引保证幂等 |

### 4.9 状态一致性检查

| 检查项 | 不一致表现 | 处理策略 |
|---|---|---|
| active 小组中存在 set targetConfig | upcoming -> active 锁定任务漏执行 | 拒绝打卡 / 补卡，记录 ERROR，并由状态流转任务补锁 |
| groups.creatorMembershipId 指向非 active 或非 creator | 创建者权限绑定异常 | 拒绝管理操作，记录 AUTH_DENY / ERROR |
| activeMemberCount 与 active memberships 数量不一致 | 并发加入、退出或移除失败 | 后续维护任务可重算；写操作仍以 membership 实际状态为准 |
| archived 小组缺少 archiveSnapshot | 归档任务失败或部分写入 | 普通回顾页不展示该小组；重试归档任务 |
| dissolved 小组出现在普通列表 | 查询过滤缺失 | 修正查询封装，记录错误来源 |
| checkinRecords.status 为 valid / edited 但成员已 exited | 这是允许的历史事实 | 不作废记录；当前统计按 activePeriods 和成员状态排除 |

### 4.10 第 4 步交叉检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 数据保留原则 | 所有退出、移除、解散、作废均通过状态字段和审计处理，不设计物理删除 |
| PRD 小组生命周期 | upcoming / active / archived / dissolved 的流转与本月 / 下月 / 自然月归档一致 |
| Spec 状态机 | 四类状态字段和枚举值完全沿用 Spec，不新增用户侧状态 |
| 流程图 | 创建、加入、目标、打卡、补卡、管理、归档各泳道均有对应状态和服务端校验 |
| 原型图 | 首页、目标页、打卡页、补卡页、管理页、回顾页需要的状态判断均可由当前字段支撑 |
| 已有数据模型 | 本章只细化第 3 章字段的使用方式；未引入新集合或改变核心关系 |

## 5. 权限与可见性设计

### 5.1 设计目标

本章把 Constitution、PRD、Spec、流程图和原型中的权限边界落成统一的服务端授权模型和普通页面可见性规则。

本章重点解决：

- 当前用户在某个小组里的身份如何判定。
- 哪些操作需要 active 成员身份，哪些操作额外需要 creator 角色。
- archived 和 dissolved 的可见性如何区别处理。
- exited / removed 成员的历史数据如何物理保留但普通页面不可见。
- 照片、备注、目标、统计如何跟随记录和成员关系统一可见。

### 5.2 权限判断输入

每个需要小组上下文的云函数都应统一构造权限上下文：

| 输入 | 来源 | 用途 |
|---|---|---|
| currentUserId | 微信登录态解析 users | 判断当前操作者 |
| group | groups | 判断小组状态、生命周期、创建者、邀请状态 |
| actorMembership | memberships.groupId + currentUserId | 判断操作者成员关系、角色、active 参与区间 |
| targetMembership | memberships._id 或 userId | 查看或管理其他成员时判断目标对象 |
| targetConfig | targetConfigs | 判断目标是否已设置、是否可编辑 |
| checkinRecord | checkinRecords | 修改记录、查看照片和备注时判断归属与状态 |
| archiveSnapshot | archiveSnapshots | archived 小组普通可见性的权威快照 |

基础规则：

- 未登录用户不得访问需要身份的页面和操作。
- 普通小组页面必须同时满足 `groups.status in upcoming / active` 和 `actorMembership.status=active`。
- 创建者权限必须同时满足 `actorMembership.status=active`、`actorMembership.role=creator`、`groups.creatorMembershipId=actorMembership._id`。
- archived 内容不读取普通 membership.status 判定可见，而读取 `archiveSnapshots.visibleUserIds / visibleMembershipIds`。
- dissolved 小组不向创建者或成员提供普通页面访问。

### 5.3 角色与权限口径

| 技术角色 | 判定条件 | 说明 |
|---|---|---|
| 未登录用户 | 无 currentUserId | 只能进入无需身份的启动态；业务数据访问全部拒绝 |
| 非成员 | 无 membership，或 membership 不属于目标小组 | 不能查看普通小组数据；可通过有效邀请码进入加入流程 |
| active 成员 | membership.status=active，且 group.status 允许普通查看 | 可查看同组 active 成员目标、打卡照片、备注和统计 |
| 创建者 | active 成员 + role=creator + groups.creatorMembershipId 命中 | 拥有管理小组、移除成员、转让、解散等权限 |
| exited 成员 | membership.status=exited | 普通页面不可见；可在 upcoming / active 小组通过有效入口重新加入 |
| removed 成员 | membership.status=removed | 普通页面不可见；v1.0 不可重新加入同一小组 |
| 归档可见成员 | currentUserId 在 archiveSnapshots.visibleUserIds 中 | 只读查看归档快照和归档成员详情 |

v1.0 不实现普通用户侧管理员角色；后台审计或争议追溯不属于小程序普通页面权限模型。

### 5.4 操作权限矩阵

| 操作 | active 成员 | 创建者 | exited 成员 | removed 成员 | 归档可见成员 | dissolved 小组 |
|---|---|---|---|---|---|---|
| 查看 upcoming / active 小组详情 | 允许 | 允许 | 拒绝 | 拒绝 | 不适用 | 拒绝 |
| 查看同组 active 成员目标、照片、备注、统计 | 允许 | 允许 | 拒绝 | 拒绝 | 不适用 | 拒绝 |
| 修改本人昵称 | upcoming / active 允许 | upcoming / active 允许 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 保存本人目标 | 按 targetConfigs.status 和 group.status 判断 | 同 active 成员 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 提交打卡 | active 小组且目标 locked 时允许 | 同 active 成员 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 提交补卡 | active 小组且目标 locked 时允许 | 同 active 成员 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 修改本人提交当天记录 | 允许 | 允许 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 修改他人目标或记录 | 拒绝 | 拒绝 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 修改小组名称 | 拒绝 | upcoming / active 允许 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 移除成员 | 拒绝 | 允许移除 active member | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 转让创建者 | 拒绝 | 允许转让给 active member | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 退出小组 | 允许 | 已转让后允许 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 解散小组 | 拒绝 | upcoming / active 允许 | 拒绝 | 拒绝 | 拒绝 | 已解散不可重复 |
| 查看归档复盘 | 不按当前 membership 判定 | 不按当前 creator 判定 | 不按当前 exited 判定 | 不按当前 removed 判定 | 允许只读 | 拒绝 |

说明：

- 归档可见性以归档快照生成时的 active 成员名单为准；即使该用户后续退出或被移除，只要在快照可见名单中，普通归档页仍可只读查看该快照。
- dissolved 小组不提供普通页面查看入口，即使用户曾经是创建者或 active 成员也不可见。
- 创建者不能修改或移除他人的目标、打卡、补卡记录；管理权限只覆盖小组和成员关系。

### 5.5 页面可见性规则

| 页面 / 原型 | 可见性查询条件 | 不可见对象 |
|---|---|---|
| 首页 / 小组入口页 | 当前小组列表：memberships.userId=currentUserId，memberships.status=active，groups.status in upcoming / active；归档摘要入口：archiveSnapshots.visibleUserIds contains currentUserId | dissolved、exited、removed；archived 不进入当前小组列表，只能作为回顾入口 |
| 创建小组页 | 已登录用户 | 未登录用户 |
| 加入小组页 | inviteCode 有效，groups.status in upcoming / active，inviteStatus=active；removed 命中时不展示可加入操作 | archived、dissolved、满员、removed |
| 目标类型 / 目标值页 | active membership + groups.status in upcoming / active | exited、removed、archived、dissolved |
| 小组详情页 | active membership + groups.status in upcoming / active | exited、removed、dissolved；archived 走回顾页 |
| 小组管理页 | creator 权限上下文 + groups.status in upcoming / active | 非创建者、exited、removed、archived、dissolved |
| 成员目标详情页 | actor active membership + targetMembership.status=active + group.status in upcoming / active | exited / removed 成员详情 |
| 打卡页 | actor active membership + group.status=active + targetConfig locked | upcoming、archived、dissolved、未设置目标 |
| 补卡页 | actor active membership + group.status=active + targetConfig locked | upcoming、archived、dissolved、未设置目标、日期超范围 |
| 打卡记录页 | 本人 active membership + group.status in upcoming / active；记录 status in valid / edited | 他人私有修改入口、invalidated 默认列表 |
| 我的首页 / 我的目标详情 | 当前目标数据：当前用户 active memberships + upcoming / active groups；归档摘要或归档目标详情：archiveSnapshots / archiveMemberSnapshots 只读读取 | dissolved、exited、removed；archived 不使用实时 memberships / targetConfigs 重算 |
| 回顾首页 | archiveSnapshots.visibleUserIds contains currentUserId，status=active | dissolved、非快照可见用户 |
| 归档复盘详情页 | archiveSnapshots.visibleUserIds contains currentUserId | 非快照可见用户、dissolved |
| 归档成员目标详情页 | archiveSnapshots.visibleUserIds contains currentUserId，读取 archiveMemberSnapshots | 非快照可见用户、实时成员数据 |

### 5.6 数据字段可见性

| 数据 | upcoming / active 普通小组 | archived 回顾页 | dissolved |
|---|---|---|---|
| 小组名称、生命周期、成员数 | active 成员可见 | 快照可见成员只读可见 | 普通页面不可见 |
| 成员昵称、角色 | 仅 active 成员列表可见 | 归档成员快照只读可见 | 普通页面不可见 |
| 目标配置和一点币 | 同组 active 成员可见；本人按状态可编辑 | 归档快照只读可见 | 普通页面不可见 |
| 打卡 / 补卡运动数值 | 同组 active 成员可见 | 第 7 章负责照片访问控制，第 8 章负责归档快照取数；归档页只读展示 | 普通页面不可见 |
| 运动照片 | 跟随对应 valid / edited 记录对同组 active 成员可见 | 归档快照允许的只读范围内可见 | 普通页面不可见 |
| 备注运动状态 | 跟随对应 valid / edited 记录对同组 active 成员可见 | 归档快照允许的只读范围内可见 | 普通页面不可见 |
| auditLogs | 普通页面不可见 | 普通页面不可见 | 仅后台审计或争议追溯 |

### 5.7 服务端授权封装

后续云函数设计应复用统一授权封装，而不是在各页面接口中手写不同查询条件。

建议的授权判断能力：

| 能力 | 判定结果 |
|---|---|
| requireLogin | 未登录直接返回 LOGIN_REQUIRED |
| requireActiveMembership | 校验 group.status in upcoming / active 且 actorMembership.status=active |
| requireActiveGroupForCheckin | 校验 group.status=active |
| requireCreator | 校验 active membership + role=creator + creatorMembershipId |
| canJoinGroup | 校验 upcoming / active、inviteStatus、未满员、非 removed |
| canViewCurrentGroup | 校验 active membership + upcoming / active |
| canViewArchive | 校验 archiveSnapshots.visibleUserIds contains currentUserId |
| canEditOwnTarget | 校验本人 active membership、group 状态、targetConfig 状态 |
| canEditOwnCheckin | 校验本人记录、提交当天、record.status in valid / edited |
| denyDissolved | 命中 dissolved 时所有普通访问直接拒绝 |

授权失败必须返回统一错误码，并可写 AUTH_DENY 审计日志；错误响应不得暴露无权限对象的敏感数据。

### 5.8 查询过滤策略

| 查询场景 | 必备过滤条件 |
|---|---|
| 当前小组列表 | memberships.userId=currentUserId、memberships.status=active、groups.status in upcoming / active |
| 可加入小组 | groups.inviteCode 命中、groups.status in upcoming / active、inviteStatus=active、activeMemberCount < maxMembers、membership.status != removed |
| 小组成员列表 | memberships.groupId=groupId、memberships.status=active |
| 当前统计成员 | memberships.groupId=groupId、memberships.status=active、groups.status=active |
| 当前统计目标 | targetConfigs.status in set / locked，且所属 membership 具备当前统计资格 |
| 当前统计记录 | checkinRecords.status in valid / edited，并通过 activePeriods、sportDate、makeupForExitedPeriod 判断统计资格 |
| 物理有效记录上限 | checkinRecords.status in valid / edited，不附加当前统计资格过滤 |
| 归档列表 | archiveSnapshots.visibleUserIds contains currentUserId、archiveSnapshots.status=active |
| 归档详情 | archiveSnapshots.visibleUserIds contains currentUserId；成员详情读取 archiveMemberSnapshots |
| dissolved 排除 | 所有普通页面和业务操作都必须过滤或拒绝 groups.status=dissolved |

### 5.9 敏感操作权限与审计

以下操作必须同时具备服务端权限校验、前端二次确认和 auditLogs：

| 操作 | 权限要求 | 审计重点 |
|---|---|---|
| 移除成员 | 创建者；目标成员必须 active member | actor、targetMembership、before/after status |
| 转让创建者 | 创建者；目标成员必须 active member | 新旧 creatorMembershipId、role 变化 |
| 创建者退出 | 当前操作者已不是 creator | 退出确认、membership 状态变化 |
| 解散小组 | 创建者；group.status in upcoming / active | group.status 变为 dissolved、普通访问阻断 |
| 归档任务 | system | 快照生成数量、完成率、状态变化 |
| 打卡 / 补卡修改 | 记录本人；提交当天 | 修改前后记录摘要、editCount |

前端二次确认只改善用户体验，不作为权限依据。所有敏感操作最终以云函数校验结果为准。

### 5.10 第 5 步交叉检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 权限约束 | 创建者、成员、后续管理员边界清晰；v1.0 不实现普通管理员 |
| Constitution 数据安全 | 用户只能访问有权限数据；无权限响应不暴露敏感数据；审计日志不面向普通页 |
| PRD 可见性规则 | active 成员互相可见目标、照片、备注、统计；退出、移除、解散普通不可见 |
| Spec AUTH / FORBID 规则 | 未登录、非 active、archived、dissolved、修改他人数据等禁止规则均有服务端判定 |
| 流程图权限泳道 | 创建者管理、成员互看、归档只读、解散不可见均已映射到权限矩阵 |
| 原型图页面入口 | 当前小组列表不混入归档；首页或我的页如展示归档摘要，必须从快照进入回顾页；管理页仅创建者；打卡 / 补卡受 active 与目标状态限制 |
| 数据模型 | 权限判断只使用第 3 章已有集合和字段，不新增超出 MVP 的角色或权限表 |

## 6. 核心云函数与服务接口设计

### 6.1 设计目标

本章把页面流程、状态机、权限模型和数据模型落成小程序 service 与云函数接口边界。

本章重点解决：

- 小程序端通过哪些 service 调用后端。
- 云函数按哪些业务域拆分，如何复用鉴权、参数校验、状态校验和审计逻辑。
- 核心页面需要哪些查询接口和写入接口。
- 打卡、补卡、目标保存、加入、退出、移除、转让、解散等核心写操作如何保证权限、幂等和一致性。
- 图片上传相关接口如何与第 7 章云存储方案衔接。

本章不展开具体代码实现，不定义最终错误码全集；错误码细节在后续错误码、响应结构与日志设计中统一收敛。

### 6.2 接口分层

v1.0 使用“小程序 service -> 云函数业务入口 -> 领域 handler -> 公共业务能力 -> 云数据库 / 云存储”的调用结构。

```text
program/services
  authService
  groupService
  targetService
  checkinService
  reviewService
  photoService

cloudfunctions
  authApi
  groupApi
  targetApi
  checkinApi
  reviewApi
  photoApi
  systemJobApi

cloudfunctions/shared
  authContext
  validators
  permissionGuards
  stateGuards
  dateUtils
  auditLogger
  responseBuilder
  statsHelpers
  photoGuards
```

职责边界：

| 层级 | 职责 | 不应承担 |
|---|---|---|
| 小程序 service | 封装 callFunction、组装 payload、处理 loading / retry / error 映射 | 不直接写数据库，不绕过云函数判断权限和状态 |
| 云函数 API 入口 | 解析 action、构造 authContext、统一响应、捕获异常 | 不承载页面展示逻辑 |
| 领域 handler | 执行具体业务规则、读写集合、写 auditLogs | 不重复实现通用鉴权和日期算法 |
| shared 公共能力 | 登录态、权限、状态、日期、审计、响应、图片校验复用 | 不耦合单个页面 UI |
| 云数据库 / 云存储 | 保存事实数据和文件 | 不作为权限判断的唯一实现位置 |

设计决策：

| 编号 | 决策 | 原因 |
|---|---|---|
| TD-API-001 | 云函数按业务域拆分，每个云函数内部按 action 路由 | 兼顾部署简单度和领域边界，避免单个巨型函数失控 |
| TD-API-002 | 所有写操作必须由云函数完成，小程序端不得直写核心集合 | 对齐服务端权威原则 |
| TD-API-003 | 所有写操作必须传 requestId | 支撑重复点击、网络重试和审计追踪 |
| TD-API-004 | 页面查询接口返回页面所需聚合数据，但不返回无权限原始数据 | 降低前端拼权限查询的风险 |
| TD-API-005 | 统计摘要可由接口返回，但统计计算细节在第 8 章统一设计 | 避免本章提前固化未展开的统计实现 |

### 6.3 统一请求与响应

所有小程序 service 调用云函数时使用统一请求包裹：

```json
{
  "action": "createGroup",
  "requestId": "uuid-or-client-generated-id",
  "clientTime": "2026-06-25T10:00:00+08:00",
  "payload": {}
}
```

字段要求：

| 字段 | 必填 | 说明 |
|---|---|---|
| action | 是 | 云函数内部业务动作名 |
| requestId | 写操作必填，查询可选 | 幂等、审计和问题追踪用；由小程序 service 生成 |
| clientTime | 否 | 仅用于问题定位，不作为业务时间权威来源 |
| payload | 是 | 具体参数对象 |

统一响应沿用 Constitution 标准格式，并增加 `traceId` 用于定位：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "操作成功",
  "data": {},
  "traceId": "server-trace-id"
}
```

响应约束：

- `success=false` 时，`code` 必须是可枚举错误码。
- `message` 必须能映射到 Spec 中的关键提示文案或页面错误状态。
- 查询接口不得因为部分照片临时 URL 获取失败而整体失败；照片失败按第 7 章返回占位状态。
- 写接口失败时不得部分返回成功语义；事务失败应整体失败，并保留必要审计或错误日志。

### 6.4 云函数总览

| 云函数 | 主要 action | 主要职责 |
|---|---|---|
| authApi | loginOrCreateUser、getCurrentUser | 微信登录态解析，创建或读取 users |
| groupApi | getHomeEntry、createGroup、getJoinPreview、joinGroup、getGroupDetail、getGroupManagement、updateGroupName、transferCreator、exitGroup、removeMember、dissolveGroup | 小组创建、加入、详情、管理和成员关系变化 |
| targetApi | getTargetConfig、saveTargetConfig、getMyTargetDetail、getMemberTargetDetail | 目标配置读取、保存、锁定状态判断、目标详情聚合 |
| checkinApi | getCheckinContext、createCheckin、createMakeup、updateCheckinRecord、getCheckinRecords | 打卡、补卡、修改、记录列表和限制状态 |
| reviewApi | getReviewHome、getArchiveReviewDetail、getArchiveMemberTargetDetail | 归档回顾列表和只读详情 |
| photoApi | createPhotoUploadSlots、getPhotoTempUrls | 生成上传路径、校验照片访问权限、生成临时访问 URL |
| systemJobApi | activateUpcomingGroups、archiveExpiredGroups | 系统状态流转和月末归档任务 |

所有云函数入口都必须先执行：

1. 解析微信登录态，生成 `currentUserId`。
2. 校验 `action` 是否在白名单内。
3. 校验 payload 基础结构。
4. 写操作校验 `requestId`。
5. 调用领域 handler。
6. 使用统一 responseBuilder 返回结果。

### 6.5 小程序 Service 总览

| service | 调用云函数 | 页面 / 场景 |
|---|---|---|
| authService | authApi | 小程序启动、进入需登录页面 |
| groupService | groupApi | 首页、创建小组、加入小组、小组详情、小组管理 |
| targetService | targetApi | 目标类型页、目标值页、我的目标详情、成员目标详情 |
| checkinService | checkinApi | 打卡页、补卡页、打卡记录页 |
| reviewService | reviewApi | 回顾首页、归档复盘详情、归档成员目标详情 |
| photoService | photoApi + wx.cloud.uploadFile | 打卡 / 补卡照片上传、照片重试加载 |

service 约束：

- service 只做调用封装和响应转换，不做最终业务判断。
- service 可以做表单级即时校验，如空值、字符数、照片数量，但云函数必须重复校验。
- service 不持久化业务状态；页面刷新后以云函数返回为准。
- service 不缓存敏感数据；照片临时 URL 只作为展示态数据使用。

### 6.6 groupApi 接口设计

| action | 类型 | 主要 payload | data 返回 | 核心校验 |
|---|---|---|---|---|
| getHomeEntry | 查询 | monthKey 可选 | 当前小组列表、归档摘要入口、创建 / 加入口状态 | 登录；当前小组只查 active membership + upcoming / active；归档摘要查 archiveSnapshots |
| createGroup | 写 | groupType、name、requestId | groupId、membershipId、targetConfigId、inviteCode、status | 登录；名称 1 至 20；本月 active / 下月 upcoming；创建者自动 active |
| getJoinPreview | 查询 | inviteCode | 小组名称、生命周期、成员数、状态、可见性提示 | 邀请码有效；不暴露 dissolved 敏感数据 |
| joinGroup | 写 | inviteCode、nickname、requestId | groupId、membershipId、targetConfigId、status | 未满 50；upcoming / active；nickname 1 至 12；removed 拒绝；exited 恢复 |
| getGroupDetail | 查询 | groupId | 小组资料、active 成员列表、目标摘要、打卡摘要 | active membership；upcoming / active；dissolved 拒绝 |
| getGroupManagement | 查询 | groupId | 管理页资料、可转让成员、可移除成员 | creator 权限；upcoming / active |
| updateGroupName | 写 | groupId、name、requestId | groupId、name、updatedAt | creator 权限；upcoming / active；名称 1 至 20 |
| transferCreator | 写 | groupId、targetMembershipId、requestId | oldCreatorMembershipId、newCreatorMembershipId | creator 权限；目标成员 active；事务更新 role 和 groups creator 字段 |
| exitGroup | 写 | groupId、requestId | membershipId、status=exited | active member；若仍是 creator 则拒绝；二次确认由前端触发但服务端不信任 |
| removeMember | 写 | groupId、targetMembershipId、requestId | targetMembershipId、status=removed | creator 权限；目标成员 active；不得移除非 active 成员 |
| dissolveGroup | 写 | groupId、requestId | groupId、status=dissolved | creator 权限；upcoming / active；写 dissolvedAt、禁用 inviteStatus |

接口说明：

- `getHomeEntry` 中的归档摘要入口只返回 archiveSnapshots 的只读摘要，不返回 archived 小组实时 membership / targetConfig 数据。
- `joinGroup` 命中 exited membership 时恢复原 membership，并沿用原 targetConfig；命中 removed 时返回不可重新加入错误。
- `transferCreator`、`exitGroup`、`removeMember`、`dissolveGroup` 必须写 auditLogs。

### 6.7 targetApi 接口设计

| action | 类型 | 主要 payload | data 返回 | 核心校验 |
|---|---|---|---|---|
| getTargetConfig | 查询 | groupId、membershipId 可选 | 目标配置、可编辑状态、锁定原因 | 本人或同组 active 成员可查看；编辑仅本人 |
| saveTargetConfig | 写 | groupId、selectedGoalTypes、goals、coinValue、requestId | targetConfigId、status、lockedAt | active membership；upcoming 可 set；active 首次保存后 locked；archived / dissolved 拒绝 |
| getMyTargetDetail | 查询 | groupId 或 archiveSnapshotId | 当前目标进度或归档目标详情入口数据 | 当前数据走 active membership；归档数据走 archiveSnapshots 权限 |
| getMemberTargetDetail | 查询 | groupId、membershipId | 同组成员目标、进度、最近记录摘要 | actor active membership；targetMembership 必须 active |

目标保存校验：

- `selectedGoalTypes` 至少选择 1 个目标类型。
- 目标类型必须属于 v1.0 枚举范围。
- 同一目标类型在整组配置中只能出现一次。
- 目标值必须是合法正数；一点币允许为 0，但不得为负数。
- 运动天数必须包含单天最低热量；运动次数必须包含单次最低热量。
- 保存后返回目标配置状态，页面据此进入可编辑或只读状态。

### 6.8 checkinApi 接口设计

| action | 类型 | 主要 payload | data 返回 | 核心校验 |
|---|---|---|---|---|
| getCheckinContext | 查询 | groupId、mode=checkin/makeup、sportDate 可选 | 目标依赖字段、今日 / 补卡日期、5 次上限剩余、3 次补卡剩余、照片提示状态 | active group；active membership；target locked |
| createCheckin | 写 | groupId、metrics、photos、remark、requestId | checkinRecordId、status=valid、sportDate、submitDate | sportDate=submitDate；照片 1 至 3；5 次上限；目标依赖字段 |
| createMakeup | 写 | groupId、sportDate、metrics、photos、remark、requestId | checkinRecordId、isMakeup=true、status=valid | sportDate 为昨日或前天；每日补卡 3 次；被补日期 5 次上限；退出期间例外 |
| updateCheckinRecord | 写 | checkinRecordId、metrics、photos、remark、requestId | checkinRecordId、status=edited、editCount | 本人记录；提交当天；valid / edited；照片 1 至 3 |
| getCheckinRecords | 查询 | groupId、monthKey、filter 可选 | 本人 valid / edited 记录、补卡标记、照片数量、可修改状态 | 本人 active membership；upcoming / active；归档记录走 reviewApi |

打卡 / 补卡写入顺序：

1. 构造 authContext。
2. 校验 group、membership、targetConfig 状态。
3. 校验 sportDate、submitDate、北京时间口径。
4. 校验 metrics 与目标依赖字段。
5. 校验 photos 数量、fileId、cloudPath、静态图片类型和归属上下文。
6. 校验 5 次物理有效记录上限；补卡同时校验每日 3 次限制。
7. 在事务或具备并发保护的写入流程中创建 / 更新 checkinRecords。
8. 写 auditLogs。
9. 返回记录摘要，由前端刷新目标和记录状态。

说明：

- `getCheckinRecords` 展示“自己的有效打卡和补卡记录”；同组成员记录展示由成员目标详情或小组详情聚合接口控制。
- 修改打卡 / 补卡不新增物理记录，不释放也不额外占用 5 次上限。
- 记录状态因修改变为 edited；不得因成员退出或统计排除改为 invalidated。

### 6.9 reviewApi 接口设计

| action | 类型 | 主要 payload | data 返回 | 核心校验 |
|---|---|---|---|---|
| getReviewHome | 查询 | monthKey 可选 | 用户可见归档小组列表、完成率摘要 | archiveSnapshots.visibleUserIds contains currentUserId |
| getArchiveReviewDetail | 查询 | archiveSnapshotId | 冻结完成概览、成员完成明细 | 归档可见性；只读 |
| getArchiveMemberTargetDetail | 查询 | archiveSnapshotId、membershipId | 冻结成员目标、完成值、完成日期、照片只读入口 | 归档可见性；读取 archiveMemberSnapshots |

约束：

- reviewApi 不读取实时 targetConfigs 和 checkinRecords 重算普通页面归档结果。
- dissolved 小组不进入 reviewApi 普通查询结果。
- 归档页不返回任何新增、修改、删除入口状态。

### 6.10 photoApi 接口设计

photoApi 的完整上传和访问策略在第 7 章展开，本章只定义服务接口边界。

| action | 类型 | 主要 payload | data 返回 | 核心校验 |
|---|---|---|---|---|
| createPhotoUploadSlots | 写前准备 | groupId、purpose=checkin/makeup/edit、count、sportDate、recordId 可选、requestId | uploadSlots：cloudPath、slotId、sort、maxSize、allowedExts | 登录；对应场景权限；count 1 至 3；active group / membership；edit 时校验本人记录 |
| getPhotoTempUrls | 查询 | recordId 或 fileIds、archiveSnapshotId 可选 | fileId、tempUrl、sort、loadStatus | 当前小组可见性或归档可见性；dissolved 拒绝 |

约束：

- 小程序端实际上传使用 `wx.cloud.uploadFile`，但 cloudPath 必须来自 photoApi。
- checkinApi 只接受已按第 7 章规则生成并上传成功的 fileId / cloudPath。
- 临时访问 URL 必须经权限校验生成，不把永久公开 URL 写入数据库。

### 6.11 systemJobApi 接口设计

| action | 类型 | 触发方式 | 核心职责 | 幂等要求 |
|---|---|---|---|---|
| activateUpcomingGroups | 系统任务 | 定时任务或后台手动触发 | 将到达 lifecycleStartAt 的 upcoming 小组转 active，并锁定 set targetConfigs | 重复执行不得重复写错误状态；已 active 跳过 |
| archiveExpiredGroups | 系统任务 | 定时任务或后台手动触发 | 对生命周期结束的 active 小组生成 archiveSnapshots / archiveMemberSnapshots，并转 archived | archiveSnapshots.groupId + monthKey 唯一索引防重复 |

约束：

- systemJobApi 不面向普通小程序页面调用。
- 任务执行结果写 auditLogs，actorUserId 可为 system。
- 归档失败时不得把普通页面展示切到半成品快照；缺少 archiveSnapshot 的 archived 小组不进入普通回顾页，等待重试。

### 6.12 接口与页面映射

| 页面 / 原型 | 主要 service / action |
|---|---|
| 首页 / 小组入口页 | groupService.getHomeEntry |
| 创建小组页 | groupService.createGroup |
| 加入小组页 | groupService.getJoinPreview、groupService.joinGroup |
| 目标类型页 / 目标值页 | targetService.getTargetConfig、targetService.saveTargetConfig |
| 小组详情页 | groupService.getGroupDetail、targetService.getMemberTargetDetail |
| 小组管理页 | groupService.getGroupManagement、updateGroupName、transferCreator、exitGroup、removeMember、dissolveGroup |
| 成员目标详情页 | targetService.getMemberTargetDetail、photoService.getPhotoTempUrls |
| 打卡页 | checkinService.getCheckinContext、photoService.createPhotoUploadSlots、checkinService.createCheckin |
| 补卡页 | checkinService.getCheckinContext、photoService.createPhotoUploadSlots、checkinService.createMakeup |
| 打卡记录页 | checkinService.getCheckinRecords、updateCheckinRecord、photoService.getPhotoTempUrls |
| 我的首页 / 我的目标详情 | targetService.getMyTargetDetail、groupService.getHomeEntry |
| 回顾首页 | reviewService.getReviewHome |
| 归档复盘详情页 | reviewService.getArchiveReviewDetail |
| 归档成员目标详情页 | reviewService.getArchiveMemberTargetDetail、photoService.getPhotoTempUrls |

### 6.13 接口一致性检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 接口约束 | 所有接口均要求参数校验、统一响应、错误码、权限控制和日志 |
| PRD 核心流程 | 创建、加入、目标、打卡、补卡、查看、管理、归档均有 service / action 映射 |
| Spec 权限与状态 | 写接口均依赖第 4、5 章状态机和权限模型，不信任前端判断 |
| 流程图云函数泳道 | 登录、创建、加入、目标、提交、限制、管理、归档均映射到云函数职责 |
| 原型页面 | 16 个原型页面均能找到对应查询或写入接口 |
| MVP 边界 | 不包含点赞、评论、排行榜、订阅消息、微信运动步数、自定义目标类型等接口 |

## 7. 运动照片与云存储设计

### 7.1 设计目标

本章把打卡和补卡运动照片的选择、上传、绑定、展示、修改、归档只读和失败重试落成技术方案。

本章重点解决：

- 照片为什么存云存储，数据库保存哪些引用字段。
- 小程序端、photoApi、checkinApi 如何协作完成上传和绑定。
- 如何校验静态图片、1 至 3 张数量、归属上下文和可见性。
- 修改打卡 / 补卡时新增、删除、替换照片如何处理。
- 照片加载失败、上传失败和归档只读如何展示。

本章不设计独立图片审核、图片压缩算法细节、CDN 加速、批量删除或长期清理策略；这些不属于 v1.0 MVP 必需范围。

### 7.2 存储原则

| 原则 | 设计 |
|---|---|
| 不进本地包 | 打卡 / 补卡照片全部上传微信云存储，不放入小程序代码目录 |
| 数据库只存引用 | checkinRecords.photos 保存 fileId、cloudPath、sort、uploadedAt 等元信息 |
| 权限跟随记录 | 照片访问权限跟随 checkinRecords、membership、group 和 archiveSnapshots 可见性 |
| 静态图片限制 | 仅允许 jpg / jpeg / png / webp 等静态图片；不支持视频、GIF 动图或非图片文件 |
| 物理保留 | 已绑定到记录的照片 fileId 默认保留；修改时被替换的旧 fileId 不在普通页面展示，但通过审计保留追溯线索 |
| 私有访问 | 普通页面不使用永久公开 URL；需要展示时按权限生成临时 URL |

### 7.3 上传流程

打卡 / 补卡新建流程：

```text
1. 页面选择 1 至 3 张本地图片
2. photoService 调用 photoApi.createPhotoUploadSlots
3. photoApi 校验当前用户是否可在该 group / sportDate 上传照片
4. photoApi 返回服务端生成的 cloudPath 列表
5. 小程序端使用 wx.cloud.uploadFile 上传到指定 cloudPath
6. 小程序端拿到 fileId 后，连同 cloudPath / sort 传给 checkinApi.createCheckin 或 createMakeup
7. checkinApi 再次校验照片数量、路径归属、文件类型和业务权限
8. checkinApi 创建 checkinRecords，并把 photos 绑定到记录
9. 页面刷新记录、目标进度和照片展示
```

修改打卡 / 补卡照片流程：

```text
1. 页面读取原记录 photos
2. 用户新增、删除或替换照片
3. 新增或替换的照片先走 createPhotoUploadSlots + wx.cloud.uploadFile
4. updateCheckinRecord 提交最终 photos 列表
5. 服务端校验提交当天、本人记录、照片 1 至 3 张
6. checkinRecords.photos 更新为最新展示列表，记录状态变为 edited
7. auditLogs.before / after 保存修改前后 photos 的 fileId / cloudPath 摘要
```

上传失败规则：

- 任一必填照片上传失败时，不得调用 createCheckin / createMakeup 伪造成功。
- 页面展示“运动照片上传失败，请重试”。
- 用户可重试同一 slot，也可重新选择照片。
- 已上传但未绑定到 checkinRecords 的文件不进入普通页面展示；v1.0 不做用户侧清理入口。

### 7.4 cloudPath 规则

cloudPath 必须由 photoApi 生成，小程序端不得自行拼接业务路径。

建议格式：

```text
checkin-photos/groups/{groupId}/{monthKey}/{membershipId}/{sportDate}/{purpose}/{requestId}/{sort}.{ext}
```

字段说明：

| 片段 | 说明 |
|---|---|
| checkin-photos | 固定业务前缀，区别于其他云存储资源 |
| groupId | 所属小组 |
| monthKey | 运动日期所属自然月 |
| membershipId | 上传者在小组内的成员关系 |
| sportDate | 运动日期，YYYY-MM-DD |
| purpose | checkin / makeup / edit |
| requestId | 本次提交或编辑的幂等 ID |
| sort | 1 到 3 的展示顺序 |
| ext | 服务端允许的静态图片扩展名 |

路径约束：

- `groupId`、`membershipId`、`sportDate` 必须和后续 checkinApi payload 一致。
- `purpose=makeup` 时 sportDate 必须为提交日期的昨日或前天。
- `purpose=edit` 时必须提供 recordId，并校验该记录归属当前用户且可在提交当天修改。
- 不允许把用户昵称、小组名称等可变或含隐私文本放进 cloudPath。

### 7.5 照片元信息落库

checkinRecords.photos 元素结构沿用第 3 章数据模型：

| 字段 | 来源 | 说明 |
|---|---|---|
| fileId | wx.cloud.uploadFile 返回 | 云存储文件 ID |
| cloudPath | photoApi 生成 | 文件路径，用于归属校验和追溯 |
| sort | 页面排序 + 服务端校验 | 1 到 3，决定展示顺序 |
| uploadedAt | 服务端绑定时间 | 以服务端时间为准 |

绑定规则：

- 只有 checkinApi 创建或更新记录成功后，照片才成为该打卡 / 补卡记录的一部分。
- checkinRecords.photos 永远保存当前普通页面展示的照片列表。
- 修改前的照片 fileId / cloudPath 通过 auditLogs.before / after 保留摘要，用于问题追溯。
- v1.0 不新增独立 photos 集合，避免引入额外同步复杂度。

### 7.6 文件校验

客户端即时校验：

| 校验 | 方式 |
|---|---|
| 数量 | 选择和提交时限制 1 至 3 张 |
| 媒体类型 | 使用微信图片选择能力限制 image |
| 本地可读 | 上传前确认本地 filePath 可读取 |
| 基础图片信息 | 使用可用的小程序图片信息能力读取宽高和类型 |

服务端最终校验：

| 校验 | 方式 |
|---|---|
| 数量 | checkinApi / updateCheckinRecord 校验 photos.length 介于 1 至 3 |
| 扩展名 | cloudPath ext 必须属于 jpg / jpeg / png / webp |
| 路径归属 | cloudPath 必须符合 photoApi 生成规则，且 groupId / membershipId / sportDate / purpose 匹配 |
| fileId 完整性 | fileId 不能为空，且必须和 photos 元素一一对应 |
| GIF / 视频 | ext 为 gif、mp4、mov 等直接拒绝 |
| 权限 | 上传和绑定时再次校验 group、membership、targetConfig、record 状态 |

如果微信云存储可读取文件 MIME 或元数据，服务端应进一步校验 MIME 与扩展名一致；如果运行环境无法稳定读取 MIME，v1.0 至少执行路径扩展名、上传来源和小程序端图片选择校验。

### 7.7 访问控制与展示

照片展示不直接依赖云存储路径公开性，而依赖服务端可见性判断。

| 场景 | 可见性判断 | 返回方式 |
|---|---|---|
| 当前小组成员查看记录 | group.status in upcoming / active，actor membership active，记录所属成员 active，record.status in valid / edited | 返回临时 URL 或 fileId + 可重试加载状态 |
| 本人查看打卡记录 | 本人 active membership，record.userId=currentUserId，record.status in valid / edited | 返回临时 URL 和可修改状态 |
| 成员目标详情查看他人记录 | actor active membership，targetMembership active | 返回最近记录照片临时 URL |
| 归档页查看照片 | currentUserId 在 archiveSnapshots.visibleUserIds 中 | 只读返回归档允许范围内的临时 URL |
| exited / removed / dissolved | 普通页面拒绝 | 不返回照片 URL |
| invalidated 记录 | 默认普通列表不展示 | 不返回照片 URL，审计追溯除外 |

临时 URL 规则：

- 由 photoApi 或页面聚合接口在权限校验后生成。
- 不写入 checkinRecords。
- 过期后前端可调用 photoApi.getPhotoTempUrls 重试。
- 照片加载失败时，页面展示失败占位和重试入口，不影响运动数值和备注展示。

### 7.8 归档与只读规则

归档后：

- 归档页只读展示照片，不允许新增、删除或替换。
- 归档页照片访问仍以 archiveSnapshots.visibleUserIds 为准。
- 归档普通页面不因后续记录修改、成员关系变化或重新加入行为重算展示结果。
- 如果第 8 章统计与归档设计需要冻结照片展示范围，应在 archiveMemberSnapshots 或归档详情返回结构中保存必要的 fileId 引用快照；不得依赖实时成员列表重新判断归档普通可见性。

解散后：

- dissolved 小组普通页面不返回照片 URL。
- 历史照片 fileId 和 cloudPath 仍物理保留，仅后台审计或争议追溯可查。

### 7.9 错误处理

| 场景 | 处理 |
|---|---|
| 未选择照片提交 | 阻止提交，提示“请上传 1 至 3 张运动照片” |
| 选择超过 3 张 | 阻止继续选择或提交，提示数量限制 |
| 非静态图片 | 阻止上传或绑定，提示“仅支持上传静态运动照片” |
| 单张上传失败 | 保留表单数据，提示“运动照片上传失败，请重试” |
| 全部上传成功但提交失败 | 不创建记录；提示业务失败原因；用户可重试提交或重新上传 |
| 临时 URL 获取失败 | 展示照片失败占位和重试入口，不影响运动数值和备注展示 |
| 无权限访问照片 | 返回无权限错误，不暴露 fileId 对应内容 |

### 7.10 性能与体验约束

- 打卡成功标准要求非首次授权且网络与图片上传正常时 30 秒内完成一次打卡；上传流程应允许并发上传最多 3 张照片。
- 小程序端应在上传前进行必要压缩或尺寸控制，但压缩策略不得降低到无法辨认运动证明的程度；具体压缩参数在前端设计中细化。
- 列表页默认展示照片数量或少量缩略图，不一次性拉取大量临时 URL。
- 归档详情和成员目标详情按页面实际展示需要获取照片 URL，避免无意义批量拉取。
- 加载失败必须局部降级，不能导致整条记录的运动数值和备注消失。

### 7.11 第 7 步交叉检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 资源约束 | 用户上传照片进入云存储，不进入本地代码包；不引入新第三方存储 |
| PRD 照片规则 | 打卡和补卡均要求 1 至 3 张照片，支持提交当天修改照片 |
| Spec DATA / CHECKIN / MAKEUP | 静态图片、上传失败、加载失败、归档只读、可见性提示均有技术承接 |
| 流程图 | “内容校验：照片 1 至 3 张、静态图片、备注不超过 100 字”和“照片云存储”均已映射 |
| 原型图 | 打卡页、补卡页、记录页、归档详情页的照片入口、只读和失败状态均可支撑 |
| 数据模型 | 沿用 checkinRecords.photos，不新增照片集合；fileId / cloudPath / sort / uploadedAt 可满足展示和追溯 |
| 权限模型 | 照片访问跟随 active 成员、归档快照和 dissolved 阻断规则，没有绕过第 5 章 |

## 8. 统计与归档设计

### 8.1 设计目标

本章把 Spec 的统计与复盘规则落成可实现的统计函数、当前统计读取模型和归档快照生成流程。

本章回答：

- 每类目标的完成值、进度、完成日期如何计算。
- 当前统计资格如何结合 active 成员关系、参与区间、退出重入和补卡例外判断。
- 小组整体完成率如何计算，分母为 0 时如何展示。
- active 小组的当前统计和 archived 小组的冻结快照如何分离。
- 归档任务如何幂等生成 archiveSnapshots / archiveMemberSnapshots。
- 页面接口应返回哪些统计展示字段，避免前端自行拼统计口径。

本章不设计一点币结算、排行榜、连续打卡榜、奖惩、订阅提醒或后台 BI 报表。

### 8.2 统计职责边界

| 层级 | 职责 | 不做什么 |
|---|---|---|
| statsHelpers | 统一计算目标进度、综合进度、完成状态、完成日期、小组完成率 | 不直接处理页面展示文案 |
| permissionGuards | 判断当前用户是否可读取当前统计或归档快照 | 不计算目标进度 |
| targetApi / groupApi | 查询当前小组或成员统计摘要 | 不保存归档快照 |
| reviewApi | 读取 archiveSnapshots / archiveMemberSnapshots 冻结结果 | 不读取实时记录重算归档普通页面 |
| systemJobApi.archiveExpiredGroups | 月末归档、生成冻结快照、切换 group.status | 不面向普通页面调用 |
| 页面层 | 展示进度条、完成状态、空状态和只读状态 | 不计算核心统计、不决定统计资格 |

设计决策：

| 决策编号 | 决策 | 原因 |
|---|---|---|
| TD-STATS-001 | 当前统计按请求实时计算或由接口聚合计算，不在 checkinRecords 上固化永久统计布尔值 | 退出、移除、重新加入和补卡例外会改变当前统计资格，固化字段容易漂移 |
| TD-STATS-002 | 归档统计必须写入 archiveSnapshots / archiveMemberSnapshots | 归档后普通页面只读且不重算 |
| TD-STATS-003 | 统计计算只以服务端数据为准 | 页面层只展示结果，避免不同页面口径不一致 |
| TD-STATS-004 | 一点币只随目标信息展示，不进入任何统计函数 | 对齐 PRD / Spec 的 MVP 边界 |
| TD-STATS-005 | dissolved 小组不生成普通回顾入口，也不通过 reviewApi 返回普通统计 | 对齐解散后普通页面不可见规则 |

### 8.3 统一统计输入

statsHelpers 的核心输入应由云函数聚合，页面层不得直接构造。

| 输入 | 来源集合 | 用途 |
|---|---|---|
| group | groups | monthKey、status、lifecycleStartAt、lifecycleEndAt、dissolved / archived 判断 |
| activeMemberships | memberships | 当前统计分母、成员昵称、角色、activePeriodSeq |
| targetConfigs | targetConfigs | 已设置目标类型、目标值、阈值、一点币展示值 |
| eligibleRecords | checkinRecords | 具备统计资格的 valid / edited 打卡和补卡记录 |
| archiveSnapshot | archiveSnapshots | 归档总览、可见成员、整体完成率 |
| archiveMemberSnapshots | archiveMemberSnapshots | 归档成员目标详情、完成状态、完成日期 |

当前统计的 membership 输入规则：

| 场景 | 统计成员集合 |
|---|---|
| upcoming 小组 | 不展示当前运动进度；可展示目标设置状态和未开始状态 |
| active 小组 | memberships.status = active 的成员 |
| archived 小组 | 不使用实时 memberships 计算普通页面统计，读取归档快照 |
| dissolved 小组 | 普通统计页面不可见 |

### 8.4 当前统计资格规则

一条记录进入当前统计必须同时满足以下条件：

1. checkinRecords.groupId 等于当前 groupId。
2. checkinRecords.monthKey 等于当前统计自然月。
3. checkinRecords.status 为 valid 或 edited。
4. checkinRecords.sportDate 位于小组 lifecycleStartAt / lifecycleEndAt 所属自然月范围内。
5. 记录所属 membership 当前为 active。
6. 记录 membershipActivePeriodSeq 等于当前 active 参与区间，或满足退出重入补卡例外。
7. targetConfig 状态为 set 或 locked，且该成员在当前统计口径下可参与统计。
8. 记录不是后台审计专用、不是 invalidated。

退出重入补卡例外：

| 字段 / 条件 | 规则 |
|---|---|
| makeupForExitedPeriod = true | 表示该补卡发生在退出期间昨日或前天的允许补交范围内 |
| submitDate | 必须是重新加入后的 active 期间内日期 |
| sportDate | 必须是提交时允许补交的昨日或前天 |
| membershipActivePeriodSeq | 可以不同于当前 active 参与区间，但必须通过 createMakeup 写入时的服务端校验 |
| 统计处理 | 允许进入重新加入后的当前统计；退出期间其他日期不允许补卡，也不会进入当前统计 |

不进入当前统计但仍物理保留的记录：

| 场景 | 处理 |
|---|---|
| exited 成员退出前记录 | 不进入重新加入后的当前统计 |
| removed 成员记录 | 普通页面不可见，不进入当前统计 |
| invalidated 记录 | 不进入任何普通统计 |
| dissolved 小组记录 | 普通页面不可见，仅后台审计或争议追溯可查 |

### 8.5 单项目标进度计算

所有单项目标进度都使用：`progress = min(doneValue / targetValue, 1) * 100`。

展示层可以显示整数百分比或一位小数，但计算层应保留原始 doneValue、targetValue 和 progress，避免前端反推。

| 目标类型 | doneValue 计算 | targetValue | 达成日期判断 |
|---|---|---|---|
| calorieTotal | eligibleRecords 累计 calories | 目标 kcal | 累计 calories 首次达到目标值的 sportDate |
| durationTotal | eligibleRecords 累计 durationMinutes，展示时换算小时 | 目标小时换算为分钟 | 累计 durationMinutes 首次达到目标值的 sportDate |
| exerciseDays | 按 sportDate 分组，单日 eligibleRecords 累计 calories >= dailyMinCalories 的日期数 | 目标天数 | 达标日期数首次达到目标天数的 sportDate |
| exerciseTimes | 单条 eligibleRecord.calories >= perExerciseMinCalories 的记录数 | 目标次数 | 达标记录数首次达到目标次数的 sportDate |
| runningDistance | eligibleRecords 累计 runningDistanceKm | 目标 km | 累计距离首次达到目标值的 sportDate |
| cyclingDistance | eligibleRecords 累计 cyclingDistanceKm | 目标 km | 累计距离首次达到目标值的 sportDate |
| ringClosedDays | 按 sportDate 去重，存在至少一条 eligibleRecord.ringClosed = true 的日期数 | 目标天数 | 闭合日期数首次达到目标天数的 sportDate |

排序与重放规则：

- 统计以运动日期 sportDate 为日期口径。
- 补卡按被补运动日期 sportDate 计入进度，不按 submitDate 计入运动日期。
- 计算完成日期时，按 sportDate 升序重放；同一 sportDate 内多条记录的顺序不影响最终完成日期，因为展示粒度为日期。
- 单项目标超过目标值时 progress 仍最高为 100%，doneValue 可以保留真实累计值。
- 运动天数和三环闭合按日期去重，同一 sportDate 最多贡献 1 天。
- 运动次数按单条记录判断，不把同一 sportDate 多条未达标记录累计折算为次数。

### 8.6 个人综合进度与完成日期

个人统计输出结构建议：

| 字段 | 类型 | 说明 |
|---|---|---|
| membershipId | string | 成员关系 ID |
| userId | string | 用户 ID |
| nickname | string | 当前或快照昵称 |
| role | string | creator / member |
| targetStatus | string | unset / set / locked |
| coinValue | number | 一点币展示值，不参与统计 |
| targetProgressList | array | 每个已设置目标的 doneValue、targetValue、progress、achievedAt |
| overallProgress | number/null | 已设置目标进度平均值；未设置目标为空 |
| progressText | string | 未设置目标时为“未设置目标” |
| completed | boolean | 所有已设置目标是否均达到 100% |
| completedAt | string/null | 月目标完成日期，未完成或未设置为空 |
| incompleteSummary | string | 未完成摘要，用于复盘明细 |

个人综合进度规则：

| 场景 | overallProgress | completed | completedAt |
|---|---|---|---|
| 未设置任何目标 | null | false | null |
| 设置 1 个目标 | 该目标 progress | progress = 100 时 true | 该目标 achievedAt |
| 设置多个目标 | 所有已设置目标 progress 平均值 | 所有目标 progress = 100 时 true | 最后一个未完成目标首次达到 100% 的 sportDate |
| 退出后重新加入 | 按当前 active 参与区间和允许补卡例外重算 | 不继承退出前 completed | 重新达到完成条件后重新记录 |

完成日期解释：

- completedAt 使用统计口径中的运动日期 sportDate，而不是提交日期 submitDate。
- 对补卡而言，如果补交的 sportDate 使最后一个目标达到 100%，completedAt 展示该 sportDate。
- 归档后 completedAt 读取 archiveMemberSnapshots.completedAt，不再重算。

### 8.7 小组整体完成率

小组整体完成率输出结构建议：

| 字段 | 类型 | 说明 |
|---|---|---|
| activeMemberCount | number | 当前 active 成员数，或归档时 active 成员数 |
| completedMemberCount | number | completed = true 的成员数 |
| incompleteMemberCount | number | activeMemberCount - completedMemberCount |
| groupCompletionRate | number/null | 完成率百分比；无有效成员为空 |
| groupCompletionText | string | 无有效成员时为“暂无有效成员” |

计算规则：

| 场景 | 分母 | 分子 | 展示 |
|---|---|---|---|
| active 小组有 active 成员 | 当前 active 成员数 | completed = true 的 active 成员数 | round(completed / active * 100) |
| active 小组无 active 成员 | 0 | 0 | “暂无有效成员” |
| active 成员未设置目标 | 计入分母 | 不计入分子 | 视为未完成 |
| archived 小组 | 归档快照 activeMemberCount | 归档快照 completedMemberCount | 归档冻结值 |
| dissolved 小组 | 不计算普通展示 | 不计算普通展示 | 普通页面不可见 |

### 8.8 当前统计读取场景

| 场景 / 页面 | 接口 | 统计来源 | 返回重点 |
|---|---|---|---|
| 小组详情页 | groupApi.getGroupDetail | 当前 active 成员 + 实时 eligibleRecords 聚合 | 成员目标摘要、打卡状态、小组完成率摘要 |
| 成员目标详情页 | targetApi.getMemberTargetDetail | 当前 targetConfig + eligibleRecords | 成员目标进度、完成状态、最近记录摘要 |
| 我的首页 | groupApi.getHomeEntry / targetApi.getMyTargetDetail | 当前 active membership 聚合 | 当前小组目标摘要、归档入口摘要 |
| 我的目标详情页 | targetApi.getMyTargetDetail | 当前统计或归档快照 | 当前进度、完成状态、相关记录入口 |
| 打卡 / 补卡成功后 | checkinApi 返回记录摘要，页面刷新目标接口 | 服务端重新聚合 | 避免前端本地累加导致漂移 |

缓存策略：

- v1.0 不新增独立 statsCache 集合。
- 页面可以短暂保留本次请求结果用于展示，但页面重新进入或写操作成功后必须重新请求服务端。
- 如后续需要优化性能，可在不改变统计口径的前提下新增派生缓存，但缓存不得成为唯一事实来源。

### 8.9 归档快照生成流程

systemJobApi.archiveExpiredGroups 负责生成归档快照。

归档候选小组：

1. groups.status = active。
2. lifecycleEndAt 已早于当前北京时间归档触发时间。
3. groups.monthKey 属于待归档自然月。
4. 不存在同 groupId + monthKey 的 active archiveSnapshot。

归档步骤：

1. 读取 group，并加幂等保护。
2. 读取归档时 memberships.status = active 的成员列表。
3. 读取这些成员的 targetConfigs，状态为 set 或 locked 的配置参与统计。
4. 读取这些成员在 monthKey 内具备统计资格的 valid / edited checkinRecords。
5. 对每个 active 成员调用 statsHelpers.calculateMemberProgress。
6. 汇总 completedMemberCount、incompleteMemberCount、groupCompletionRate。
7. 写入 archiveSnapshots，保存 visibleMembershipIds / visibleUserIds。
8. 批量写入 archiveMemberSnapshots，保存 nickname、role、targetConfigSnapshot、progressSnapshot、completed、completedAt、incompleteSummary。
9. 更新 groups.status = archived、archivedAt、inviteStatus = disabled。
10. 写 GROUP_ARCHIVE auditLogs，记录归档数量、完成率、失败原因或 traceId。

失败处理：

| 失败点 | 处理 |
|---|---|
| 归档前发现 group 已 archived 且快照存在 | 视为幂等成功，跳过 |
| 快照已存在但 group 未 archived | 校验快照完整性后补更新 group.status，写一致性日志 |
| 成员快照部分写入失败 | 不把普通页面切到半成品；重试任务按唯一键补齐或重建缺失项 |
| 无 active 成员 | 仍生成 archiveSnapshot，activeMemberCount = 0，完成率展示“暂无有效成员” |
| dissolved 小组 | 跳过归档普通快照，不进入回顾页 |

### 8.10 归档读取模型

| 页面 | 读取集合 | 权限 | 展示 |
|---|---|---|---|
| 回顾首页 | archiveSnapshots | currentUserId in visibleUserIds | groupName、monthKey、activeMemberCount、groupCompletionRate |
| 归档复盘详情页 | archiveSnapshots + archiveMemberSnapshots | currentUserId in visibleUserIds | 冻结完成概览、成员完成明细 |
| 归档成员目标详情页 | archiveMemberSnapshots | 所属 archiveSnapshot.visibleUserIds 包含 currentUserId | 目标快照、各目标完成值、完成日期、只读照片入口 |
| 我的目标详情页中的已归档小组 | archiveSnapshots + archiveMemberSnapshots | currentUserId in visibleUserIds，优先匹配本人 membershipId | 本人在该归档小组的冻结目标详情 |

归档读取约束：

- reviewApi 不读取实时 targetConfigs 和 checkinRecords 重算普通归档页面。
- 归档页不返回任何新增、修改、删除入口状态。
- 归档快照生成后，即使成员退出、被移除或重新加入，普通归档页面仍按 visibleUserIds 判断只读可见。
- dissolved 小组不得出现在回顾首页或归档详情普通接口中。
- 后台审计或争议追溯可以读取原始数据，但不反写普通归档快照。

### 8.11 统计函数拆分建议

下一阶段 Tasks 可按以下纯函数和服务函数拆分：

| 函数 | 输入 | 输出 | 说明 |
|---|---|---|---|
| buildEligibleRecords | group、membership、records、activePeriodSeq | eligibleRecords | 过滤 valid / edited、参与区间、补卡例外 |
| calculateGoalProgress | targetType、goalConfig、eligibleRecords | goalProgress | 计算单项目标完成值、进度、达成日期 |
| calculateMemberProgress | membership、targetConfig、eligibleRecords | memberProgress | 计算个人综合进度、完成状态、完成日期 |
| calculateGroupSummary | memberProgressList | groupSummary | 计算成员完成数和小组整体完成率 |
| buildArchiveSnapshotPayload | group、visibleMembers、memberProgressList | archiveSnapshot + memberSnapshots | 生成归档写入 payload |
| formatIncompleteSummary | goalProgressList | string | 生成“运动次数差 3 次”等简短摘要 |

测试重点：

- 运动天数按同日累计热量，运动次数按单条记录热量。
- 三环闭合同日去重。
- 单项目标 progress 封顶 100%。
- 未设置目标显示“未设置目标”。
- 无 active 成员显示“暂无有效成员”。
- 退出重入后不继承退出前完成状态和完成日期。
- 归档后不因实时数据变化重算。

### 8.12 第 8 步交叉检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 统计复盘 | 覆盖每类目标进度、完成成员、完成日期、小组完成率和归档冻结 |
| PRD 统计规则 | active 成员、有效目标配置、退出重入、归档只读和完成日期规则均已落成服务端统计口径 |
| Spec STATS | STATS-FUNC-001 至 STATS-FUNC-014、STATS-AC-001 至 STATS-AC-018 均有对应计算或读取规则 |
| 流程图统计泳道 | 统计前提、目标参与统计、小组完成率、退出重入重算、归档快照均已映射 |
| 原型图 | 小组详情、成员目标详情、我的目标详情、回顾首页、归档复盘详情、归档成员目标详情均有数据来源 |
| 数据模型 | 复用 targetConfigs、checkinRecords、archiveSnapshots、archiveMemberSnapshots，不新增 v1.0 非必要集合 |
| 权限模型 | 当前统计按 active membership，归档按 visibleUserIds，dissolved 普通页面不可见 |
| MVP 边界 | 不包含一点币结算、排行榜、点赞评论、订阅提醒或外部运动数据接入 |

## 9. 前端页面、组件与交互状态设计

### 9.1 设计目标

本章把 16 个原型页面落成微信小程序页面结构、公共组件、页面状态、服务调用和交互约束。

本章回答：

- 每个原型页面对应哪个页面模块、调用哪些 service。
- 哪些 UI 能抽为公共组件，哪些保留在页面内。
- 页面 loading、empty、error、forbidden、readonly 状态如何统一展示。
- 表单校验、确认弹窗、照片上传、统计展示如何与云函数规则衔接。
- 下一阶段 Tasks 如何按页面、组件、service 和公共工具拆分。

本章不做最终视觉稿，不新增 Spec 未确认的页面功能，不把业务核心判断放到页面层。

### 9.2 页面路由建议

| 原型 | 页面职责 | 建议路径 | 主要 service |
|---|---|---|---|
| 01 首页 / 小组入口页 | 展示当前小组、创建 / 加入口、归档摘要入口 | pages/home/index | groupService.getHomeEntry |
| 02 创建小组页 | 创建本月 active 或下月 upcoming 小组 | pages/group/create | groupService.createGroup |
| 03 加入小组页 | 邀请码预览、昵称输入、加入确认 | pages/group/join | groupService.getJoinPreview、joinGroup |
| 04 目标类型页 | 选择目标类型 | pages/target/types | targetService.getTargetConfig |
| 05 目标值页 | 填写目标值和一点币 | pages/target/values | targetService.saveTargetConfig |
| 06 小组详情页 | 小组信息、成员列表、统计摘要、入口聚合 | pages/group/detail | groupService.getGroupDetail |
| 07 小组管理页 | 创建者管理、转让、移除、退出、解散 | pages/group/manage | groupService.getGroupManagement、group 写操作 |
| 08 成员目标详情页 | 查看同组成员目标、进度、记录摘要 | pages/member/target-detail | targetService.getMemberTargetDetail |
| 09 打卡页 | 今日打卡表单、照片上传、备注 | pages/checkin/create | checkinService.getCheckinContext、createCheckin |
| 10 补卡页 | 昨日 / 前天补卡表单、照片上传、备注 | pages/checkin/makeup | checkinService.getCheckinContext、createMakeup |
| 11 打卡记录页 | 本人打卡 / 补卡历史、当天修改入口 | pages/checkin/records | checkinService.getCheckinRecords、updateCheckinRecord |
| 12 我的首页 | 我的当前小组与目标摘要 | pages/me/index | groupService.getHomeEntry、targetService.getMyTargetDetail |
| 13 我的目标详情 | 切换小组查看本人目标详情 | pages/me/target-detail | targetService.getMyTargetDetail |
| 14 回顾首页 | 可见归档小组列表 | pages/review/index | reviewService.getReviewHome |
| 15 归档复盘详情页 | 冻结完成概览、成员完成明细 | pages/review/detail | reviewService.getArchiveReviewDetail |
| 16 归档成员目标详情页 | 归档成员目标完成详情 | pages/review/member-detail | reviewService.getArchiveMemberTargetDetail |

页面命名可以在实现阶段按小程序目录习惯微调，但 service 调用和权限边界不得改变。

### 9.3 前端分层

| 层级 | 建议目录 | 职责 |
|---|---|---|
| pages | miniprogram/pages | 页面生命周期、路由参数、组合组件、触发 service |
| components | miniprogram/components | 复用展示和输入组件，不直接调用云函数 |
| services | miniprogram/services | 封装 wx.cloud.callFunction、统一 requestId、响应解析和错误转换 |
| utils | miniprogram/utils | 日期格式、单位换算、表单基础校验、图片选择辅助 |
| constants | miniprogram/constants | 枚举、错误码映射、目标类型配置、页面文案 key |
| types | miniprogram/types | 共享数据结构类型定义 |

约束：

- 页面不得直接调用 wx.cloud.database 修改核心集合。
- 组件不得自行访问云函数，除非是由页面注入的回调触发 service。
- 目标进度、完成日期、统计资格、权限结果均使用服务端返回。
- 前端基础校验只用于即时提示，服务端失败仍必须按统一错误状态展示。

### 9.4 统一页面状态模型

页面级状态建议使用统一枚举：

| 状态 | 触发 | 展示 |
|---|---|---|
| loading | 首次进入或刷新数据中 | 骨架或加载提示，避免空白 |
| ready | 数据加载成功且有可展示主体 | 展示页面主体 |
| empty | 列表或统计无数据 | 展示明确原因和下一步入口 |
| error | 网络、云函数或提交失败 | 展示错误原因和重试入口 |
| forbidden | 无权限、已退出、被移除或无可见快照 | 展示无权限说明，不暴露对象敏感数据 |
| readonly | archived 或归档快照页面 | 展示只读标识，隐藏提交 / 修改 / 删除入口 |

页面内部可有局部状态：

| 局部状态 | 使用场景 |
|---|---|
| submitting | 创建、加入、保存目标、打卡、补卡、管理操作提交中 |
| uploading | 照片上传中 |
| photoLoadFailed | 单张照片临时 URL 或图片加载失败 |
| fieldError | 表单字段即时校验错误 |
| confirmOpen | 退出、移除、转让、解散等二次确认 |

### 9.5 公共组件设计

| 组件 | 使用页面 | props / 事件 | 说明 |
|---|---|---|---|
| PageState | 全部页面 | state、message、onRetry | 统一 loading / empty / error / forbidden 展示 |
| BottomTab | 首页、打卡、我的、回顾相关页面 | current、items | 只做导航展示，不判断权限 |
| GroupCard | 首页、我的首页、回顾首页 | groupSummary、mode | 展示当前小组或归档小组摘要 |
| MemberList | 小组详情、归档复盘详情 | members、readonly、onSelect | 展示 active 或归档成员明细 |
| GoalTypeSelector | 目标类型页 | selectedTypes、disabled、onChange | 目标类型选择，不保存数据 |
| TargetValueForm | 目标值页 | selectedTypes、initialValues、lockState、onSubmit | 目标值、一点币和阈值输入 |
| TargetProgressList | 小组详情、成员详情、我的目标详情、归档详情 | progressList、readonly | 展示每类目标进度 |
| CompletionSummary | 小组详情、回顾详情 | groupSummary、memberSummary | 展示完成成员数、完成日期、整体完成率 |
| CheckinForm | 打卡页、补卡页、记录修改 | context、initialRecord、onSubmit | 运动数据、备注、照片组合表单 |
| PhotoUploader | 打卡、补卡、记录修改 | files、limit=3、readonly、onChange、onRetry | 选择、预览、上传状态和失败重试 |
| RecordList | 打卡记录页、成员目标详情 | records、readonly、onEdit | 展示 valid / edited 记录和补卡标记 |
| ConfirmDialog | 管理页敏感操作 | title、content、confirmText、onConfirm | 二次确认，不替代服务端权限 |
| InlineNotice | 加入、打卡、补卡、目标锁定 | type、text | 可见性提示、锁定原因、限制状态 |

组件边界：

- PhotoUploader 只负责选择、预览、上传进度和本地文件状态；cloudPath 由 photoService 获取。
- TargetProgressList 不计算 progress，只展示服务端返回的 progress。
- ConfirmDialog 只负责用户确认，不决定能否操作。
- PageState 的 forbidden 状态不得显示无权限对象的名称、成员列表或目标内容。

### 9.6 页面交互设计

| 页面 | 初始加载 | 主要交互 | 特殊状态 |
|---|---|---|---|
| 首页 / 小组入口页 | getHomeEntry | 创建小组、输入邀请码 / 进入加入页、进入当前小组、进入归档入口 | 无当前小组、存在归档、无权限对象过滤 |
| 创建小组页 | 本地生成本月 / 下月说明 | 填名称、选择月份、提交创建 | 名称为空、创建成功进入目标设置或小组详情 |
| 加入小组页 | getJoinPreview | 输入昵称、确认加入 | 小组满员、邀请码无效、archived / dissolved、removed 不可重入 |
| 目标类型页 | getTargetConfig | 勾选目标类型、下一步 | locked 只读、archived 只读、无权限 |
| 目标值页 | 接收目标类型并加载已有值 | 填目标值 / 阈值 / 一点币、保存 | 目标值无效、active 首次保存后锁定 |
| 小组详情页 | getGroupDetail | 查看成员、进入打卡 / 补卡 / 管理 / 成员详情 | upcoming 隐藏打卡补卡、active 展示统计、无 active 成员空统计 |
| 小组管理页 | getGroupManagement | 修改名称、转让、退出、移除、解散 | 非创建者 forbidden、敏感操作确认、创建者退出前未转让 |
| 成员目标详情页 | getMemberTargetDetail | 查看目标进度、记录摘要、照片 | 只能查看 active 成员；照片失败局部重试 |
| 打卡页 | getCheckinContext | 填运动数据、上传照片、备注、提交 | 未设置目标、5 次上限、照片 1 至 3、备注超长 |
| 补卡页 | getCheckinContext | 选择昨日 / 前天、填数据、上传照片、提交 | 今日误用补卡、补卡 3 次用完、补卡日期超范围 |
| 打卡记录页 | getCheckinRecords | 查看本人记录、提交当天进入修改 | invalidated 默认不展示、修改超时、照片局部失败 |
| 我的首页 | getHomeEntry / getMyTargetDetail | 查看当前小组和目标摘要、进入目标详情 | 无小组、归档摘要入口 |
| 我的目标详情 | getMyTargetDetail | 切换小组、查看目标进度、进入记录 | 当前小组实时统计；归档小组只读快照 |
| 回顾首页 | getReviewHome | 查看归档列表、进入归档详情 | 无归档展示空状态；dissolved 不展示 |
| 归档复盘详情页 | getArchiveReviewDetail | 查看冻结概览、成员明细、进入成员详情 | readonly；无权限 forbidden |
| 归档成员目标详情页 | getArchiveMemberTargetDetail | 查看成员冻结目标详情和照片 | readonly；照片只读重试 |

### 9.7 表单与前端基础校验

| 表单 | 前端即时校验 | 服务端最终校验 |
|---|---|---|
| 创建小组 | 小组名称非空、长度提示 | 名称长度、用户身份、月份状态、创建者 membership 创建 |
| 加入小组 | 昵称非空、长度提示 | 邀请码、人数上限、removed、archived / dissolved、昵称长度 |
| 目标设置 | 至少选择一个目标类型、数字格式、阈值必填 | 目标类型枚举、目标值正数、状态 set / locked、active 首次保存规则 |
| 打卡 | 目标依赖字段必填、照片 1 至 3、备注 100 字 | active group / membership、target locked、5 次上限、照片归属、静态图片 |
| 补卡 | 日期只能选昨日 / 前天、照片和备注规则 | active group、每日补卡 3 次、被补日期 5 次上限、退出期间例外 |
| 记录修改 | 当前页面判断提交当天、照片 1 至 3 | 本人记录、submitDate 当天、valid / edited、照片归属 |
| 管理操作 | 二次确认 | creator 权限、目标成员 active、不可移除自己导致异常、不可解散 archived / dissolved |

规则：

- 前端提示文案使用 Spec 12.2 的建议文案，不自造冲突文案。
- 前端校验通过不代表提交一定成功；服务端错误必须覆盖前端乐观判断。
- 写操作成功后刷新对应查询接口，不靠本地模拟最终状态。

### 9.8 照片前端交互

PhotoUploader 状态流：

1. empty：未选择照片，展示上传入口和 1 至 3 张限制。
2. selected：本地已选择，展示缩略图和删除 / 替换入口。
3. preparing：调用 photoApi.createPhotoUploadSlots。
4. uploading：逐张 wx.cloud.uploadFile。
5. uploaded：拿到 fileId / cloudPath，允许提交表单。
6. failed：单张上传失败，展示“运动照片上传失败，请重试”。
7. readonly：归档或查看他人记录时只读展示。
8. loadFailed：临时 URL 加载失败，展示“照片加载失败，请重试”。

约束：

- 未达到 1 张或超过 3 张时，打卡 / 补卡 / 修改按钮不可提交，并展示“请上传 1 至 3 张运动照片”。
- GIF、视频或非图片文件在选择后即时提示；服务端仍二次拒绝。
- 任一必填照片上传失败时不得调用 createCheckin / createMakeup。
- 归档和他人记录查看状态下不得显示新增、删除、替换入口。
- 加入小组页或首次上传运动照片前展示可见性提示。

### 9.9 只读、无权限与不可见处理

| 场景 | 前端处理 |
|---|---|
| archived 当前页面 | 使用 readonly 状态，隐藏提交、修改、删除、打卡、补卡入口 |
| 归档回顾页面 | 使用 readonly 状态，只展示快照和照片重试 |
| dissolved 小组 | 普通入口不展示；若深链访问，显示“小组已解散” |
| exited / removed 成员访问原小组 | 显示“你已不属于该小组”，不展示小组敏感数据 |
| 无权限归档 | 显示“无权限查看”，不展示 groupName 或成员明细 |
| invalidated 记录 | 普通记录列表默认不展示 |

页面不得用隐藏按钮替代服务端授权。任何深链、分享入口或本地缓存进入页面时，都必须以接口返回的权限结果为准。

### 9.10 页面数据刷新策略

| 触发 | 刷新策略 |
|---|---|
| onLoad | 读取路由参数，调用页面主查询接口 |
| onShow | 对首页、小组详情、我的首页、回顾首页执行轻量刷新 |
| 写操作成功 | 刷新当前页面主查询接口和必要的上级页面摘要 |
| 上传照片成功 | 仅更新本地上传状态；提交成功后再刷新服务端记录 |
| 临时 URL 过期或加载失败 | 调用 photoService.getPhotoTempUrls 局部重试 |
| 网络失败 | 保留当前表单输入，展示重试或重新提交入口 |

不做：

- v1.0 不设计离线提交队列。
- v1.0 不做跨设备实时推送刷新。
- v1.0 不把统计结果长期缓存在本地作为事实来源。

### 9.11 下一阶段 Tasks 拆分提示

第 9 章已把前端实现拆到可执行粒度，下一阶段 04-tasks.md 可按以下顺序拆任务：

1. 小程序基础目录、路由、app 初始化和云开发初始化。
2. services 层统一 callFunction、requestId、错误转换。
3. 通用 PageState、ConfirmDialog、InlineNotice、BottomTab 组件。
4. 目标相关组件：GoalTypeSelector、TargetValueForm、TargetProgressList。
5. 照片组件：PhotoUploader 与 photoService 串联。
6. 小组创建 / 加入 / 首页 / 小组详情页面。
7. 目标设置、成员目标详情、我的首页、我的目标详情页面。
8. 打卡、补卡、打卡记录与记录修改页面。
9. 小组管理页面及敏感操作确认。
10. 回顾首页、归档复盘详情、归档成员目标详情页面。
11. 页面级状态、错误文案、只读和无权限状态统一验收。

这些任务仍应结合第 6 章接口、第 7 章照片方案、第 8 章统计口径，以及第 10 至第 12 章的错误码、性能、安全、测试设计最终落地。

### 9.12 第 9 步交叉检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 页面层职责 | 页面只展示和交互，不承载核心业务判断；核心权限和统计仍在服务端 |
| PRD 页面范围 | 创建、加入、目标、打卡、补卡、查看、管理、统计复盘和归档回顾均有页面映射 |
| Spec 页面状态 | loading、empty、error、forbidden、readonly 与 Spec 12.1 对齐 |
| Spec 提示文案 | 关键错误和确认文案使用 Spec 12.2，不自造相反语义 |
| 流程图页面泳道 | 创建、加入、目标、打卡、查看统计、管理、归档流程均映射到页面和 service |
| 16 个原型图 | 每个原型均有建议路径、主 service、交互状态和特殊约束 |
| 数据 / 接口设计 | 页面读取与写入均通过第 6 章 service，不直写核心集合 |
| 照片设计 | PhotoUploader 与第 7 章上传、只读、失败重试规则一致 |
| 统计设计 | 前端只展示第 8 章返回的进度、完成日期和归档快照，不自行重算 |
| MVP 边界 | 不新增聊天、点赞、评论、排行榜、订阅提醒、微信运动步数或离线队列 |

## 10. 错误码、响应结构与日志设计

### 10.1 设计目标

本章把 Constitution 的统一响应、错误码和重要接口日志要求落成可实现的技术规则，并与 Spec 12.2 的关键提示文案建立映射。

本章回答：

- 云函数 success / failure 的统一响应结构如何固定。
- 错误码如何分层，如何映射到前端页面状态和提示文案。
- 哪些操作写 auditLogs，哪些只记录错误日志或 traceId。
- 日志中哪些信息可以保存，哪些敏感内容不得保存。

### 10.2 统一响应结构

所有云函数 action 返回统一结构：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "操作成功",
  "data": {},
  "traceId": "trace_xxx"
}
```

失败响应：

```json
{
  "success": false,
  "code": "AUTH_FORBIDDEN",
  "message": "无权限查看。",
  "data": null,
  "traceId": "trace_xxx"
}
```

字段约束：

| 字段 | 必填 | 说明 |
|---|---|---|
| success | 是 | true / false，前端只按该字段判断成功或失败 |
| code | 是 | 可枚举错误码；成功固定为 SUCCESS |
| message | 是 | 可直接展示或映射到 Spec 12.2 文案 |
| data | 是 | 成功返回业务数据；失败返回 null 或安全的辅助信息 |
| traceId | 是 | 单次请求追踪 ID，用于日志定位 |

约束：

- 前端不得依赖模糊 message 字符串判断业务逻辑。
- 无权限和不可见对象失败时，data 不得返回对象敏感信息。
- 写操作失败不得返回部分成功语义；事务失败应整体失败。
- requestId 用于写操作幂等，traceId 用于问题排查，两者职责不同。

### 10.3 错误码分层

| 分类 | 前缀 | 适用场景 | 页面状态 |
|---|---|---|---|
| 通用 | COMMON_ | 参数缺失、格式错误、系统错误、重复提交 | error |
| 登录鉴权 | AUTH_ | 未登录、无权限、membership 不可见 | forbidden / error |
| 小组 | GROUP_ | 小组满员、归档、解散、邀请码无效 | error / forbidden / readonly |
| 成员关系 | MEMBER_ | 已退出、被移除、创建者退出前未转让 | forbidden / error |
| 目标 | TARGET_ | 未设置目标、目标锁定、目标值非法 | error / readonly |
| 打卡 | CHECKIN_ | 5 次上限、修改超时、运动数据非法 | error |
| 补卡 | MAKEUP_ | 日期超范围、每日 3 次用完、今日误用补卡 | error |
| 照片 | PHOTO_ | 数量非法、类型非法、上传或加载失败 | error / 局部失败 |
| 归档 | ARCHIVE_ | 快照不存在、无归档权限、归档任务失败 | forbidden / error |
| 统计 | STATS_ | 无有效成员、未设置目标、统计数据不一致 | empty / error |
| 系统任务 | JOB_ | 激活、归档、补锁等系统任务异常 | 不直接面向普通页面 |

### 10.4 核心错误码映射

| 错误码 | message / 展示文案 | 触发场景 |
|---|---|---|
| SUCCESS | 操作成功 | 请求成功 |
| COMMON_INVALID_PARAM | 请求参数无效。 | 参数缺失、类型错误、枚举非法 |
| COMMON_DUPLICATE_REQUEST | 请求处理中，请勿重复提交。 | requestId 重复或短时间重复写入 |
| COMMON_SYSTEM_ERROR | 系统异常，请稍后重试。 | 未预期异常 |
| AUTH_LOGIN_REQUIRED | 请先登录后继续。 | 未登录访问需身份页面或操作 |
| AUTH_FORBIDDEN | 无权限查看。 | 无权限查看对象或归档 |
| GROUP_NOT_STARTED | 小组尚未开始，暂不能打卡或补卡。 | upcoming 小组打卡 / 补卡 |
| GROUP_ARCHIVED | 归档小组仅可查看。 | archived 小组写操作 |
| GROUP_DISSOLVED | 小组已解散。 | dissolved 小组普通访问或写操作 |
| GROUP_FULL | 小组人数已满。 | 加入超过 50 人上限 |
| GROUP_INVITE_INVALID | 邀请码无效。 | 邀请码不存在、过期或禁用 |
| MEMBER_NOT_ACTIVE | 你已不属于该小组。 | exited / removed 成员访问普通页或操作 |
| MEMBER_CREATOR_TRANSFER_REQUIRED | 请先转让创建者身份。 | 创建者退出前未转让 |
| TARGET_REQUIRED | 请先设置目标。 | 未设置目标时打卡 / 补卡 |
| TARGET_LOCKED | 目标已锁定。 | locked 后修改目标 |
| TARGET_INVALID_VALUE | 请输入有效目标值。 | 目标数值非法 |
| TARGET_INVALID_COIN | 请输入有效一点币值。 | 一点币为空、非数字或小于 0 |
| CHECKIN_INVALID_METRICS | 请输入有效运动数据。 | 目标依赖字段缺失或运动数据非法 |
| CHECKIN_LIMIT_REACHED | 该运动日期已达到 5 次有效打卡上限。 | 同运动日期物理有效记录达到 5 次 |
| CHECKIN_EDIT_EXPIRED | 仅可在提交当天修改。 | 非提交当天修改记录 |
| MAKEUP_USE_CHECKIN_TODAY | 今日运动请使用打卡。 | 补卡选择今天 |
| MAKEUP_DATE_OUT_OF_RANGE | 只能补昨日或前天的卡。 | 补卡日期超范围 |
| MAKEUP_DAILY_LIMIT_REACHED | 今日补卡次数已用完。 | 每自然日补卡达到 3 次 |
| PHOTO_COUNT_INVALID | 请上传 1 至 3 张运动照片。 | 照片数量小于 1 或大于 3 |
| PHOTO_TYPE_INVALID | 仅支持上传静态运动照片。 | GIF、视频或非图片文件 |
| PHOTO_UPLOAD_FAILED | 运动照片上传失败，请重试。 | 上传云存储失败 |
| PHOTO_LOAD_FAILED | 照片加载失败，请重试。 | 临时 URL 或图片加载失败 |
| REMARK_TOO_LONG | 备注最多 100 字。 | 备注超长 |
| STATS_TARGET_UNSET | 未设置目标。 | 未设置目标统计展示 |
| STATS_NO_ACTIVE_MEMBER | 暂无有效成员。 | 小组整体完成率分母为 0 |
| ARCHIVE_NOT_FOUND | 暂无可查看归档。 | 归档快照不存在或不可见 |

说明：

- 错误码全集可以在实现阶段放入 constants / errorCodes 文件，但不得改变上述语义。
- 后续新增错误码必须归入现有前缀，并补充页面文案映射。

### 10.5 日志与审计分类

| 类型 | 落库 | 面向普通页面 | 用途 |
|---|---|---|---|
| auditLogs | 是 | 否 | 关键业务行为、敏感操作、状态变化、争议追溯 |
| error log | 可复用 auditLogs 或云函数日志 | 否 | 参数异常、权限拒绝、状态不一致、系统任务失败 |
| traceId | 响应返回 + 日志记录 | 可展示给客服或调试 | 串联单次请求 |
| page local log | 否 | 否 | v1.0 不设计本地日志上报 |

必须写 auditLogs 的操作：

| 操作 | actionType 建议 | 记录重点 |
|---|---|---|
| 创建小组 | GROUP_CREATE | actor、groupId、monthKey、status |
| 加入 / 重新加入小组 | MEMBER_JOIN / MEMBER_REJOIN | membershipId、activePeriodSeq、来源 inviteCode |
| 保存目标 | TARGET_SAVE | targetConfigId、status、selectedGoalTypes |
| 打卡 / 补卡提交 | CHECKIN_CREATE / MAKEUP_CREATE | recordId、sportDate、submitDate、照片数量 |
| 记录修改 | CHECKIN_UPDATE | recordId、before / after 摘要、editCount |
| 修改小组名称 | GROUP_RENAME | groupId、before / after |
| 转让创建者 | CREATOR_TRANSFER | oldCreatorMembershipId、newCreatorMembershipId |
| 退出 / 移除成员 | MEMBER_EXIT / MEMBER_REMOVE | membershipId、before / after status |
| 解散小组 | GROUP_DISSOLVE | groupId、dissolvedAt、actor |
| 月末归档 | GROUP_ARCHIVE | archiveSnapshotId、memberCount、completionRate |
| 权限拒绝 | AUTH_DENY | actor、targetType、targetId、code，不暴露敏感内容 |
| 系统一致性异常 | SYSTEM_INCONSISTENCY | groupId / targetId、错误摘要、traceId |

### 10.6 日志数据安全

日志允许保存：

- userId、membershipId、groupId、recordId、archiveSnapshotId 等业务 ID。
- 状态变化前后的枚举值。
- 数值类摘要，如照片数量、目标类型列表、完成率、成员数量。
- 错误码、traceId、requestId、actionType、createdAt。

日志不得保存：

- 图片二进制、临时访问 URL、完整云存储下载 URL。
- 不必要的用户隐私信息。
- 大段备注全文；记录修改审计只保存必要摘要或长度变化，必要时通过原始记录追溯。
- openid 之外的敏感凭据、session、token。

### 10.7 第 10 步交叉检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 接口约束 | 统一响应、可识别错误码、权限控制、重要接口日志均已落成 |
| PRD 数据与安全要求 | 关键行为、状态变化和错误日志均有审计设计 |
| Spec 12.2 文案 | 核心错误码均映射到已确认提示文案 |
| 第 6 章接口设计 | success / code / message / data / traceId 与云函数响应结构一致 |
| 第 9 章页面状态 | 错误码可映射到 error / forbidden / readonly / empty / 局部照片失败 |
| MVP 边界 | 不设计普通用户侧日志页、客服系统或本地日志上报 |

## 11. 安全、性能与并发控制设计

### 11.1 设计目标

本章把 Constitution、PRD 和 Spec 中的数据安全、资源约束、性能目标、并发与幂等要求落成实现边界。

本章回答：

- 如何避免越权读取、越权写入和无权限对象泄露。
- 如何控制小程序包体、图片上传和云函数查询性能。
- 哪些操作必须做幂等和并发保护。
- 解散、退出、移除、归档等高风险场景如何保持普通页面不可见和数据可追溯。

### 11.2 安全边界

| 安全点 | 技术要求 |
|---|---|
| 登录身份 | 所有需身份接口先构造 authContext，未登录返回 AUTH_LOGIN_REQUIRED |
| 普通页面数据 | 必须通过 permissionGuards 查询过滤，不直接信任前端传入 userId / membershipId |
| 创建者权限 | creator 必须绑定 active membership；管理操作服务端二次校验 |
| 归档权限 | 只按 archiveSnapshots.visibleUserIds / visibleMembershipIds 判断普通归档可见性 |
| dissolved 小组 | 普通页面接口统一拒绝或过滤，不返回小组名称、成员、目标、记录或照片 URL |
| exited / removed 成员 | 普通页面不可见，不计入当前统计；removed 不可重入 |
| 照片访问 | 只返回经权限校验的临时 URL，不保存永久公开 URL |
| 审计日志 | 普通页面不可见，仅后台审计或争议追溯使用 |
| 数据删除 | v1.0 不设计核心业务数据物理删除；退出、移除、解散、作废均通过状态字段表达 |

### 11.3 资源与包体控制

| 资源 | 控制方式 |
|---|---|
| 小程序主包 | 控制在 2MB 内；不放大量图片、视频、字体、测试文件 |
| 运动照片 | 必须进入微信云存储；数据库只存 fileId / cloudPath / 元信息 |
| 原型与文档资源 | 不进入小程序正式包 |
| 第三方依赖 | v1.0 使用微信原生小程序与云开发，不新增大型 UI 框架 |
| 订阅消息 / 微信运动 | v1.0 不启用，不预埋复杂实现 |

### 11.4 性能目标与策略

| 场景 | 目标 / 约束 | 技术策略 |
|---|---|---|
| 创建小组 | 创建者 1 分钟内完成创建并获得邀请方式 | createGroup 一次完成 group、membership、targetConfig 写入 |
| 设置月计划 | 成员 3 分钟内完成目标设置 | 目标类型和目标值分步，保存接口返回锁定状态和下一步入口 |
| 打卡 | 非首次授权且网络与图片上传正常时 30 秒内完成 | 最多 3 张照片并发上传，提交前本地校验，提交后只刷新必要摘要 |
| 小组详情 | active 成员列表和统计摘要可快速展示 | 接口聚合页面所需数据，避免前端多次拼接查询 |
| 归档回顾 | 读取冻结快照 | reviewApi 读取 archiveSnapshots / archiveMemberSnapshots，不实时重算 |
| 照片展示 | 避免一次拉取大量临时 URL | 列表优先展示数量或缩略入口，详情按需获取临时 URL |

### 11.5 并发与幂等控制

| 操作 | 风险 | 控制方式 |
|---|---|---|
| createGroup | 重复点击创建多个小组 | requestId 幂等；同用户同 monthKey 创建策略由服务端控制 |
| joinGroup | 人数超限、重复加入 | 事务或并发保护重读 activeMemberCount；membership 唯一键 |
| saveTargetConfig | active 首次保存重复提交 | targetConfigs 唯一键 + status 状态机；locked 后拒绝修改 |
| createCheckin | 5 次上限并发突破 | 写入前在服务端重读同 sportDate valid / edited 记录数，并在事务中创建 |
| createMakeup | 每日 3 次补卡和被补日期 5 次上限突破 | 同时校验 submitDate 补卡次数和 sportDate 物理有效记录上限 |
| updateCheckinRecord | 超时修改或覆盖写 | 校验本人、submitDate 当天、status valid / edited；editCount 递增 |
| transferCreator | 创建者身份错乱 | 事务更新 memberships role 和 groups.creatorMembershipId |
| exitGroup | 创建者未转让退出 | 服务端拒绝；非创建者退出更新 membership status |
| removeMember | 移除已非 active 成员 | 服务端重读 targetMembership.status，只允许 active -> removed |
| dissolveGroup | 重复解散或解散后仍可见 | groups.status 状态机控制；dissolved 后普通查询过滤 |
| archiveExpiredGroups | 重复归档或半成品快照 | archiveSnapshots groupId + monthKey 唯一；任务可重试且幂等 |
| createPhotoUploadSlots | 上传路径伪造或重复 | cloudPath 服务端生成；checkinApi 绑定时复校路径归属 |

### 11.6 数据一致性保护

- 状态流转以第 4 章状态机为准，不允许页面直接改状态字段。
- 所有写接口必须在写入前重新读取关键状态，不能信任页面缓存。
- 统计资格不写死在 checkinRecords 上，由第 8 章 statsHelpers 统一判断。
- 归档快照一旦生成，普通页面不因实时数据变化重算。
- activeMemberCount 等冗余字段只作展示或性能辅助，写操作仍以 memberships 实际状态为准。
- 发现冗余字段不一致时，记录 SYSTEM_INCONSISTENCY，不用错误冗余值覆盖事实数据。

### 11.7 第 11 步交叉检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 权限与安全 | 用户只能访问有权限数据、重要操作保留审计、核心数据不物理删除均已映射 |
| PRD 性能目标 | 创建 1 分钟、目标 3 分钟、打卡 30 秒目标均有技术策略 |
| PRD / Spec 资源约束 | 小程序包体、图片云存储、本地不放大资源均已映射 |
| Spec 状态机 | 并发控制按 group / membership / target / checkin 状态机执行 |
| 流程图云函数泳道 | 登录权限、创建加入、提交限制、管理审计、归档任务均有保护策略 |
| MVP 边界 | 不引入外部设备、订阅消息、大型第三方框架或普通用户日志页 |

## 12. 测试设计与验收映射

### 12.1 设计目标

本章把 Constitution 的测试原则、PRD 发布前验收标准和 Spec 验收标准映射到下一阶段 Tasks 可执行的测试范围。

本章不编写具体测试代码，但明确每类任务完成时应验证什么。

### 12.2 测试层级

| 层级 | 测试对象 | 重点 |
|---|---|---|
| 单元测试 / 纯函数测试 | dateUtils、validators、stateGuards、statsHelpers、photoGuards | 日期、校验、状态、统计口径、照片路径与类型 |
| 云函数测试 | authApi、groupApi、targetApi、checkinApi、reviewApi、photoApi、systemJobApi | 参数、权限、状态流转、幂等、响应结构 |
| 数据库权限 / 查询测试 | 核心集合与查询封装 | active / archived / dissolved / exited / removed 可见性 |
| 小程序页面自测 | 16 个页面与公共组件 | loading、empty、error、forbidden、readonly、表单与导航 |
| 端到端流程验收 | 创建、加入、目标、打卡、补卡、统计、管理、归档 | 核心流程无阻断，状态和数据正确 |
| 回归测试 | 修改 Spec 或 Technical Design 后 | 受影响功能、权限、统计和归档不回退 |

### 12.3 核心测试矩阵

| 功能域 | 必测内容 | 依据 |
|---|---|---|
| 登录与权限 | 未登录、无权限、active 成员、creator、exited、removed、归档可见成员、dissolved | Spec AUTH / VIEW |
| 创建小组 | 本月 active、下月 upcoming、名称校验、创建者 membership、邀请信息 | PRD 创建验收、Spec GROUP |
| 加入小组 | 邀请码、满员、archived / dissolved 拒绝、removed 拒绝、exited 重入 | Spec JOIN / MEMBER |
| 目标设置 | 目标类型、目标值、阈值、一点币、upcoming 可改、active 首次保存后 locked | Spec TARGET |
| 打卡 | active + locked、运动数据依赖、照片 1 至 3、备注 100 字、5 次上限、当天修改 | Spec CHECKIN |
| 补卡 | 仅昨日 / 前天、每日 3 次、被补日期 5 次、退出期间例外、补卡当天修改 | Spec MAKEUP |
| 照片 | 静态图片、GIF / 视频拒绝、上传失败、加载失败、临时 URL 权限、归档只读 | Spec DATA / CHECKIN / MAKEUP / VIEW |
| 当前统计 | 单项目标、综合进度、完成日期、无目标、无有效成员、退出重入重算 | Spec STATS |
| 归档 | 生成快照、visibleUserIds、只读、不重算、成员详情冻结、dissolved 不展示 | Spec STATS / VIEW |
| 管理 | 改名、转让、退出、移除、解散、二次确认、审计记录 | Spec RELATION |
| 页面状态 | 加载、空、错误、无权限、只读、关键提示文案 | Spec 12 |

### 12.4 统计专项测试

| 用例 | 期望 |
|---|---|
| 单项目标完成值超过目标值 | progress 封顶 100%，doneValue 保留真实值 |
| 多目标部分达成 | overallProgress 为平均值，completed=false |
| 所有目标首次达成 | completed=true，completedAt 为最后一个目标达成的 sportDate |
| 未设置目标 | 显示“未设置目标”，不按 0% 参与综合进度 |
| 无 active 成员 | 小组整体完成率显示“暂无有效成员” |
| 运动天数 | 同一 sportDate 累计热量达标计 1 天 |
| 运动次数 | 单条记录热量达标计 1 次，不累计多条未达标记录 |
| 三环闭合 | 同一 sportDate 至多计 1 天 |
| 补卡 | 按被补 sportDate 计入进度 |
| exited 重入 | 退出前完成状态和完成日期不继承，允许补卡例外计入当前统计 |
| archived | 读取快照，不因后续记录或成员变化重算 |

### 12.5 权限与不可见专项测试

| 场景 | 期望 |
|---|---|
| exited 成员访问原小组普通页 | 返回 MEMBER_NOT_ACTIVE，不展示小组敏感数据 |
| removed 成员重新加入 | 拒绝加入，不创建 active membership |
| dissolved 小组深链访问 | 返回 GROUP_DISSOLVED，不展示名称、成员、目标、记录、照片 |
| 非归档可见成员访问 archiveSnapshot | 返回 AUTH_FORBIDDEN，不展示快照详情 |
| active 成员查看同组成员 | 可见 active 成员目标、记录摘要、照片临时 URL |
| 成员修改他人记录 | 拒绝，写 AUTH_DENY 或错误日志 |
| 创建者退出前未转让 | 拒绝并提示“请先转让创建者身份” |

### 12.6 前端验收范围

每个页面至少验收：

- 首次加载 loading 状态。
- 成功 ready 状态。
- 空状态或无数据状态。
- 网络 / 云函数失败 error 状态。
- 无权限 forbidden 状态。
- archived / 归档页面 readonly 状态。
- 表单字段即时校验和服务端错误覆盖。
- 写操作成功后刷新页面数据。
- 深链进入时仍以服务端权限结果为准。

### 12.7 Tasks 阶段测试要求

下一阶段 04-tasks.md 中，每个开发任务应包含：

- 任务目标。
- 涉及文件或模块。
- 对应 Spec 验收编号或 Technical Design 章节。
- 实现要点。
- 测试方法。
- 不做范围。

任务完成标准：

- 相关单元或云函数测试通过。
- 页面自测覆盖正常、失败、权限和边界状态。
- 不引入 Spec 明确排除的功能。
- 不绕过第 6 章接口、第 5 章权限、第 8 章统计口径。

### 12.8 第 12 步交叉检查

| 对照来源 | 检查结果 |
|---|---|
| Constitution 测试原则 | 小程序端、云函数、数据库权限、核心流程验收清单均已覆盖 |
| PRD 发布验收 | 创建、加入、目标、打卡、补卡、查看、管理、归档、异常状态均映射测试域 |
| Spec 验收标准 | 核心功能的“当……时，系统应……”均可落到测试矩阵 |
| Technical Design | 数据、状态、权限、接口、照片、统计、前端、错误和安全均有测试入口 |
| Tasks 需求 | 已明确每个任务应携带测试方法和不做范围 |

## 13. Technical Design 验收清单

进入 Tasks 阶段前，本 Technical Design 应满足以下检查项：

- [x] 已明确技术栈：微信小程序原生框架、微信云开发、云数据库、云存储。
- [x] 已明确小程序端、service、云函数、数据库、云存储职责边界。
- [x] 已定义 users、groups、memberships、targetConfigs、checkinRecords、archiveSnapshots、archiveMemberSnapshots、auditLogs 集合。
- [x] 已定义核心字段、索引、唯一性和关系。
- [x] 已定义小组、成员关系、目标配置、打卡记录状态机。
- [x] 已定义物理有效记录上限与当前统计资格的分离实现方式。
- [x] 已定义权限与可见性模型，包括 active、creator、exited、removed、archived、dissolved。
- [x] 已定义云函数与小程序 service 边界。
- [x] 已定义运动照片上传、云存储路径、fileId 落库、临时 URL 和失败重试规则。
- [x] 已定义每类目标进度、个人综合进度、完成日期、小组整体完成率计算方式。
- [x] 已定义归档快照生成、读取、只读和不重算规则。
- [x] 已映射 16 个原型页面到页面路径、service 和交互状态。
- [x] 已定义公共组件、页面状态、表单校验和刷新策略。
- [x] 已定义统一响应结构、错误码分层、核心错误码与 Spec 文案映射。
- [x] 已定义审计日志、错误日志、traceId 和敏感信息限制。
- [x] 已定义安全、资源、性能、并发和幂等控制策略。
- [x] 已定义测试层级、核心测试矩阵、统计专项、权限专项和前端验收范围。
- [x] 已明确下一阶段 Tasks 的拆分依据和每个任务应包含测试方法。
- [x] 未引入 Spec 明确排除的点赞、评论、排行榜、订阅消息、微信运动步数、外部设备数据、离线提交队列、一点币结算或奖惩等功能。
- [x] 未设计核心业务数据物理删除作为默认实现。
- [x] 无已知需要回到 PRD / Spec 重新确认的规则冲突。

最终结论：Technical Design 主体完整，可作为下一阶段 docs/04-tasks.md 的输入。若后续 PRD 或 Spec 发生变更，应先更新上游文档，再同步修订本 Technical Design 和 Tasks。

## 14. Version History / 版本记录

| 版本 | 日期 | 修改内容 | 修改人 |
|---|---|---|---|
| v0.6.2 | 2026-06-25 | 用户确认 Technical Design，更新文档状态为已确认 | Codex |
| v0.6.1 | 2026-06-25 | 完成最终多轮交叉检查，修正文档状态为已完成待确认 | Codex |
| v0.6.0 | 2026-06-25 | 补齐错误码响应日志、安全性能并发、测试验收映射和 Technical Design 验收清单，完成最终交叉检查前的完整性修正 | Codex |
| v0.5.0 | 2026-06-25 | 新增统计与归档设计、前端页面组件与交互状态设计，并补齐 Tasks 拆分所需边界 | Codex |
| v0.4.0 | 2026-06-25 | 新增核心云函数 / 服务接口设计和运动照片云存储设计，并同步章节顺序 | Codex |
| v0.3.0 | 2026-06-25 | 新增状态机与核心约束落库方式、权限与可见性模型，并收紧归档/解散不批量改成员状态的技术口径 | Codex |
| v0.2.0 | 2026-06-25 | 新增数据模型设计，覆盖集合、字段、索引、关系、页面映射和统计资格策略 | Codex |
| v0.1.0 | 2026-06-22 | 新增 Technical Design 文档结构、整体架构与设计原则 | Codex |
