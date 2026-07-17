# 模块编写约定

ToolBox 的模块由冻结注册表驱动。新增模块时，应先实现独立运行文件，再把元数据加入 `extension/core/module-registry.js`；弹窗与 service worker 不应为单个模块添加特殊分支。

## 注册表契约

模块记录使用以下结构：

```js
{
  id: 'unique-module-id',
  label: '弹窗中的名称',
  description: '简短用途说明',
  matches: {
    origin: 'https://example.edu.cn',
    pathPrefix: '/safe/path/',
    query: { feature: 'expected-value' }
  },
  world: 'MAIN',
  files: [
    'modules/example/core.js',
    'modules/example/ui.js',
    'modules/example/main.js'
  ],
  runBehavior: 'singleton'
}
```

约束：

- `id` 全局唯一且稳定。
- `origin` 必须是固定 HTTPS origin，不使用通配符或用户信息。
- `pathPrefix` 从 `/` 开始，并按完整路径段匹配。
- `query` 中每个键都要求 URL 中恰好出现一次且值完全一致；未声明的无害参数可以存在。
- `files` 按执行顺序列出，只能使用扩展根目录内、无 `..`、反斜杠、查询或 fragment 的相对本地路径。
- 模块记录、`matches`、`query` 和 `files` 应冻结。
- `world` 只在确实需要页面 JavaScript 环境、页面 DOM 状态或同源页面会话时使用 `MAIN`；否则优先隔离 world。
- `runBehavior: 'singleton'` 表示重复运行应重新打开现有界面，而不是创建重复实例。

## 运行结果契约

注册文件中的最后一个入口脚本应产生可序列化结果：

```js
{ ok: true, status: 'started' }
{ ok: true, status: 'already-open' }
{ ok: false, status: 'unsupported-page' }
{ ok: false, status: 'module-unavailable' }
```

Service worker 只把 `started` 和 `already-open` 视为成功。入口脚本仍需自行重新检查实时页面条件，因为页面可能在注入前后发生变化。

如果前置文件通过临时全局变量传递 API：

- 使用模块专属、难冲突的 key。
- 导出的 API 对象应冻结。
- 属性应为不可写、不可枚举且可配置。
- 入口脚本获取 API 后立即删除临时全局；异常路径也应在 `finally` 中清理。

## 数据与界面约定

- 网络请求优先使用固定同源相对路径，不拼接用户提供的 host。
- 不加载远程脚本、样式、字体或图片，不使用 `eval` 或动态代码生成。
- 不记录账号、Cookie 或业务数据，不新增遥测或存储，除非未来经过明确的产品和权限评审。
- 对响应设置明确的字节、条目、解压和结构边界；错误应映射为稳定、面向用户的状态。
- 页面界面优先使用 Shadow DOM，所有业务文本通过 `textContent` 等安全 DOM API写入。
- 重复运行、关闭、重试和并发请求应有确定行为；旧请求不能覆盖新状态。

## 测试清单

新增模块至少应覆盖：

1. 精确支持 URL、允许的附加查询/fragment、错误协议、错误/伪装 host、路径段边界及必需查询参数的缺失/重复/错误值。
2. 未知模块和无效注册元数据。
3. 注册表冻结状态及每个文件路径的本地相对路径安全。
4. 核心数据的正常化、空值/零值、分组或转换逻辑。
5. 所有输入大小与结构上限，测试数据必须在本地构造，不依赖真实账号或生产响应。
6. 模块重复运行和入口结果契约，可在浏览器环境中补充 DOM 或已登录流程检查。

完成后运行：

```bash
npm test
npm run verify
npm run package
```

浏览器中的已登录站点验证应单独记录；单元测试和打包成功不等于已完成真实账号或 VPN 环境测试。
