"""
ASGI config for fitTODOay backend.
"""

from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "fittodoey_backend.settings")
from mcp_gateway.combined import application  # noqa: E402,F401
