# ADR 002: SQLite 作为 evidence/experiment 存储

## 状态
Accepted

## 背景
论文需要可审计的实验记录和证据链。需要一个轻量、可版本化、无需外部服务的持久化方案。

## 决策
使用 **SQLite**（通过 Prisma v7 + `prisma-adapter-sqlite` + Node.js 内置 `node:sqlite`）：
- `Evidence`：证据/文献/定理注册表。
- `Experiment`：每次验证运行的记录。
- `OptimizationRun`：每次求解的审计日志。

生产 API 若需扩展，可迁移到 PostgreSQL 并换官方 adapter，schema 不变。

注意：Prisma v7 不再支持 schema 文件中的 `url` 字段，也不支持 `PrismaClient()` 无参构造。配置集中在 `prisma.config.ts`，客户端通过 `{ adapter: new PrismaSqlite({ url }) }` 初始化。

## 后果
- 正向：本地可复现、CI 可跑、git 可忽略 `.db` 文件。
- 反向：高并发写入不适合 SQLite；未来需要迁移层。

## 相关文件
- `prisma/schema.prisma`
- `src/db.ts`
