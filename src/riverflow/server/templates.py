"""
Jinja2 template rendering for the HTMX-based UI.

All template context variables are Pydantic models — never raw dicts.
"""

from pathlib import Path

from fastapi import Request
from fastapi.templating import Jinja2Templates

TEMPLATE_DIR = Path(__file__).resolve().parent / "ui" / "templates"

templates = Jinja2Templates(directory=str(TEMPLATE_DIR))
