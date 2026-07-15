from __future__ import annotations

from PySide6.QtCore import QObject, Signal
from PySide6.QtNetwork import QLocalServer, QLocalSocket


class SingleInstance(QObject):
    activate_requested = Signal()

    def __init__(self, server_name: str, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.server_name = server_name
        self.server = QLocalServer(self)
        self.server.newConnection.connect(self._handle_connection)

    def acquire(self) -> bool:
        probe = QLocalSocket(self)
        probe.connectToServer(self.server_name)
        if probe.waitForConnected(250):
            probe.write(b"activate")
            probe.waitForBytesWritten(250)
            probe.disconnectFromServer()
            return False
        QLocalServer.removeServer(self.server_name)
        return self.server.listen(self.server_name)

    def _handle_connection(self) -> None:
        while self.server.hasPendingConnections():
            connection = self.server.nextPendingConnection()
            if connection is None:
                continue
            connection.waitForReadyRead(100)
            connection.readAll()
            connection.disconnectFromServer()
            connection.deleteLater()
            self.activate_requested.emit()

