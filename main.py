from __future__ import annotations

import argparse


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="QLU 工具箱")
    parser.add_argument("--worker", choices=("grade-export",))
    parser.add_argument("--year")
    parser.add_argument("--semester")
    parser.add_argument("--output")
    parser.add_argument("--browser", default="auto")
    parser.add_argument("--keep-login", choices=("yes", "no"), default="yes")
    parser.add_argument("--event-file")
    return parser


def main() -> int:
    arguments = build_parser().parse_args()
    if arguments.worker == "grade-export":
        missing = [
            name
            for name in ("year", "semester", "output")
            if not getattr(arguments, name)
        ]
        if missing:
            raise SystemExit(f"后台任务缺少参数：{', '.join(missing)}")
        from qlu_toolbox.modules.grade_export.worker import worker_main

        return worker_main(
            arguments.year,
            arguments.semester,
            arguments.output,
            arguments.browser,
            arguments.keep_login == "yes",
            arguments.event_file,
        )

    from qlu_toolbox.app import run

    return run()


if __name__ == "__main__":
    raise SystemExit(main())
