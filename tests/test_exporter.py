from __future__ import annotations

import unittest
from datetime import datetime
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qs
from zipfile import ZIP_DEFLATED, ZipFile

from qlu_toolbox.modules.grade_export.domain import (
    ExportError,
    ExportOptions,
    build_export_body,
    default_academic_year,
    is_logged_in_url,
    output_path,
    workbook_extension,
    xlsx_semester_values,
)


class ExporterTests(unittest.TestCase):
    def test_default_academic_year_changes_in_august(self):
        self.assertEqual(default_academic_year(datetime(2026, 7, 15)), "2025")
        self.assertEqual(default_academic_year(datetime(2026, 8, 1)), "2026")

    def test_export_body_preserves_all_repeated_columns(self):
        parsed = parse_qs(build_export_body("2025", "12"))
        self.assertEqual(parsed["xnm"], ["2025"])
        self.assertEqual(parsed["xqm"], ["12"])
        self.assertEqual(len(parsed["exportModel.selectCol"]), 9)
        self.assertIn("xmblmc@成绩分项", parsed["exportModel.selectCol"])

    def test_detects_excel_formats(self):
        self.assertEqual(workbook_extension(b"PK\x03\x04rest"), ".xlsx")
        self.assertEqual(workbook_extension(bytes.fromhex("D0CF11E0A1B11AE1") + b"rest"), ".xls")
        with self.assertRaises(ExportError):
            workbook_extension(b"<html>login</html>", "text/html")

    def test_logged_in_urls(self):
        self.assertTrue(is_logged_in_url("https://jw.qlu.edu.cn/jwglxt/xtgl/index_initMenu.html?jsdm=xs"))
        self.assertTrue(is_logged_in_url("https://jw.qlu.edu.cn/jwglxt/cjcx/test.html"))
        self.assertTrue(is_logged_in_url("https://jw.qlu.edu.cn/jwglxt/anything?jsdm=xs"))
        self.assertFalse(is_logged_in_url("https://jw.qlu.edu.cn/"))
        self.assertFalse(is_logged_in_url("https://example.com/jwglxt/cjcx/test.html"))

    def test_output_name_contains_school_year(self):
        options = ExportOptions("2025", "12", Path("C:/tmp"))
        path = output_path(options, ".xlsx")
        self.assertIn("2025-2026", path.name)
        self.assertIn("第2学期", path.name)
        self.assertEqual(path.suffix, ".xlsx")

    def test_reads_semester_column_from_xlsx(self):
        shared_strings = """<?xml version="1.0" encoding="UTF-8"?>
        <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <si><t>课程名称</t></si><si><t>学期</t></si><si><t>测试课程</t></si>
        </sst>"""
        worksheet = """<?xml version="1.0" encoding="UTF-8"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
          <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>2</v></c></row>
          <row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>2</v></c></row>
        </sheetData></worksheet>"""
        buffer = BytesIO()
        with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
            archive.writestr("xl/sharedStrings.xml", shared_strings)
            archive.writestr("xl/worksheets/sheet1.xml", worksheet)
        self.assertEqual(xlsx_semester_values(buffer.getvalue()), {"2"})


if __name__ == "__main__":
    unittest.main()
