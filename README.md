# 齐鲁工业大学分项成绩导出

这个桌面工具会打开本机的 Edge、Chrome 或内置 Chromium。用户在浏览器中手动登录教务系统后，程序自动进入学生成绩查询页面，并把所选学期的分项成绩保存为 Excel 文件。

程序不会要求用户填写或复制账号、密码、验证码、Cookie，也不会把成绩发送到其他服务器。
浏览器登录状态会保存在当前 Windows 用户的本地应用数据目录中，方便失败重试和下次使用；它不会离开本机。

## 首次运行

1. 安装 Python 3.10 或更高版本。
2. 双击 `setup.bat`，等待依赖和备用 Chromium 安装完成。
3. 双击 `run.bat`。
4. 按教务系统相同的格式选择学年（如 `2025-2026`）和学期（第 1 或第 2 学期），然后选择保存位置。
5. 点击“开始自动导出”。
6. 在浏览器中手动登录；程序识别到登录成功后会自动查询、校验并导出成绩。

## 浏览器顺序

程序依次尝试：

1. Microsoft Edge
2. Google Chrome
3. Playwright 内置 Chromium

## 当前限制

- 仅针对 `https://jw.qlu.edu.cn/` 当前使用的正方教务系统页面。
- 登录等待时间为 15 分钟。
- 学校调整页面地址或导出接口后，需要同步更新程序。
- 当前为源码 MVP，后续可使用 PyInstaller 打包为无需 Python 的 EXE 安装包。

## 项目结构

```text
app.py              桌面界面与浏览器自动化流程
qlu_exporter.py     导出参数、文件识别与结果校验
tests/              核心逻辑自动化测试
references/         本地参考源码（已被 Git 忽略）
setup.bat           首次安装依赖
run.bat             启动程序
```

`references` 只用于保留实现依据，程序运行时不会加载其中的脚本。

## 开发验证

```powershell
python -m unittest discover -s tests -v
python -m py_compile app.py qlu_exporter.py
```
