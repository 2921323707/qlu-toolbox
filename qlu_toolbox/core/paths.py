from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AppPaths:
    config_dir: Path
    data_dir: Path
    log_dir: Path
    profile_dir: Path

    @classmethod
    def discover(cls) -> "AppPaths":
        home = Path.home()
        roaming = Path(os.environ.get("APPDATA", home / ".config"))
        local = Path(os.environ.get("LOCALAPPDATA", home / ".local" / "share"))
        config_dir = roaming / "QLUToolbox"
        data_dir = local / "QLUToolbox"
        return cls(
            config_dir=config_dir,
            data_dir=data_dir,
            log_dir=data_dir / "logs",
            profile_dir=data_dir / "profiles",
        )

    def ensure(self) -> None:
        for path in (self.config_dir, self.data_dir, self.log_dir, self.profile_dir):
            path.mkdir(parents=True, exist_ok=True)


def downloads_dir() -> Path:
    candidate = Path.home() / "Downloads"
    return candidate if candidate.exists() else Path.home()

