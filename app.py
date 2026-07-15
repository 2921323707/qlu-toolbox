from __future__ import annotations

import base64
import os
import queue
import subprocess
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from qlu_exporter import (
    BASE_URL,
    EXPORT_URL,
    SCORE_URL,
    CancelledError,
    ExportError,
    ExportOptions,
    SEMESTERS,
    build_export_body,
    default_academic_year,
    is_logged_in_url,
    output_path,
    semester_label,
    workbook_extension,
    xlsx_semester_values,
)


LOGIN_TIMEOUT_SECONDS = 15 * 60


class GradeExporterApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("齐鲁工业大学分项成绩导出")
        self.root.geometry("760x700")
        self.root.minsize(720, 650)
        self.root.configure(background="#07111F")

        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.cancel_event = threading.Event()
        self.manual_continue_event = threading.Event()
        self.worker: threading.Thread | None = None

        current_start_year = int(default_academic_year())
        self.academic_year_values = tuple(
            f"{year}-{year + 1}" for year in range(current_start_year, current_start_year - 10, -1)
        )
        self.year_var = tk.StringVar(value=self.academic_year_values[0])
        self.semester_var = tk.StringVar(value="2")
        self.output_var = tk.StringVar(value=str(Path.home() / "Downloads"))
        self.status_var = tk.StringVar(value="准备就绪")

        self._configure_styles()
        self._build_ui()
        self.root.after(100, self._drain_events)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _configure_styles(self) -> None:
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure("App.TFrame", background="#07111F")
        style.configure("Card.TFrame", background="#101C2E")
        style.configure("Title.TLabel", background="#07111F", foreground="#F5F9FF", font=("Microsoft YaHei UI", 23, "bold"))
        style.configure("Subtitle.TLabel", background="#07111F", foreground="#8292A8", font=("Microsoft YaHei UI", 10))
        style.configure("CardTitle.TLabel", background="#101C2E", foreground="#F2F7FF", font=("Microsoft YaHei UI", 12, "bold"))
        style.configure("Field.TLabel", background="#101C2E", foreground="#A7B5C8", font=("Microsoft YaHei UI", 9))
        style.configure("Hint.TLabel", background="#101C2E", foreground="#63748C", font=("Microsoft YaHei UI", 9))
        style.configure("Status.TLabel", background="#101C2E", foreground="#D9E5F5", font=("Microsoft YaHei UI", 10, "bold"))
        style.configure("Step.TLabel", background="#0B1727", foreground="#70829A", font=("Microsoft YaHei UI", 9))
        style.configure("StepActive.TLabel", background="#0B1727", foreground="#42D6FF", font=("Microsoft YaHei UI", 9, "bold"))

        style.configure(
            "Dark.TEntry",
            fieldbackground="#091525",
            foreground="#EAF2FF",
            insertcolor="#EAF2FF",
            bordercolor="#24364D",
            lightcolor="#24364D",
            darkcolor="#24364D",
            padding=(12, 10),
        )
        style.map("Dark.TEntry", bordercolor=[("focus", "#2FBEF3")])
        style.configure(
            "Dark.TCombobox",
            fieldbackground="#091525",
            background="#16253A",
            foreground="#EAF2FF",
            arrowcolor="#7EDFFF",
            bordercolor="#24364D",
            lightcolor="#24364D",
            darkcolor="#24364D",
            padding=(12, 9),
        )
        style.map(
            "Dark.TCombobox",
            fieldbackground=[("readonly", "#091525")],
            foreground=[("readonly", "#EAF2FF")],
            bordercolor=[("focus", "#2FBEF3")],
        )
        style.configure(
            "Primary.TButton",
            background="#18AEEA",
            foreground="#03111C",
            borderwidth=0,
            focusthickness=0,
            font=("Microsoft YaHei UI", 11, "bold"),
            padding=(18, 13),
        )
        style.map(
            "Primary.TButton",
            background=[("active", "#45C9F5"), ("disabled", "#244257")],
            foreground=[("disabled", "#738697")],
        )
        style.configure(
            "Secondary.TButton",
            background="#17263A",
            foreground="#B9C8DA",
            borderwidth=0,
            focusthickness=0,
            font=("Microsoft YaHei UI", 9),
            padding=(15, 10),
        )
        style.map(
            "Secondary.TButton",
            background=[("active", "#223750"), ("disabled", "#111D2C")],
            foreground=[("disabled", "#536478")],
        )
        style.configure(
            "Tech.Horizontal.TProgressbar",
            troughcolor="#18273A",
            background="#27C7F5",
            bordercolor="#18273A",
            lightcolor="#27C7F5",
            darkcolor="#27C7F5",
            thickness=4,
        )

        self.root.option_add("*TCombobox*Listbox.background", "#101C2E")
        self.root.option_add("*TCombobox*Listbox.foreground", "#EAF2FF")
        self.root.option_add("*TCombobox*Listbox.selectBackground", "#168EBB")
        self.root.option_add("*TCombobox*Listbox.selectForeground", "#FFFFFF")

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, style="App.TFrame", padding=(34, 26, 34, 28))
        outer.pack(fill="both", expand=True)

        header = ttk.Frame(outer, style="App.TFrame")
        header.pack(fill="x")
        brand = tk.Label(
            header,
            text="QLU",
            bg="#14334A",
            fg="#56D9FF",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=5,
        )
        brand.pack(anchor="w")
        ttk.Label(header, text="分项成绩导出", style="Title.TLabel").pack(anchor="w", pady=(9, 2))
        ttk.Label(
            header,
            text="登录由你完成，其余步骤自动运行 · 账号信息仅保留在浏览器中",
            style="Subtitle.TLabel",
        ).pack(anchor="w")

        steps = tk.Frame(outer, bg="#0B1727", highlightthickness=1, highlightbackground="#162A42")
        steps.pack(fill="x", pady=(18, 14))
        for column, (number, label, active) in enumerate(
            (("01", "选择范围", True), ("02", "登录教务", False), ("03", "校验导出", False))
        ):
            step = tk.Frame(steps, bg="#0B1727")
            step.grid(row=0, column=column, sticky="ew", padx=16, pady=9)
            tk.Label(
                step,
                text=number,
                bg="#0B1727",
                fg="#42D6FF" if active else "#4E6077",
                font=("Segoe UI", 8, "bold"),
            ).pack(side="left")
            tk.Label(
                step,
                text=label,
                bg="#0B1727",
                fg="#DDEBFA" if active else "#70829A",
                font=("Microsoft YaHei UI", 9, "bold" if active else "normal"),
            ).pack(side="left", padx=(7, 0))
            steps.columnconfigure(column, weight=1)

        card = tk.Frame(outer, bg="#101C2E", highlightthickness=1, highlightbackground="#1B3049")
        card.pack(fill="x")
        form = ttk.Frame(card, style="Card.TFrame", padding=(24, 20, 24, 22))
        form.pack(fill="x")
        form.columnconfigure(0, weight=1)
        form.columnconfigure(1, weight=1)
        ttk.Label(form, text="导出设置", style="CardTitle.TLabel").grid(row=0, column=0, columnspan=2, sticky="w")
        ttk.Label(form, text="选择要查询的成绩范围", style="Hint.TLabel").grid(
            row=1, column=0, columnspan=2, sticky="w", pady=(3, 17)
        )

        ttk.Label(form, text="学年", style="Field.TLabel").grid(row=2, column=0, sticky="w")
        ttk.Label(form, text="学期", style="Field.TLabel").grid(row=2, column=1, sticky="w", padx=(12, 0))
        year_box = ttk.Combobox(
            form,
            textvariable=self.year_var,
            values=self.academic_year_values,
            state="readonly",
            style="Dark.TCombobox",
        )
        year_box.grid(row=3, column=0, sticky="ew", pady=(7, 17))

        semester_group = tk.Frame(form, bg="#091525", highlightthickness=1, highlightbackground="#24364D")
        semester_group.grid(row=3, column=1, sticky="ew", padx=(12, 0), pady=(7, 17))
        semester_group.columnconfigure(0, weight=1)
        semester_group.columnconfigure(1, weight=1)
        for column, value in enumerate(SEMESTERS):
            radio = tk.Radiobutton(
                semester_group,
                text=f"第 {value} 学期",
                variable=self.semester_var,
                value=value,
                indicatoron=False,
                bg="#091525",
                fg="#90A2B8",
                activebackground="#123047",
                activeforeground="#EAF8FF",
                selectcolor="#168EBB",
                font=("Microsoft YaHei UI", 9, "bold"),
                relief="flat",
                borderwidth=0,
                highlightthickness=0,
                padx=12,
                pady=9,
                cursor="hand2",
            )
            radio.grid(row=0, column=column, sticky="ew")

        ttk.Label(form, text="保存位置", style="Field.TLabel").grid(row=4, column=0, columnspan=2, sticky="w")
        output_row = ttk.Frame(form, style="Card.TFrame")
        output_row.grid(row=5, column=0, columnspan=2, sticky="ew", pady=(7, 0))
        output_row.columnconfigure(0, weight=1)
        ttk.Entry(output_row, textvariable=self.output_var, style="Dark.TEntry").grid(row=0, column=0, sticky="ew")
        ttk.Button(output_row, text="浏览", command=self._choose_output, style="Secondary.TButton").grid(
            row=0, column=1, padx=(10, 0)
        )

        actions = ttk.Frame(outer, style="App.TFrame")
        actions.pack(fill="x", pady=(14, 0))
        actions.columnconfigure(0, weight=3)
        actions.columnconfigure(1, weight=2)
        self.start_button = ttk.Button(
            actions,
            text="开始自动导出  →",
            command=self._start,
            style="Primary.TButton",
        )
        self.start_button.grid(row=0, column=0, sticky="ew")
        self.continue_button = ttk.Button(
            actions,
            text="我已登录，继续",
            command=self._continue_after_login,
            state="disabled",
            style="Secondary.TButton",
        )
        self.continue_button.grid(row=0, column=1, sticky="ew", padx=(10, 0))

        status_card = tk.Frame(outer, bg="#101C2E", highlightthickness=1, highlightbackground="#1B3049")
        status_card.pack(fill="both", expand=True, pady=(14, 0))
        status_inner = ttk.Frame(status_card, style="Card.TFrame", padding=(20, 15, 20, 16))
        status_inner.pack(fill="both", expand=True)
        status_header = ttk.Frame(status_inner, style="Card.TFrame")
        status_header.pack(fill="x")
        self.status_dot = tk.Label(
            status_header,
            text="●",
            bg="#101C2E",
            fg="#35D6A1",
            font=("Segoe UI Symbol", 9),
        )
        self.status_dot.pack(side="left")
        self.status_label = ttk.Label(status_header, textvariable=self.status_var, style="Status.TLabel")
        self.status_label.pack(side="left", padx=(7, 0))
        tk.Label(
            status_header,
            text="LIVE",
            bg="#173126",
            fg="#54D8AD",
            font=("Segoe UI", 7, "bold"),
            padx=7,
            pady=3,
        ).pack(side="right")

        self.progress = ttk.Progressbar(
            status_inner,
            mode="determinate",
            value=0,
            style="Tech.Horizontal.TProgressbar",
        )
        self.progress.pack(fill="x", pady=(11, 10))
        self.log = tk.Text(
            status_inner,
            height=4,
            state="disabled",
            wrap="word",
            borderwidth=0,
            highlightthickness=0,
            background="#0B1727",
            foreground="#7F91A8",
            insertbackground="#FFFFFF",
            selectbackground="#175F7C",
            font=("Microsoft YaHei UI", 8),
            padx=12,
            pady=9,
        )
        self.log.pack(fill="both", expand=True)
        self._append_log("选择成绩范围后开始，登录成功将自动继续。")

    def _choose_output(self) -> None:
        selected = filedialog.askdirectory(initialdir=self.output_var.get() or str(Path.home()))
        if selected:
            self.output_var.set(selected)

    def _validate_options(self) -> ExportOptions:
        year_label = self.year_var.get().strip()
        year_parts = year_label.split("-")
        if not (
            len(year_parts) == 2
            and all(part.isdigit() and len(part) == 4 for part in year_parts)
            and 2000 <= int(year_parts[0]) <= 2100
            and int(year_parts[1]) == int(year_parts[0]) + 1
        ):
            raise ValueError("学年格式应为 2025-2026")
        year = year_parts[0]
        semester = SEMESTERS.get(self.semester_var.get())
        if not semester:
            raise ValueError("请选择学期")
        output_dir = Path(self.output_var.get().strip()).expanduser()
        output_dir.mkdir(parents=True, exist_ok=True)
        return ExportOptions(year, semester, output_dir)

    def _start(self) -> None:
        if self.worker and self.worker.is_alive():
            return
        try:
            options = self._validate_options()
        except (ValueError, OSError) as exc:
            messagebox.showerror("无法开始", str(exc))
            return

        self.cancel_event.clear()
        self.manual_continue_event.clear()
        self.start_button.configure(state="disabled")
        self.continue_button.configure(state="normal")
        self.progress.configure(mode="indeterminate")
        self.progress.start(10)
        self._set_status("正在启动浏览器…")
        self.worker = threading.Thread(target=self._run_export, args=(options,), daemon=True)
        self.worker.start()

    def _run_export(self, options: ExportOptions) -> None:
        try:
            from playwright.sync_api import Error as PlaywrightError
            from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.events.put(("error", "缺少 Playwright。请先运行 setup.bat 安装运行环境。"))
            return

        try:
            with sync_playwright() as playwright:
                context, browser_name, profile_dir = self._launch_context(playwright, PlaywrightError)
                self.events.put(("log", f"已启动 {browser_name}"))
                page = context.pages[0] if context.pages else context.new_page()

                try:
                    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)
                except PlaywrightTimeoutError:
                    self.events.put(("log", "教务系统加载较慢，请继续在浏览器中操作。"))

                self.events.put(("status", "请在浏览器中手动登录，登录成功后程序会自动继续。"))
                login_page = self._wait_for_login(context)

                self.events.put(("status", "登录成功，正在打开学生成绩查询…"))
                self.events.put(("log", "已识别教务系统登录状态"))
                login_page.goto(SCORE_URL, wait_until="domcontentloaded", timeout=60_000)
                login_page.wait_for_selector("#xnm", state="attached", timeout=30_000)
                login_page.wait_for_selector("#xqm", state="attached", timeout=30_000)
                login_page.wait_for_function(
                    """
                    () => {
                        const yearSelect = document.getElementById('xnm');
                        const semesterSelect = document.getElementById('xqm');
                        return yearSelect && semesterSelect
                            && yearSelect.options.length > 1
                            && semesterSelect.options.length > 1;
                    }
                    """,
                    timeout=30_000,
                )

                selection_result = login_page.evaluate(
                    """
                    ({academicYear, semester}) => {
                        const yearSelect = document.getElementById('xnm');
                        const semesterSelect = document.getElementById('xqm');
                        if (!yearSelect || !semesterSelect) {
                            return {ok: false, message: '成绩页面缺少学年或学期控件'};
                        }
                        const schoolYearLabel = `${academicYear}-${Number(academicYear) + 1}`;
                        const yearOption = Array.from(yearSelect.options).find(option =>
                            option.value === academicYear
                            || (option.textContent || '').includes(schoolYearLabel)
                        );
                        const semesterNames = {
                            '3': ['1', '第一'],
                            '12': ['2', '第二'],
                        };
                        const semesterOption = Array.from(semesterSelect.options).find(option => {
                            if (option.value === semester) return true;
                            const text = (option.textContent || '').trim();
                            return (semesterNames[semester] || []).some(name => text.includes(name));
                        });
                        if (!yearOption) {
                            return {ok: false, message: `成绩页面中没有 ${academicYear} 学年`};
                        }
                        if (!semesterOption) {
                            return {ok: false, message: '成绩页面中没有所选学期'};
                        }
                        yearSelect.value = yearOption.value;
                        semesterSelect.value = semesterOption.value;
                        yearSelect.dispatchEvent(new Event('change', {bubbles: true}));
                        semesterSelect.dispatchEvent(new Event('change', {bubbles: true}));
                        return {
                            ok: true,
                            academicYearValue: yearOption.value,
                            semesterValue: semesterOption.value,
                        };
                    }
                    """,
                    {
                        "academicYear": options.academic_year,
                        "semester": options.semester_value,
                    },
                )
                if not selection_result.get("ok"):
                    raise ExportError(selection_result.get("message", "无法设置学年和学期"))
                export_year = selection_result["academicYearValue"]
                export_semester = selection_result["semesterValue"]
                self.events.put(("log", "已设置学年和学期"))

                self.events.put(("status", "正在查询所选学期的成绩…"))
                query_started = login_page.evaluate(
                    """
                    () => {
                        const button = document.getElementById('search_go');
                        if (!button) return false;
                        button.click();
                        return true;
                    }
                    """
                )
                if not query_started:
                    raise ExportError("成绩页面缺少查询按钮")
                login_page.wait_for_timeout(800)
                try:
                    login_page.wait_for_function(
                        "() => !window.jQuery || window.jQuery.active === 0",
                        timeout=15_000,
                    )
                except PlaywrightTimeoutError:
                    self.events.put(("log", "成绩页查询响应较慢，继续使用所选学期参数导出"))
                self.events.put(("log", "所选学期的成绩查询已完成"))

                self.events.put(("status", "正在生成并校验分项成绩文件…"))
                desired_semester = semester_label(options.semester_value)
                candidate_values = list(
                    dict.fromkeys((export_semester, options.semester_value, desired_semester))
                )
                content = b""
                extension = ""
                actual_semesters: set[str] = set()
                for candidate in candidate_values:
                    body = build_export_body(export_year, candidate)
                    self.events.put(("log", f"尝试教务学期参数 xqm={candidate}"))
                    export_result = login_page.evaluate(
                        """
                        async ({url, body}) => {
                            const response = await fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                                },
                                body,
                            });
                            const bytes = new Uint8Array(await response.arrayBuffer());
                            let binary = '';
                            const chunkSize = 0x8000;
                            for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                                binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
                            }
                            return {
                                ok: response.ok,
                                status: response.status,
                                contentType: response.headers.get('content-type') || '',
                                base64: btoa(binary),
                            };
                        }
                        """,
                        {"url": EXPORT_URL, "body": body},
                    )
                    if not export_result["ok"]:
                        raise ExportError(f"教务系统导出失败（HTTP {export_result['status']}）")

                    candidate_content = base64.b64decode(export_result["base64"])
                    candidate_extension = workbook_extension(
                        candidate_content,
                        export_result.get("contentType", ""),
                    )
                    if candidate_extension != ".xlsx":
                        content = candidate_content
                        extension = candidate_extension
                        break
                    actual_semesters = xlsx_semester_values(candidate_content)
                    self.events.put(("log", f"服务器返回学期：{', '.join(sorted(actual_semesters)) or '未知'}"))
                    if desired_semester in actual_semesters:
                        content = candidate_content
                        extension = candidate_extension
                        break

                if not content:
                    actual_text = ", ".join(sorted(actual_semesters)) or "未知"
                    raise ExportError(
                        f"服务器返回的是第 {actual_text} 学期，和所选第 {desired_semester} 学期不一致，已拒绝保存"
                    )
                destination = output_path(options, extension)
                destination.write_bytes(content)
                self.events.put(("success", destination))
                context.close()
        except CancelledError:
            self.events.put(("cancelled", "操作已取消"))
        except Exception as exc:
            self.events.put(("error", self._friendly_error(exc)))

    def _launch_context(self, playwright, playwright_error):
        failures: list[str] = []
        candidates = (("msedge", "Microsoft Edge"), ("chrome", "Google Chrome"), (None, "内置 Chromium"))
        profile_root = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "QLUGradeExporter"
        profile_root.mkdir(parents=True, exist_ok=True)
        for channel, label in candidates:
            profile_dir = profile_root / f"browser-profile-{channel or 'chromium'}"
            try:
                kwargs = {
                    "user_data_dir": str(profile_dir),
                    "headless": False,
                    "accept_downloads": True,
                    "no_viewport": True,
                }
                if channel:
                    kwargs["channel"] = channel
                context = playwright.chromium.launch_persistent_context(**kwargs)
                return context, label, profile_dir
            except playwright_error as exc:
                failures.append(f"{label}: {exc}")
        raise ExportError("没有可用浏览器。请运行 setup.bat 安装内置浏览器。")

    def _wait_for_login(self, context):
        deadline = time.monotonic() + LOGIN_TIMEOUT_SECONDS
        seen_urls: set[str] = set()
        while time.monotonic() < deadline:
            if self.cancel_event.is_set():
                raise CancelledError()

            pages = list(context.pages)
            detected_page = None
            for candidate in pages:
                try:
                    page_state = candidate.evaluate(
                        """
                        () => ({
                            url: window.location.href,
                            loggedInDom: Boolean(
                                document.querySelector('#sessionUser')
                                || document.querySelector('#sessionUserKey')
                                || document.querySelector('a[href*="logout"]')
                            ),
                        })
                        """
                    )
                    url = page_state.get("url", "")
                    logged_in_dom = bool(page_state.get("loggedInDom"))
                except Exception:
                    url = candidate.url or ""
                    logged_in_dom = False
                if url and url not in seen_urls and url != "about:blank":
                    seen_urls.add(url)
                    self.events.put(("log", f"浏览器页面：{url}"))
                if is_logged_in_url(url) or (
                    logged_in_dom
                    and url.startswith("https://jw.qlu.edu.cn/jwglxt/")
                ):
                    detected_page = candidate
                    break

            if detected_page:
                self.events.put(("log", "已自动识别登录成功"))
                return detected_page

            if self.manual_continue_event.is_set():
                page = None
                for candidate in reversed(pages):
                    try:
                        current_url = candidate.evaluate("() => window.location.href")
                    except Exception:
                        current_url = candidate.url or ""
                    if "jw.qlu.edu.cn" in current_url:
                        page = candidate
                        break
                if page:
                    self.events.put(("log", "已使用手动登录确认继续"))
                    return page
                self.manual_continue_event.clear()
                self.events.put(("status", "没有找到教务系统页面，请在程序打开的浏览器中登录。"))
            time.sleep(0.5)
        raise ExportError("等待登录超时，请重新运行后再试")

    def _continue_after_login(self) -> None:
        self.manual_continue_event.set()
        self._set_status("正在确认登录状态…")

    @staticmethod
    def _friendly_error(exc: Exception) -> str:
        text = str(exc).strip()
        if "net::ERR" in text:
            return "无法访问学校教务系统，请检查网络、校园 VPN 或学校服务器状态。"
        if "Target page, context or browser has been closed" in text:
            return "浏览器已被关闭，导出未完成。"
        return text or exc.__class__.__name__

    def _drain_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "status":
                    self._set_status(str(payload))
                elif kind == "log":
                    self._append_log(str(payload))
                elif kind == "success":
                    path = Path(payload)
                    self._finish(f"导出成功：{path}")
                    self._append_log(f"文件已保存：{path}")
                    if messagebox.askyesno("导出成功", f"文件已保存到：\n{path}\n\n是否打开所在文件夹？"):
                        subprocess.Popen(["explorer", "/select,", str(path)])
                elif kind in {"error", "cancelled"}:
                    self._finish(str(payload))
                    if kind == "error":
                        self._append_log(f"失败：{payload}")
                        messagebox.showerror("导出失败", str(payload))
        except queue.Empty:
            pass
        self.root.after(100, self._drain_events)

    def _finish(self, status: str) -> None:
        self.progress.stop()
        self.progress.configure(mode="determinate", value=0)
        self.start_button.configure(state="normal")
        self.continue_button.configure(state="disabled")
        self._set_status(status)

    def _set_status(self, text: str) -> None:
        self.status_var.set(text)
        if hasattr(self, "status_dot"):
            if "成功" in text:
                color = "#35D6A1"
            elif any(keyword in text for keyword in ("失败", "错误", "超时", "取消")):
                color = "#FF6B7A"
            elif text == "准备就绪":
                color = "#35D6A1"
            else:
                color = "#42D6FF"
            self.status_dot.configure(foreground=color)

    def _append_log(self, text: str) -> None:
        self.log.configure(state="normal")
        if self.log.index("end-1c") != "1.0":
            self.log.insert("end", "\n")
        self.log.insert("end", f"• {text}")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _on_close(self) -> None:
        self.cancel_event.set()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    GradeExporterApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
