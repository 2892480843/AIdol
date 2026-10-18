#!/bin/sh
set -eu
root=/opt/dada-6780/current
python=/opt/dada-6780/venv/bin/python
cd "$root/backend"
case "${1:-}" in
  frontend)
    cd "$root/frontend"
    exec /opt/node-v22.23.2-linux-x64/bin/node server.js
    ;;
  api) exec "$python" -m uvicorn app.main:app --host 127.0.0.1 --port 31681 --proxy-headers --forwarded-allow-ips 127.0.0.1 ;;
  worker) exec /opt/dada-6780/venv/bin/arq app.workers.worker.WorkerSettings ;;
  images) exec /opt/dada-6780/venv/bin/arq app.workers.image_worker.ImageWorkerSettings ;;
  tasks) exec /opt/dada-6780/venv/bin/arq app.workers.task_worker.TaskWorkerSettings ;;
  dispatcher) exec "$python" -m app.tasks.dispatcher ;;
  *) printf 'Unknown service: %s\n' "${1:-}" >&2; exit 2 ;;
esac
