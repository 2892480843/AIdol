"""The first authenticated image request should not initialize the SDK on its event loop."""
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
import app.main as main


@pytest.mark.asyncio
async def test_s3_client_is_prepared_off_loop_before_api_becomes_ready(monkeypatch):
    monkeypatch.setattr(main, "settings", main.settings.model_copy(update={"storage_backend": "s3", "debug": True}))
    monkeypatch.setattr(main, "configure_logging", Mock())
    monkeypatch.setattr(main, "shutdown_observability", Mock())
    monkeypatch.setattr(main, "engine", SimpleNamespace(dispose=AsyncMock()))
    calls = []
    caller = threading.get_ident()
    # Patch the dependency at its module so the test also fails before startup imports it.
    monkeypatch.setattr("app.storage.create_storage", lambda settings: calls.append(threading.get_ident()))
    async with main.lifespan(main.app):
        assert len(calls) == 1
        assert calls[0] != caller
    main.engine.dispose.assert_awaited_once()
