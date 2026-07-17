# QLU ToolBox · Browser Edition

QLU ToolBox 浏览器版是一款面向齐鲁工业大学教务系统的 Chrome / Edge Manifest V3 扩展。它在用户主动点击后读取当前成绩查询页的同源 Excel 数据，在页面内展示成绩分项、估算 5.0 制加权 GPA，并保留原始 Excel 导出能力。

0.2.3 已与 [QLU ToolBox 主版本](https://github.com/2921323707/qlu-toolbox/tree/main) 的品牌和业务规则对齐：采用同源透明 Logo、相同的成绩字段及 GPA 换算规则，同时保留浏览器扩展的轻权限和即时查询定位。

## 0.2.3 亮点

- 全新的森林绿奶油主题，以深森林绿、奶油白、鼠尾草绿和少量香槟金建立层级，并提供完整的减弱动效适配。
- 当当前标签页不是学生成绩查询页时，解释原因并一键打开正确入口；未登录时继续由教务系统完成登录。
- 查询后显示课程数、成绩分项数和基于已发布总评的加权 GPA。
- 主版本透明品牌图标转换为灰阶版本，完整覆盖 16、32、48、128 像素扩展资源，不再使用旧番茄图形。

## 安装未打包版本

项目没有运行时或开发依赖，不需要执行 `npm install`。

### Chrome

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `extension/` 目录。

### Edge

1. 打开 `edge://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本项目的 `extension/` 目录。

## 使用成绩分项模块

1. 点击浏览器工具栏中的 QLU ToolBox 图标。
2. 如果当前不在成绩查询页，扩展只会显示提示；请手动打开教务系统并进入“学生成绩查询”。
3. 在页面中选择学年和学期，再次打开扩展并点击“查看分项”。
4. 成绩面板会在当前页面显示课程、成绩分项、参与计算的学分及加权 GPA。
5. 需要保留原始结果时，点击“导出 Excel”。

GPA 规则与桌面版 1.1.0 保持一致。只有同时具备有效学分和“总评/总评成绩”的课程会纳入汇总；结果用于快速核对，不替代学校官方认定。

## 权限说明

QLU ToolBox 只声明以下两个权限：

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 仅在用户点击运行后，临时读取或导航当前标签页。 |
| `scripting` | 将已随扩展打包的成绩模块注入经过严格校验的页面。 |

扩展不声明 `host_permissions`、`optional_host_permissions`、`content_scripts`、`web_accessible_resources` 或存储权限。

## 隐私与安全

- 无遥测、分析或崩溃上报。
- 不保存账号、Cookie、成绩、查询记录或 GPA 结果。
- 不把成绩数据上传到第三方服务。
- 成绩请求使用当前教务系统页面已有的登录会话，并只访问同源接口。
- Excel 解析、GPA 计算、成绩展示和文件下载均在本机浏览器内完成。
- 成绩响应接受大小、ZIP 条目数、目录边界、压缩方式和解压后大小检查。

QLU ToolBox 不是齐鲁工业大学官方软件，与学校及教务系统服务商不存在隶属或担保关系。学校系统调整可能导致功能暂时不可用，查询与 GPA 结果应以教务系统官方记录为准。

## 开发命令

```bash
npm test
npm run verify
npm run package
```

- `npm test` 运行模块注册表、URL matcher、成绩解析和 GPA 规则测试。
- `npm run verify` 检查 Manifest、权限、图标、弹窗 CSP、本地资源、JavaScript 语法和单元测试。
- `npm run package` 会先完成验证，再生成确定性 ZIP。

打包产物位于：

```text
dist/toolbox-0.2.3.zip
```

## 项目结构

```text
extension/                       Manifest V3 扩展源码
  popup/                         Liquid Glass 弹窗与成绩页引导
  background/                    二次校验与按需脚本注入
  core/                          模块注册表与 URL matcher
  modules/qlu-grade/             XLSX 解析、GPA 汇总和成绩浮层
docs/                            架构、模块规范与整合记录
scripts/                         验证和确定性打包
tests/                           Node.js 单元测试
```

架构与安全边界见 [docs/architecture.md](docs/architecture.md)，上游能力映射见 [docs/upstream-integration.md](docs/upstream-integration.md)，主题设计见 [森林绿奶油主题设计](docs/plans/2026-07-17-forest-cream-theme-design.md)。
