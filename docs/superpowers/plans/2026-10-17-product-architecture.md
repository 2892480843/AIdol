# Product Architecture Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent frontend, storage, and AI gateway work; root integrates durable tasks, deployment, and verification.

**Goal:** Deliver the approved product architecture and refactored frontend while preserving the existing wardrobe and user data.

**Architecture:** FastAPI remains a modular monolith. PostgreSQL stores durable recommendation tasks and their outbox records; a dispatcher and an independent ARQ worker execute jobs. Existing image and tagging workers remain isolated. A storage adapter supports filesystem and private S3 objects. The Next.js frontend submits tasks and restores their state from authenticated APIs.

**Tech Stack:** Next.js/React/TypeScript, FastAPI, SQLAlchemy/PostgreSQL, ARQ/Redis, S3-compatible storage, OpenTelemetry, versioned Docker images.

## Global constraints
- Preserve current routes, user data, AI gateway compatibility fixes, authentication and image signatures.
- Do not expose credentials, prompts, image payloads, or raw upstream errors in logs.
- Task access is scoped to the authenticated user. Status is queued/running/succeeded/failed/cancelled.
- Duplicate delivery must not create duplicate outfits. Cancellation must not commit generated outfits.
- Business data, completed outfits and task completion commit atomically; Redis is not the source of task truth.
- Existing synchronous APIs remain compatible while frontend switches to durable tasks.
- Do not invent performance/capacity guarantees. Public OIDC and external notification credentials remain deployment inputs.

## Tasks and verification
- [ ] Root: add `backend/app/models/task.py`, migration after `a7d3c9e1f5b2`, `app/tasks/{schemas,service,dispatcher,execution}.py`, `api/tasks.py`, `workers/task_worker.py`. API creation returns 202 and writes task plus outbox without Redis. Test repeat idempotency keys, ownership, retry/cancel, outbox replay and worker interruption against isolated PostgreSQL/Redis.
- [ ] Root: add transaction control to `RecommendationService`, so task results and all outfits commit together. Test duplicate execution and cancellation during generation; leave synchronous defaults unchanged.
- [ ] Storage agent: add local/S3 adapters; integrate every image read/write/delete/rotation/background-removal/tagging path. Add safe, resumable copy and digest verification CLI. Run existing image tests and a real MinIO copy/read/rotate roundtrip; retain source volume.
- [ ] AI agent: extract completion gateway and preserve retries/locale/full-response SSE parsing. Add request/task correlation, OpenTelemetry and sanitized model usage/duration logs. Root persists prompt/gateway version metadata. Run gateway and legacy AI tests.
- [ ] Frontend agent: split recommendation feature into API, hooks and presentation components; support task polling, progress, cancel/retry and restoration after reload, preserving all filters/results/feedback. Add focused tests, run complete frontend tests and explicit TypeScript check.
- [ ] Root: build project-owned backend/frontend images, add task worker and MinIO Compose services, migrate a database copy first, back up live DB/files, apply additive migration and verify deployment. Keep secrets in ignored mode-600 env files.
- [ ] Review: independent code review, all backend/frontend tests, explicit types/build, deployed API and browser checks including restart/cancel/idempotency and object storage. Save evidence under `verification/architecture/`.

## Task HTTP contract
`POST /api/v1/tasks/recommendations` accepts the existing suggestion fields plus count (1..3), and optional `Idempotency-Key`. `GET /tasks?kind=recommendation&limit=20`, `GET /tasks/{id}`, `POST /tasks/{id}/retry`, and `POST /tasks/{id}/cancel` return authenticated task state. A task includes id/kind/status/stage/attempts/max_attempts/request/result/error/error_code/created_at/updated_at. A successful result contains outfit_ids, fetched through existing outfit detail APIs. Frontend polling stops at terminal states and restores task lists from the server.

## Acceptance
Run `./local.sh run --rm --no-deps -T --env-file .verification-task.env.local -v "$PWD/backend:/app" backend pytest tests/test_durable_tasks.py -q` then full backend suite with an isolated verification database. Run `npm test`, `npx tsc --noEmit`, `npm run build` in frontend. Browser tests must demonstrate visible progress, page reload recovery and persisted results. Repeat delivery/restart tests must prove exactly one committed business result, without promising exactly one external model call.
