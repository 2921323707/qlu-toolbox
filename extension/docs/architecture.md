# ToolBox 架构

## 组成

- `extension/manifest.json`：Manifest V3 入口，仅声明 `activeTab` 与 `scripting`。
- `extension/popup/`：读取当前活动标签页，展示注册模块及可运行状态；脚本和样式均为外部本地文件。
- `extension/core/module-registry.js`：冻结的模块元数据，包括严格的页面匹配条件、注入 world 与本地文件顺序。
- `extension/core/url-match.js`：统一验证协议、精确 origin、完整路径段前缀及唯一查询参数。
- `extension/background/service-worker.js`：接收弹窗请求，重新查询活动标签页并再次验证 URL，然后通过 `chrome.scripting.executeScript` 注入注册文件。
- `extension/modules/qlu-grade/`：成绩解析核心、与桌面版一致的 GPA 规则、森林绿奶油色 Shadow DOM 界面和启动/请求流程。

## 数据流

1. 用户打开弹窗；弹窗读取当前活动标签页 URL，并使用注册表与 URL matcher 判断模块是否可用。
2. 用户点击“打开工具”；弹窗发送模块 ID 和当时观察到的标签页 ID。
3. Service worker 重新读取活动标签页，校验标签页未变化、模块存在且 URL 仍符合条件。
4. Service worker 按注册顺序将模块的本地文件注入顶层 frame。成绩模块使用 `MAIN` world，以便读取教务页面中的学年/学期控件并执行同源、携带当前会话的请求。
5. 成绩模块向相对路径 `/jwglxt/cjcx/cjcx_dcXsKccjList.html` 请求 Excel。响应在内存中接受大小、PK/ZIP 结构、条目数量和解压后大小限制检查。
6. 核心读取 XLSX 中的工作表 XML，提取课程、成绩与成绩分项，并按有效学分和总评计算 5.0 制加权 GPA，交给 Shadow DOM 界面显示。
7. 用户选择导出时，浏览器从内存中的原始响应创建本地 Blob 下载；关闭工具会清理本次导出状态。

## 安全边界

- 无持久 host permission，也没有常驻 content script；注入必须由用户操作触发。
- 弹窗与 service worker 双重验证 URL，防止点击后切换标签页或页面地址变化。
- 只允许 HTTPS、精确 `jw.qlu.edu.cn` origin、完整路径段前缀，以及唯一且精确的 `gnmkdm=N305005`。
- 模块文件来自冻结注册表，必须是扩展目录内安全的相对本地路径。
- Service worker 只接受来自本扩展的消息，并且只认可有限的模块返回状态。
- Popup 不含内联脚本、内联样式、事件处理属性或 `javascript:` URL，符合扩展 CSP 的本地代码模型。
- 运行时代码没有第三方远程脚本、样式或资源；唯一固定远端站点是齐鲁工业大学教务系统。
- 成绩文件解析具有响应大小、ZIP 条目数、条目解压大小、目录边界、压缩方式和加密状态检查。
- 无遥测和扩展存储。临时全局 API 在模块启动后删除，界面使用独立 Shadow DOM。

## 构建与验证

`npm run verify` 静态验证扩展结构并运行语法检查和单元测试。`npm run package` 先执行验证，然后仅收集 `extension/**` 中的发布文件，按路径排序，以固定时间戳和 stored ZIP 条目写入 `dist/toolbox-0.2.3.zip`，最后重新读取并验证中央目录、文件名、大小和 CRC。
