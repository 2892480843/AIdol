# 直接试穿后端交接

本轮实现最多 4 件衣物的照片试穿，沿用现有 Seedream 服务端适配器；没有执行真实模型请求、数据库迁移、镜像构建或部署。

## 契约与行为

- `POST /api/v1/tryon/tasks` 保留 `item_id`，增加可选 `item_ids`（multipart 中的 JSON UUID 数组，1–4 件）。两字段同时提供时，`item_id` 必须是数组第一项。重复、非法、超量或相冲突的衣物返回 422。
- 仍需 `person_image`、显式 `consent=true` 与 `Idempotency-Key`。原单件哈希和 `generate(person, garment)` 路径保持兼容，新增多件路径一次调用 provider，不自动重发。
- capabilities 提供 5 个组、最多 4 件及 `item_type_slots` 显式映射：tops、bottoms、dresses、outerwear、shoes。同组至多一件；dress 与 top/bottom 互斥。
- 各件须属于当前账号，已就绪、未归档且无需清洗。生成引用按用户选择顺序排列，锁按 UUID 升序获取。
- 任务响应保留 `item_id` 第一件，新增 `item_ids`。旧 NULL 记录以 `[item_id]` 返回。结果仍为账号私有图片，失败任务不会公开图片 URL。
- 生成期间不持有数据库事务；模型返回后再次按 UUID 顺序锁定全部引用，确认仍存在后才写结果。任一引用删除后不重建任务或残留正常结果。
- 删除衣物会查首件 FK 和 JSONB 次级引用；主引用沿用 FK 级联，次级引用显式删除任务。结果按确定的 owner/task 键幂等清理，包括没有记录 result_path 的对象。
- 对象写后异常且补偿删除也失败时，失败任务保留私有 expected result_path，后续衣物删除可继续清理。补偿成功则清空路径。
- 批量衣物删除在任何文件操作前按 UUID 升序预锁本批自有衣物，维持原选择范围与分页 cursor，避免与试穿最终写回的锁序相反。

## 验证

- 初始 25 项新专项：17 失败 / 8 通过，随后通过。
- 两项审查回归先红后绿：批量删除预锁；对象写后失败且补偿删除也失败时保留清理引用。
- 最终 **53 通过 / 0 失败 / 26 未选**：42 项新 API/服务/安全边界用例与 11 项既有 provider 传输、SSE、严格输出解析用例。
- 运行使用现有 ARM64 后端运行时，代码只读挂载，Docker `--network none`，数据库与 Redis 使用不可连接的测试地址。模型数据只经过 `httpx.MockTransport`，持久化路径使用临时文件系统，数据库语句由轻量 Fake 执行。
- Ruff（限定 8 文件）、Python AST、UTF-8 无 BOM、差异空白检查通过。唯一测试 warning 是既有 `items.py` Query regex 参数弃用提示。

复现：`sh verification/direct-tryon/run-backend-offline-tests.sh`。

证据：`backend-multi-red.xml`、`backend-review-red.xml`、`backend-review-green.xml`、`backend-offline-final.log`、`backend-offline-final.xml`、`backend-static.log`、`backend-source-check.json`。

## 发布前仍需验证

- 新迁移：`b2c3d4e5f6a8`，父版本 `a1b2c3d4e5f7`；只增加 nullable JSONB `try_on_tasks.item_ids`，未回填或执行。静态检查确认单一 head。
- 需由主任务在独立数据库和 Redis 环境迁移后，补 PostgreSQL 的并发、级联删除及剩余真实数据库集成用例。FakeDB 不证明真实数据库锁行为。
- 既有云桥网关的多参考图实际出图尚未实测。以上离线通过不证明网关实时可达、模型输出质量或合身精度，也不代表实现连续视频或实时 3D 试衣。
