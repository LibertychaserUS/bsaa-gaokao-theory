# SDD Box（软件设计文档盒）

本目录防止大项目出现“忘记实现、缺失上下文、重复实现”。

## 用途

- 记录每一次重大设计决策（ADR）。
- 维护组件规格与接口契约。
- 维护需求 → 设计 → 代码 → 测试 的可追溯矩阵。
- 作为 subagent/新协作者进入项目时的必读索引。

## 目录结构

```
docs/sdd/
├── README.md                 # 本文件
├── decisions/                # 架构决策记录（ADR）
│   ├── 001-zod-source-of-truth.md
│   └── 002-sqlite-evidence-registry.md
├── components/               # 组件规格
│   ├── bsaa-core.md
│   ├── proof-verification.md
│   └── evidence-registry.md
└── traceability.md           # 需求-代码-测试追溯矩阵
```

## 当前状态

| 组件 | 状态 | 责任人 | 最后更新 |
|---|---|---|---|
| BSAA Core | 已实现 | - | 2026-07-11 |
| Proof Verification | 已实现 | - | 2026-07-11 |
| Evidence Registry | 设计中 | - | 2026-07-11 |
| Experiment Log | 设计中 | - | 2026-07-11 |
