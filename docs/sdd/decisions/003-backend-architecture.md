# ADR 003: 后端服务采用分层（Layered / Hexagonal）架构

## 状态
Accepted

## 背景
`bsaa-gaokao-theory` 起初是纯算法/论文代码仓库。随着需要对外提供 API（生成志愿方案、记录实验、查询证据），必须引入后端服务。大项目里容易出现的问题：
- 领域逻辑泄漏到 HTTP handler 或数据库查询里。
- API 改动时 cascade 到数据库和算法层。
- 同一套逻辑被 HTTP/CLI/测试重复实现。

## 决策
采用 **分层架构（Layered / Hexagonal / Ports-and-Adapters）**：

```
┌─────────────────────────────────────┐
│  Adapters / Infrastructure          │  HTTP, CLI, DB, Cache, Queue, Logger
├─────────────────────────────────────┤
│  Application / Use Cases            │  optimizePlan, recordExperiment, listEvidence
├─────────────────────────────────────┤
│  Domain                             │  bsaaCore, proofVerification, paperTheory
├─────────────────────────────────────┤
│  Repository Ports                   │  interfaces: EvidenceRepository, ExperimentRepository
└─────────────────────────────────────┘
```

### 各层职责

| 层 | 职责 | 禁止 |
|---|---|---|
| **Domain** | 纯数学/算法，无 I/O | 引用 DB、HTTP、配置、日志 |
| **Application** | 编排用例，决定调用哪些 domain + repository | 直接访问 Prisma/HTTP/文件系统 |
| **Repository Ports** | 定义 repository 接口（TypeScript interface） | 无实现 |
| **Adapters** | 实现 repository 接口（Prisma）、HTTP 路由、CLI、日志 | 包含业务规则 |

### 为什么不用 MVC / 简单三层
- MVC 的 Controller 容易膨胀成“什么都做”。
- 分层架构让 domain 独立于框架，方便以后换 HTTP 框架、换数据库、或只跑 CLI。

## 后果
- 正向：domain 可测试、可复用；API/DB 改动不影响算法；新协作者知道该把代码放哪。
- 反向：文件层级增多，需要严格遵守 import 规则（由 architecture guard 强制执行）。

## 相关文件
- `src/ports/repository.ts`
- `src/adapters/`
- `src/application/`
- `src/server.ts`（未来）
