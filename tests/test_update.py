from __future__ import annotations

import unittest

from qlu_toolbox.core.update import SemanticVersion, select_update


class VersionTests(unittest.TestCase):
    def test_semantic_version_order(self):
        self.assertLess(
            SemanticVersion.parse("1.0.0-alpha.2"),
            SemanticVersion.parse("v1.0.0-alpha.10"),
        )
        self.assertLess(
            SemanticVersion.parse("1.0.0-rc.1"),
            SemanticVersion.parse("1.0.0"),
        )

    def test_alpha_installation_receives_prerelease_update(self):
        releases = [
            {
                "tag_name": "v1.0.0-alpha.3",
                "name": "Alpha 3",
                "body": "修复内容",
                "html_url": "https://github.com/C1ouDreamW/qlu-toolbox/releases/tag/v1.0.0-alpha.3",
                "draft": False,
                "prerelease": True,
            }
        ]
        update = select_update(releases, "1.0.0-alpha.2")
        self.assertIsNotNone(update)
        self.assertEqual(update.version, "v1.0.0-alpha.3")

    def test_stable_installation_ignores_prerelease(self):
        releases = [
            {
                "tag_name": "v1.1.0-beta.1",
                "html_url": "https://github.com/C1ouDreamW/qlu-toolbox/releases/tag/v1.1.0-beta.1",
                "draft": False,
                "prerelease": True,
            }
        ]
        self.assertIsNone(select_update(releases, "1.0.0"))


if __name__ == "__main__":
    unittest.main()
