# ADR 001: Zod 作为统一 schema 来源

## 状态
Accepted

## 背景
项目需要同时维护：
- TypeScript 类型
- 运行时 API 校验
- 数据库存储结构
- 测试 fixtures

如果各自维护，会出现类型、校验、DB 表不一致的 bug。

## 决策
使用 **Zod** 作为单一真相来源：
- 所有核心类型先定义 Zod schema。
- TypeScript 类型通过 `z.infer<typeof schema>` 派生。
- Prisma schema 与 Zod schema 保持字段一致（手动对齐，变更时需同步更新）。
- 数据库读写必须通过 Zod parse/safeParse。

## 后果
- 正向：API、DB、类型统一；运行时错误减少。
- 反向：新增字段时需要同时改 Zod、Prisma、迁移；需要纪律。

## 相关文件
- `src/schemas.ts`
- `prisma/schema.prisma`
- `src/db.ts`
