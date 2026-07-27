"""Admin panel package: templates + static assets under admin_panel/.

Page route stays in app.py (/admin). Static files are served via
admin_panel_static. Jinja loads templates from this folder as a second root.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
