from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from qlu_toolbox.core.paths import AppPaths
from qlu_toolbox.core.settings import AppSettings, SettingsStore
from qlu_toolbox.core.tasks import TaskStore
from qlu_toolbox.core.tools import ToolManifest, ToolRegistry
from qlu_toolbox.modules.grade_export.domain import (
    ExportOptions,
    atomic_save,
    output_path,
    validate_academic_year,
)


class SettingsTests(unittest.TestCase):
    def test_round_trip_and_unknown_keys(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = AppPaths(root / "config", root / "data", root / "logs", root / "profiles")
            paths.ensure()
            store = SettingsStore(paths)
            settings = AppSettings(default_output_dir=str(root), preferred_browser="edge")
            store.save(settings)
            raw = json.loads(store.path.read_text(encoding="utf-8"))
            raw["future_key"] = True
            store.path.write_text(json.dumps(raw), encoding="utf-8")
            loaded = store.load()
            self.assertEqual(loaded.preferred_browser, "edge")
            self.assertEqual(loaded.default_output_dir, str(root))

    def test_broken_settings_are_backed_up(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = AppPaths(root / "config", root / "data", root / "logs", root / "profiles")
            paths.ensure()
            store = SettingsStore(paths)
            store.path.write_text("{broken", encoding="utf-8")
            loaded = store.load()
            self.assertEqual(loaded.schema_version, 1)
            self.assertTrue(store.path.with_suffix(".json.broken").exists())


class TaskStoreTests(unittest.TestCase):
    def test_task_lifecycle_and_interrupted_recovery(self):
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "tasks.sqlite3"
            store = TaskStore(database)
            success_id = store.create("tool", "测试工具", "1.0", "参数")
            store.complete(success_id, "C:/result.xlsx")
            interrupted_id = store.create("tool", "测试工具", "1.0", "参数")
            recovered = TaskStore(database)
            records = {record.id: record for record in recovered.list_recent()}
            self.assertEqual(records[success_id].status, "success")
            self.assertEqual(records[interrupted_id].status, "interrupted")


class RegistryTests(unittest.TestCase):
    def test_duplicate_tool_ids_are_rejected(self):
        registry = ToolRegistry()
        manifest = ToolManifest("test", "测试", "说明", "分类", "1.0", "测")
        registry.register(manifest)
        with self.assertRaises(ValueError):
            registry.register(manifest)


class GradeDomainTests(unittest.TestCase):
    def test_validate_academic_year(self):
        self.assertEqual(validate_academic_year("2025-2026"), "2025")
        with self.assertRaises(ValueError):
            validate_academic_year("2025-2027")

    def test_atomic_save_and_collision_safe_output_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = ExportOptions("2025", "12", root)
            first = output_path(options, ".xlsx")
            atomic_save(first, b"data")
            second = output_path(options, ".xlsx")
            self.assertNotEqual(first, second)
            self.assertEqual(first.read_bytes(), b"data")
            self.assertFalse(any(root.glob("*.part")))


if __name__ == "__main__":
    unittest.main()

