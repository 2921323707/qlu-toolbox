from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from functools import total_ordering

from PySide6.QtCore import QObject, QUrl, Signal
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest

from .metadata import RELEASES_URL, REPOSITORY_URL

RELEASES_API_URL = (
    "https://api.github.com/repos/C1ouDreamW/qlu-toolbox/releases?per_page=20"
)

_VERSION_PATTERN = re.compile(
    r"^v?(?P<major>0|[1-9]\d*)\."
    r"(?P<minor>0|[1-9]\d*)\."
    r"(?P<patch>0|[1-9]\d*)"
    r"(?:-(?P<prerelease>[0-9A-Za-z.-]+))?"
    r"(?:\+[0-9A-Za-z.-]+)?$"
)


@total_ordering
@dataclass(frozen=True)
class SemanticVersion:
    major: int
    minor: int
    patch: int
    prerelease: tuple[int | str, ...] | None = None

    @classmethod
    def parse(cls, value: str) -> "SemanticVersion":
        match = _VERSION_PATTERN.fullmatch(value.strip())
        if match is None:
            raise ValueError(f"无法识别版本号：{value}")
        prerelease_text = match.group("prerelease")
        prerelease = None
        if prerelease_text is not None:
            prerelease = tuple(
                int(part) if part.isdigit() else part.lower()
                for part in prerelease_text.split(".")
            )
        return cls(
            int(match.group("major")),
            int(match.group("minor")),
            int(match.group("patch")),
            prerelease,
        )

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, SemanticVersion):
            return NotImplemented
        own_core = (self.major, self.minor, self.patch)
        other_core = (other.major, other.minor, other.patch)
        if own_core != other_core:
            return own_core < other_core
        if self.prerelease is None:
            return False
        if other.prerelease is None:
            return True
        for own_part, other_part in zip(self.prerelease, other.prerelease):
            if own_part == other_part:
                continue
            if isinstance(own_part, int) and isinstance(other_part, str):
                return True
            if isinstance(own_part, str) and isinstance(other_part, int):
                return False
            return own_part < other_part
        return len(self.prerelease) < len(other.prerelease)


@dataclass(frozen=True)
class ReleaseInfo:
    version: str
    name: str
    notes: str
    url: str
    prerelease: bool


def select_update(releases: object, current_version: str) -> ReleaseInfo | None:
    if not isinstance(releases, list):
        raise ValueError("GitHub 返回了无法识别的数据")
    current = SemanticVersion.parse(current_version)
    candidates: list[tuple[SemanticVersion, ReleaseInfo]] = []
    for release in releases:
        if not isinstance(release, dict) or release.get("draft"):
            continue
        is_prerelease = bool(release.get("prerelease"))
        if current.prerelease is None and is_prerelease:
            continue
        tag = str(release.get("tag_name", "")).strip()
        try:
            version = SemanticVersion.parse(tag)
        except ValueError:
            continue
        url = str(release.get("html_url", "")).strip()
        if not url.startswith(REPOSITORY_URL + "/releases/"):
            continue
        info = ReleaseInfo(
            version=tag,
            name=str(release.get("name") or tag),
            notes=str(release.get("body") or "本次发布暂无详细说明。"),
            url=url,
            prerelease=is_prerelease,
        )
        candidates.append((version, info))
    if not candidates:
        return None
    latest_version, latest = max(candidates, key=lambda item: item[0])
    return latest if latest_version > current else None


class UpdateChecker(QObject):
    update_available = Signal(object)
    up_to_date = Signal()
    check_failed = Signal(str)

    def __init__(self, current_version: str, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.current_version = current_version
        self.manager = QNetworkAccessManager(self)
        self.reply: QNetworkReply | None = None

    def check(self) -> bool:
        if self.reply is not None:
            return False
        request = QNetworkRequest(QUrl(RELEASES_API_URL))
        request.setRawHeader(b"Accept", b"application/vnd.github+json")
        request.setRawHeader(b"X-GitHub-Api-Version", b"2026-03-10")
        request.setRawHeader(b"User-Agent", b"QLUToolbox-UpdateChecker")
        request.setTransferTimeout(10_000)
        self.reply = self.manager.get(request)
        self.reply.finished.connect(self._finished)
        return True

    def _finished(self) -> None:
        reply = self.reply
        self.reply = None
        if reply is None:
            return
        try:
            if reply.error() != QNetworkReply.NetworkError.NoError:
                raise RuntimeError(reply.errorString())
            payload = json.loads(bytes(reply.readAll()).decode("utf-8"))
            update = select_update(payload, self.current_version)
        except (OSError, RuntimeError, UnicodeDecodeError, ValueError, json.JSONDecodeError) as exc:
            logging.getLogger(__name__).info("Update check failed: %s", exc)
            self.check_failed.emit(str(exc))
        else:
            if update is None:
                self.up_to_date.emit()
            else:
                self.update_available.emit(update)
        finally:
            reply.deleteLater()
