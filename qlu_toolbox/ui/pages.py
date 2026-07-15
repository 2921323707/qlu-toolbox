from __future__ import annotations

import shutil
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QApplication,
    QFileDialog,
    QFrame,
    QHeaderView,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from qlu_toolbox import __version__
from qlu_toolbox.core.paths import AppPaths
from qlu_toolbox.core.settings import AppSettings, SettingsStore
from qlu_toolbox.core.tasks import TaskRecord, TaskStore
from qlu_toolbox.core.tools import ToolManifest, ToolRegistry
from qlu_toolbox.core.metadata import (
    AUTHOR_EMAIL,
    AUTHOR_GITHUB_URL,
    AUTHOR_NAME,
    NEW_ISSUE_URL,
    RELEASES_URL,
    REPOSITORY_URL,
)


def page_header(title: str, subtitle: str) -> tuple[QLabel, QLabel]:
    title_label = QLabel(title)
    title_label.setObjectName("PageTitle")
    subtitle_label = QLabel(subtitle)
    subtitle_label.setObjectName("PageSubtitle")
    subtitle_label.setWordWrap(True)
    return title_label, subtitle_label


class ToolCard(QFrame):
    opened = Signal(str)

    def __init__(self, manifest: ToolManifest, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.manifest = manifest
        self.setObjectName("ToolCard")
        self.setMinimumHeight(122)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(20, 18, 20, 18)
        layout.setSpacing(16)
        icon = QLabel(manifest.icon_text)
        icon.setObjectName("ToolIcon")
        icon.setFixedSize(48, 48)
        icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(icon, alignment=Qt.AlignmentFlag.AlignTop)
        details = QVBoxLayout()
        details.setSpacing(5)
        name = QLabel(manifest.name)
        name.setStyleSheet("font-size: 17px; font-weight: 700;")
        details.addWidget(name)
        description = QLabel(manifest.description)
        description.setWordWrap(True)
        description.setObjectName("Muted")
        details.addWidget(description)
        details.addStretch()
        layout.addLayout(details, 1)
        actions = QVBoxLayout()
        actions.setSpacing(12)
        category = QLabel(manifest.category)
        category.setObjectName("CategoryBadge")
        actions.addWidget(category, alignment=Qt.AlignmentFlag.AlignRight)
        actions.addStretch()
        button = QPushButton("打开工具")
        button.setProperty("primary", True)
        button.clicked.connect(lambda: self.opened.emit(manifest.id))
        actions.addWidget(button, alignment=Qt.AlignmentFlag.AlignRight)
        layout.addLayout(actions)


class HomePage(QFrame):
    open_tool = Signal(str)

    def __init__(self, registry: ToolRegistry, tasks: TaskStore) -> None:
        super().__init__()
        self.setObjectName("ContentPage")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.registry = registry
        self.tasks = tasks
        layout = QVBoxLayout(self)
        layout.setContentsMargins(34, 30, 34, 30)
        layout.setSpacing(16)
        hero = QFrame()
        hero.setObjectName("HeroCard")
        hero_layout = QHBoxLayout(hero)
        hero_layout.setContentsMargins(26, 22, 26, 22)
        hero_layout.setSpacing(24)
        hero_text = QVBoxLayout()
        hero_text.setSpacing(7)
        eyebrow = QLabel("QLU TOOLBOX · 本地校园效率工具")
        eyebrow.setObjectName("HeroEyebrow")
        hero_text.addWidget(eyebrow)
        title = QLabel("你好，今天想处理什么？")
        title.setObjectName("HeroTitle")
        hero_text.addWidget(title)
        subtitle = QLabel("常用校园工具集中在一个桌面应用中，个人数据默认只保存在本机。")
        subtitle.setObjectName("HeroSubtitle")
        subtitle.setWordWrap(True)
        hero_text.addWidget(subtitle)
        pills = QHBoxLayout()
        pills.setSpacing(8)
        for text in ("本地优先", "手动登录", "非官方工具"):
            pill = QLabel(text)
            pill.setObjectName("Pill")
            pills.addWidget(pill)
        pills.addStretch()
        hero_text.addLayout(pills)
        hero_layout.addLayout(hero_text, 1)
        logo = QLabel()
        logo.setObjectName("BrandLogo")
        logo.setPixmap(QApplication.windowIcon().pixmap(92, 92))
        logo.setFixedSize(100, 100)
        logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        hero_layout.addWidget(logo)
        layout.addWidget(hero)

        tools_header = QHBoxLayout()
        tools_label = QLabel("常用工具")
        tools_label.setObjectName("SectionHeading")
        tools_count = QLabel(f"{len(registry.all())} 个")
        tools_count.setObjectName("SectionCount")
        tools_header.addWidget(tools_label)
        tools_header.addWidget(tools_count)
        tools_header.addStretch()
        layout.addLayout(tools_header)
        for manifest in registry.all():
            card = ToolCard(manifest)
            card.opened.connect(self.open_tool)
            layout.addWidget(card)
        recent_label = QLabel("最近任务")
        recent_label.setObjectName("SectionHeading")
        layout.addWidget(recent_label)
        self.recent_box = QFrame()
        self.recent_box.setObjectName("Card")
        self.recent_layout = QVBoxLayout(self.recent_box)
        self.recent_layout.setContentsMargins(18, 14, 18, 14)
        layout.addWidget(self.recent_box)
        layout.addStretch()
        self.refresh()

    def refresh(self) -> None:
        while self.recent_layout.count():
            item = self.recent_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        records = self.tasks.list_recent(5)
        if not records:
            empty = QLabel("暂无任务记录。完成首次导出后，运行结果会显示在这里。")
            empty.setObjectName("Muted")
            empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty.setMinimumHeight(54)
            self.recent_layout.addWidget(empty)
            return
        for record in records:
            row = QFrame()
            row.setObjectName("RecentRow")
            row_layout = QHBoxLayout(row)
            row_layout.setContentsMargins(4, 8, 4, 8)
            row_layout.setSpacing(12)
            status = QLabel(_status_text(record.status))
            status.setObjectName("StatusBadge")
            status.setProperty("status", record.status)
            row_layout.addWidget(status)
            summary = QLabel(f"{record.tool_name}  ·  {record.summary}")
            summary.setWordWrap(True)
            row_layout.addWidget(summary, 1)
            time = QLabel(_time_text(record.created_at))
            time.setObjectName("Muted")
            row_layout.addWidget(time)
            self.recent_layout.addWidget(row)


class ToolsPage(QFrame):
    open_tool = Signal(str)

    def __init__(self, registry: ToolRegistry) -> None:
        super().__init__()
        self.setObjectName("ContentPage")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.registry = registry
        layout = QVBoxLayout(self)
        layout.setContentsMargins(34, 30, 34, 30)
        layout.setSpacing(16)
        title, subtitle = page_header("全部工具", "按名称查找 QLU 工具箱中的内置工具。")
        layout.addWidget(title)
        layout.addWidget(subtitle)
        self.search = QLineEdit()
        self.search.setPlaceholderText("搜索工具…")
        self.search.textChanged.connect(self._filter)
        layout.addWidget(self.search)
        self.cards = QWidget()
        self.cards_layout = QVBoxLayout(self.cards)
        self.cards_layout.setContentsMargins(0, 4, 0, 0)
        self.card_widgets: list[ToolCard] = []
        for manifest in registry.all():
            card = ToolCard(manifest)
            card.opened.connect(self.open_tool)
            self.cards_layout.addWidget(card)
            self.card_widgets.append(card)
        self.cards_layout.addStretch()
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setWidget(self.cards)
        layout.addWidget(scroll, 1)

    def _filter(self, text: str) -> None:
        query = text.strip().lower()
        for card in self.card_widgets:
            haystack = f"{card.manifest.name} {card.manifest.description} {card.manifest.category}".lower()
            card.setVisible(not query or query in haystack)


class TasksPage(QFrame):
    def __init__(self, tasks: TaskStore) -> None:
        super().__init__()
        self.setObjectName("ContentPage")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.tasks = tasks
        layout = QVBoxLayout(self)
        layout.setContentsMargins(34, 30, 34, 30)
        layout.setSpacing(16)
        title, subtitle = page_header("任务记录", "查看工具运行结果。清除记录不会删除已经导出的文件。")
        layout.addWidget(title)
        layout.addWidget(subtitle)
        actions = QHBoxLayout()
        refresh = QPushButton("刷新")
        refresh.clicked.connect(self.refresh)
        clear = QPushButton("清除已结束记录")
        clear.setProperty("danger", True)
        clear.clicked.connect(self._clear)
        actions.addStretch()
        actions.addWidget(refresh)
        actions.addWidget(clear)
        layout.addLayout(actions)
        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(["状态", "工具", "参数", "时间", "结果 / 原因"])
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        self.table.setShowGrid(False)
        self.table.setWordWrap(False)
        self.table.verticalHeader().setVisible(False)
        self.table.verticalHeader().setDefaultSectionSize(42)
        layout.addWidget(self.table, 1)
        self.refresh()

    def refresh(self) -> None:
        records = self.tasks.list_recent(1000)
        self.table.setRowCount(len(records))
        for row, record in enumerate(records):
            result = record.result_path or record.error_message or "—"
            values = [
                _status_text(record.status),
                record.tool_name,
                record.summary,
                _time_text(record.created_at),
                result,
            ]
            for column, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setToolTip(value)
                self.table.setItem(row, column, item)

    def _clear(self) -> None:
        answer = QMessageBox.question(
            self,
            "清除任务记录",
            "确定清除所有已结束的任务记录吗？\n\n导出的 Excel 文件不会被删除。",
        )
        if answer == QMessageBox.StandardButton.Yes:
            self.tasks.clear()
            self.refresh()


class SettingsPage(QFrame):
    settings_saved = Signal(str)
    check_updates_requested = Signal()

    def __init__(
        self,
        settings: AppSettings,
        store: SettingsStore,
        paths: AppPaths,
        tasks: TaskStore,
    ) -> None:
        super().__init__()
        self.setObjectName("ContentPage")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.settings = settings
        self.store = store
        self.paths = paths
        self.tasks = tasks
        layout = QVBoxLayout(self)
        layout.setContentsMargins(34, 30, 34, 30)
        layout.setSpacing(16)
        title, subtitle = page_header("设置", "管理默认保存位置、浏览器和本地数据。")
        layout.addWidget(title)
        layout.addWidget(subtitle)

        card = QFrame()
        card.setObjectName("Card")
        form = QVBoxLayout(card)
        form.setContentsMargins(22, 20, 22, 20)
        form.setSpacing(12)
        form.addWidget(QLabel("默认保存位置"))
        output_row = QHBoxLayout()
        self.output = QLineEdit(settings.default_output_dir)
        browse = QPushButton("浏览")
        browse.clicked.connect(self._browse)
        output_row.addWidget(self.output, 1)
        output_row.addWidget(browse)
        form.addLayout(output_row)
        form.addWidget(QLabel("首选浏览器"))
        self.browser = QComboBox()
        self.browser.addItem("自动选择", "auto")
        self.browser.addItem("Microsoft Edge", "edge")
        self.browser.addItem("Google Chrome", "chrome")
        self.browser.addItem("兼容 Chromium", "chromium")
        self.browser.setCurrentIndex(max(0, self.browser.findData(settings.preferred_browser)))
        form.addWidget(self.browser)
        form.addWidget(QLabel("界面主题"))
        self.theme = QComboBox()
        self.theme.addItem("浅色", "light")
        self.theme.addItem("深色", "dark")
        self.theme.addItem("跟随系统（当前按浅色显示）", "system")
        self.theme.setCurrentIndex(max(0, self.theme.findData(settings.theme)))
        form.addWidget(self.theme)
        self.keep_login = QCheckBox("保留浏览器登录状态，方便下次使用")
        self.keep_login.setChecked(settings.keep_login_state)
        self.check_updates = QCheckBox("启动时检查 GitHub 新版本（v1.0 暂不自动下载）")
        self.check_updates.setChecked(settings.check_updates)
        form.addWidget(self.keep_login)
        form.addWidget(self.check_updates)
        check_now = QPushButton("立即检查更新")
        check_now.clicked.connect(self.check_updates_requested)
        form.addWidget(check_now, alignment=Qt.AlignmentFlag.AlignLeft)
        save = QPushButton("保存设置")
        save.setProperty("primary", True)
        save.clicked.connect(self._save)
        form.addWidget(save, alignment=Qt.AlignmentFlag.AlignRight)
        layout.addWidget(card)

        data_card = QFrame()
        data_card.setObjectName("Card")
        data_layout = QVBoxLayout(data_card)
        data_layout.setContentsMargins(22, 20, 22, 20)
        data_layout.addWidget(QLabel("本地数据"))
        hint = QLabel("可清理浏览器登录状态和运行日志。导出的 Excel 文件不会被删除。")
        hint.setObjectName("Muted")
        hint.setWordWrap(True)
        data_layout.addWidget(hint)
        data_buttons = QHBoxLayout()
        clear_profile = QPushButton("清除登录状态")
        clear_profile.clicked.connect(self._clear_profiles)
        clear_logs = QPushButton("清除日志")
        clear_logs.clicked.connect(self._clear_logs)
        data_buttons.addWidget(clear_profile)
        data_buttons.addWidget(clear_logs)
        data_buttons.addStretch()
        data_layout.addLayout(data_buttons)
        layout.addWidget(data_card)
        layout.addStretch()

    def _browse(self) -> None:
        selected = QFileDialog.getExistingDirectory(self, "选择默认保存位置", self.output.text())
        if selected:
            self.output.setText(selected)

    def _save(self) -> None:
        output = Path(self.output.text().strip()).expanduser()
        try:
            output.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            QMessageBox.warning(self, "无法保存", f"保存目录不可用：{exc}")
            return
        self.settings.default_output_dir = str(output)
        self.settings.preferred_browser = str(self.browser.currentData())
        self.settings.keep_login_state = self.keep_login.isChecked()
        self.settings.theme = str(self.theme.currentData())
        self.settings.check_updates = self.check_updates.isChecked()
        self.store.save(self.settings)
        self.settings_saved.emit(self.settings.theme)
        QMessageBox.information(self, "设置已保存", "设置已经保存。")

    def _clear_profiles(self) -> None:
        answer = QMessageBox.question(self, "清除登录状态", "确定清除工具箱保存的浏览器登录状态吗？")
        if answer != QMessageBox.StandardButton.Yes:
            return
        shutil.rmtree(self.paths.profile_dir, ignore_errors=True)
        self.paths.profile_dir.mkdir(parents=True, exist_ok=True)
        QMessageBox.information(self, "已清除", "浏览器登录状态已清除。")

    def _clear_logs(self) -> None:
        shutil.rmtree(self.paths.log_dir, ignore_errors=True)
        self.paths.log_dir.mkdir(parents=True, exist_ok=True)
        QMessageBox.information(self, "已清除", "运行日志已清除。")


class AboutPage(QFrame):
    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("ContentPage")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        outer_layout = QVBoxLayout(self)
        outer_layout.setContentsMargins(0, 0, 0, 0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.viewport().setAutoFillBackground(False)
        scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")

        content = QWidget()
        content.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, False)
        layout = QVBoxLayout(content)
        layout.setContentsMargins(34, 30, 34, 30)
        layout.setSpacing(16)
        title, subtitle = page_header("关于 QLU 工具箱", f"版本 {__version__}")
        layout.addWidget(title)
        layout.addWidget(subtitle)
        card = QFrame()
        card.setObjectName("Card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(24, 22, 24, 22)
        identity = QHBoxLayout()
        identity.setSpacing(16)
        logo = QLabel()
        logo.setObjectName("BrandLogo")
        logo.setPixmap(QApplication.windowIcon().pixmap(72, 72))
        logo.setFixedSize(76, 76)
        identity.addWidget(logo)
        identity_text = QVBoxLayout()
        product_name = QLabel("QLU 工具箱")
        product_name.setStyleSheet("font-size: 20px; font-weight: 700;")
        product_hint = QLabel("学生维护的本地校园效率工具 · 非学校官方软件")
        product_hint.setObjectName("Muted")
        identity_text.addWidget(product_name)
        identity_text.addWidget(product_hint)
        identity_text.addStretch()
        identity.addLayout(identity_text, 1)
        card_layout.addLayout(identity)
        card_layout.addSpacing(8)
        statement = QLabel(
            "本项目仅供个人学习、交流用途。"
            "禁止用于收费服务、商业产品、商业推广、代运营或其他营利活动。\n\n"
            "本项目不是齐鲁工业大学官方软件，与齐鲁工业大学及其教务系统服务商不存在隶属、"
            "授权、合作或担保关系，也不代表学校官方立场。\n\n"
            "本软件使用者应遵守学校规定、目标系统规则及适用法律法规，并自行承担"
            "使用、误用或无法使用本软件产生的风险和后果。"
        )
        statement.setWordWrap(True)
        statement.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        card_layout.addWidget(statement)
        links = QHBoxLayout()
        repo = QPushButton("打开 GitHub 仓库")
        repo.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl(REPOSITORY_URL))
        )
        releases = QPushButton("查看版本发布")
        releases.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl(RELEASES_URL))
        )
        links.addWidget(repo)
        links.addWidget(releases)
        links.addStretch()
        card_layout.addLayout(links)
        layout.addWidget(card)

        support = QFrame()
        support.setObjectName("Card")
        support_layout = QVBoxLayout(support)
        support_layout.setContentsMargins(24, 20, 24, 20)
        support_layout.setSpacing(10)
        support_title = QLabel("作者与支持")
        support_title.setObjectName("SectionHeading")
        support_layout.addWidget(support_title)
        author = QLabel(
            f"作者：{AUTHOR_NAME}\n"
            f"联系邮箱：{AUTHOR_EMAIL}\n"
            f"GitHub：{AUTHOR_GITHUB_URL}"
        )
        author.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        support_layout.addWidget(author)
        help_text = QLabel(
            "发现普通 Bug 或希望增加功能时，请优先通过 GitHub Issues 提交，并附上软件版本、"
            "Windows 版本、复现步骤和已经脱敏的错误信息。"
        )
        help_text.setObjectName("Muted")
        help_text.setWordWrap(True)
        support_layout.addWidget(help_text)
        privacy = QLabel(
            "隐私提醒：不要在公开 Issue 中提交账号、密码、验证码、Cookie、成绩文件或包含个人信息的日志。"
            "涉及安全或隐私的内容请通过邮箱私下联系作者。"
        )
        privacy.setObjectName("InfoBanner")
        privacy.setWordWrap(True)
        support_layout.addWidget(privacy)
        support_actions = QHBoxLayout()
        author_home = QPushButton("作者 GitHub")
        author_home.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl(AUTHOR_GITHUB_URL))
        )
        report_bug = QPushButton("提交 Bug / 建议")
        report_bug.setProperty("primary", True)
        report_bug.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl(NEW_ISSUE_URL))
        )
        email_author = QPushButton("邮件联系作者")
        email_author.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl(f"mailto:{AUTHOR_EMAIL}"))
        )
        support_actions.addWidget(report_bug)
        support_actions.addWidget(author_home)
        support_actions.addWidget(email_author)
        support_actions.addStretch()
        support_layout.addLayout(support_actions)
        layout.addWidget(support)
        layout.addStretch()
        scroll.setWidget(content)
        outer_layout.addWidget(scroll)


def _status_text(status: str) -> str:
    return {
        "running": "进行中",
        "success": "成功",
        "failed": "失败",
        "cancelled": "已取消",
        "interrupted": "异常中断",
    }.get(status, status)


def _time_text(value: str) -> str:
    return value.replace("T", " ")[:19] if value else "—"
