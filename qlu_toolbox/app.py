from __future__ import annotations

import ctypes
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from PySide6.QtGui import QFont, QIcon
from PySide6.QtWidgets import QApplication

from qlu_toolbox import __version__
from qlu_toolbox.core.metadata import APP_NAME, AUTHOR_NAME
from qlu_toolbox.core.paths import AppPaths
from qlu_toolbox.core.settings import SettingsStore
from qlu_toolbox.core.single_instance import SingleInstance
from qlu_toolbox.core.tasks import TaskStore
from qlu_toolbox.core.tools import ToolRegistry
from qlu_toolbox.modules.grade_export import MANIFEST as GRADE_EXPORT_MANIFEST
from qlu_toolbox.ui.main_window import MainWindow
from qlu_toolbox.ui.styles import stylesheet


def _configure_logging(paths: AppPaths) -> None:
    handler = RotatingFileHandler(
        paths.log_dir / "qlu-toolbox.log",
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    logging.basicConfig(level=logging.INFO, handlers=[handler])


def _set_windows_app_id() -> None:
    if os.name != "nt":
        return
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
            "student.qlu.toolbox"
        )
    except (AttributeError, OSError):
        pass


def run() -> int:
    paths = AppPaths.discover()
    paths.ensure()
    _configure_logging(paths)
    _set_windows_app_id()

    application = QApplication(sys.argv)
    application.setApplicationName(APP_NAME)
    application.setApplicationVersion(__version__)
    application.setOrganizationName(AUTHOR_NAME)
    application.setStyle("Fusion")
    font = QFont()
    font.setFamilies(["Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI"])
    font.setPointSize(9)
    application.setFont(font)
    packaged = getattr(sys, "frozen", False) or "__compiled__" in globals()
    if packaged:
        resource_root = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    else:
        resource_root = Path(__file__).resolve().parents[1]
    icon_path = resource_root / "assets" / "qlu-toolbox.ico"
    if icon_path.exists():
        application.setWindowIcon(QIcon(str(icon_path)))
    single_instance = SingleInstance("student.qlu.toolbox.v1", application)
    if not single_instance.acquire():
        return 0

    settings_store = SettingsStore(paths)
    settings = settings_store.load()
    tasks = TaskStore(paths.data_dir / "tasks.sqlite3")
    registry = ToolRegistry()
    registry.register(GRADE_EXPORT_MANIFEST)

    application.setStyleSheet(stylesheet(settings.theme))
    window = MainWindow(paths, settings, settings_store, tasks, registry)
    single_instance.activate_requested.connect(
        lambda: (window.showNormal(), window.raise_(), window.activateWindow())
    )
    window.show()
    return application.exec()
