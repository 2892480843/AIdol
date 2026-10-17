from app.config import get_settings
from app.logging_config import configure_logging
from app.tasks.dispatcher import TASK_QUEUE
from app.tasks.execution import TASK_TIMEOUT_SECONDS, execute_recommendation_task
from app.workers.db import close_db, init_db
from app.workers.settings import get_redis_settings


async def startup(ctx):
    configure_logging(get_settings())
    await init_db(ctx)


async def shutdown(ctx):
    from app.observability import shutdown_observability
    shutdown_observability()
    await close_db(ctx)


class TaskWorkerSettings:
    functions = [execute_recommendation_task]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = get_redis_settings()
    queue_name = TASK_QUEUE
    max_jobs = 2
    job_timeout = TASK_TIMEOUT_SECONDS + 15
    max_tries = 3
    health_check_interval = 30
    keep_result = 30
