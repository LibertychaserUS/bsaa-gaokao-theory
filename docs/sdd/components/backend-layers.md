# Component: Backend Layers

## 概述
后端服务由四层组成：Domain、Application、Repository Ports、Adapters。

## 1. Domain 层
- **路径**：`src/domain/` 下的 `bsaaCore.ts`、`proofVerification.ts`、`paperTheory.ts`、`bsaaBacktest.ts`
- **职责**：纯函数、数学不变式、定理验证。
- **规则**：
  - 不依赖 `@prisma/client`、HTTP 框架、日志库。
  - 所有输入通过 Zod schemas 定义。

## 2. Application 层
- **路径**：`src/application/`
- **职责**：用例编排，例如：
  - `optimizePlan.ts`：接收请求 → 调用 domain → 持久化 OptimizationRun → 返回响应。
  - `recordExperiment.ts`：接收验证结果 → 写入 Experiment + 关联 Evidence。
  - `listEvidence.ts`：查询证据注册表。
- **规则**：
  - 只依赖 domain 和 repository ports。
  - 不包含 HTTP 状态码、序列化细节。

## 3. Repository Ports
- **路径**：`src/ports/repository.ts`
- **职责**：定义 repository 接口。
- **示例**：
  ```ts
  export interface EvidenceRepository {
    create(input: EvidenceInput): Promise<Evidence>;
    findById(id: string): Promise<Evidence | null>;
    list(): Promise<Evidence[]>;
  }
  ```

## 4. Adapters
- **路径**：`src/adapters/`
- **职责**：把 ports 映射到具体技术。
- **包含**：
  - `prismaEvidenceRepository.ts`：Prisma 实现 EvidenceRepository。
  - `prismaExperimentRepository.ts`：Prisma 实现 ExperimentRepository。
  - `http/`：HTTP 路由（Fastify/Hono）。
  - `cli/`：命令行入口。

## 依赖方向
```
adapters → application → domain
adapters → ports ← application
```

禁止：
- domain → application
- domain → adapters
- application → adapters
