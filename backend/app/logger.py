import logging
import os

# One level up from app/ → /app in Docker, backend/ when running locally
_APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOG_DIR = os.environ.get("LOG_DIR", os.path.join(_APP_ROOT, "trace_logs"))
LOG_FILE = os.path.join(LOG_DIR, "app.log")

def setup_logging():
    """Configure root logger to write to console and a file that is overwritten on each restart."""
    os.makedirs(LOG_DIR, exist_ok=True)
    fmt = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    file_handler = logging.FileHandler(LOG_FILE, mode="w")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(fmt))

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(fmt))

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    root.addHandler(file_handler)
    root.addHandler(console_handler)
