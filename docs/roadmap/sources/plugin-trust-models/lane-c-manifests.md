# Lane C（part 1）：声明式权限系统调研 — Chrome MV3 / Figma Plugins / VS Code

抓取日期：**2026-09-14**（下文每条均标注官方 URL；当天没抓到原文的一律标 **未核实 (unverified)**）
方法：只读官方文档 WebFetch/WebSearch。凡是我"记得但今天没抓到原句"的，一律不写进结论。

---

## 0. 一句话对照表

| | 声明在哪 | 谁来强制 | 没声明就用会怎样 | 用户闸 |
|---|---|---|---|---|
| Chrome MV3 | `manifest.json` 的 `permissions` / `optional_permissions` / `host_permissions` / `content_security_policy` | 浏览器运行时（C++ 侧 API bindings + 网络层 CORS + CSP 引擎），非仅审核 | API/字段不可用（字段"只在有权限时存在"；网络请求退化为跨域被 CORS 拦） | 安装时一屏警告列表（逐条文案见下）＋ 逐站点 site access 三档＋ 一键 Remove |
| Figma | `manifest.json` 的 `networkAccess.allowedDomains` / `reasoning` / `devAllowedDomains` / `permissions` / `capabilities` / `documentAccess` | 运行时 **CSP**（网络）＋ **两界架构**（沙箱 realm 根本没有 fetch/DOM） | 请求被 CSP 拒绝并抛错（有原句）；permissions 未声明的行为**未核实** | 无逐权限弹窗；Community 页显示网络访问档位；运行时底部 toast |
| VS Code | `package.json` 的 `capabilities.untrustedWorkspaces` / `enabledApiProposals` | **进程隔离但无沙箱**（官方原句）＋ 工作区信任在扩展宿主层开关＋ Marketplace 签名/扫描（发布侧） | 受限模式下整个扩展被禁用；proposed API 在 stable 不可用 | Workspace Trust 弹窗（Trust / Don't Trust）＋ 1.97 起发布者信任弹窗＋ 全局 `security.workspace.trust.enabled` |

**对 Nomi 最直接的一条**：Chrome 和 Figma 都把"能不能联网、能联到哪"做成 **manifest 声明 + 运行时网络层强制**，而不是审核时看一眼；VS Code 恰恰是反例——它**明说没有沙箱**，只能靠工作区信任 + 发布侧签名兜底。我们持有 API key 和钱，抄的应该是 Figma/Chrome 那条线。

---

## 1. Chrome Extensions（Manifest V3）

### 1.1 manifest 字段（原始字段名 + 原始片段）

来源：https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions （2026-09-14 抓取）

四个权限相关键，原始字段名：

```json
{
  "permissions": ["activeTab", "contextMenus", "storage"],
  "optional_permissions": ["topSites"],
  "host_permissions": ["https://www.developer.chrome.com/*"],
  "optional_host_permissions": ["https://*/*", "http://*/*"]
}
```

CSP 键（来源：https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy ，2026-09-14）：

```json
{
  "content_security_policy": {
    "extension_pages": "...",
    "sandbox": "..."
  }
}
```

- `extension_pages` 默认值原句：`"script-src 'self'; object-src 'self';"`
- `sandbox` 默认值原句：`"sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline'"`
- Chrome 对 extension pages 强制的**最低**策略原句：`"script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"`
- 因此：**远程代码不可加载**（script-src 不能超出 `'self'`），`'unsafe-eval'` 在 extension pages 会在**安装时报错**，wasm 默认关闭（`'wasm-unsafe-eval'` 属最低策略内）。

### 1.2 谁强制

- **浏览器运行时**（不是审核时）：API 绑定层 + 网络层 + CSP 引擎。
- 网络层原句（https://developer.chrome.com/docs/extensions/develop/concepts/network-requests ，2026-09-14）：
  > "If the extension attempts to request content from a security origin other than its own, say https://www.google.com, this will be treated as a cross-origin request unless the extension has host permissions."
  即：没有 `host_permissions` 的 fetch 退化成普通跨域请求，由 CORS 决定死活。**"具体报什么错"官方页没写 → 未核实 (unverified)**。

### 1.3 没声明就调用会怎样

- **字段级静默缺失**（最重要的一种）：`chrome.tabs` 文档说敏感字段（`url` / `pendingUrl` / `title` / `favIconUrl`）"only present if the extension has the `"tabs"` permission or host permissions for the page"（https://developer.chrome.com/docs/extensions/reference/api/tabs ，2026-09-14）。**注意：调用不抛错，只是字段不在** —— 这对我们是个反面教材：静默缺失比抛错更难排查。
- **命名空间 undefined**：`browser.userScripts` 在未开启开关时"is undefined"，且官方建议的检测法是"调一个本该总是成功的方法，抛错即不可用"（https://developer.chrome.com/docs/extensions/reference/api/userScripts ，2026-09-14）。
- **统一的"未声明即抛 X 错误"官方总述**：今天没抓到 → **未核实 (unverified)**。现有证据只能支持"要么 undefined、要么字段缺失、要么被 CORS/CSP 拦"三种形态。

### 1.4 运行时申请：`chrome.permissions.request`

来源：https://developer.chrome.com/docs/extensions/reference/api/permissions （2026-09-14）

```js
browser.permissions.request({
  permissions: ['tabs'],
  origins: ['https://www.google.com/']
}, callback);
```

- 原句："Permissions must be requested from inside a user gesture, like a button's click handler."（必须在用户手势里请求）
- 只有当请求带来**新的警告文案**时 Chrome 才弹框（已接受过的不再打扰）。
- 动态域名场景：`optional_host_permissions` 里写 `"https://*/*"`，运行时再具体申请。

### 1.5 `activeTab`：不要广权限的范例（值得抄）

来源：https://developer.chrome.com/docs/extensions/develop/concepts/activeTab （2026-09-14）

- 授予什么：在**当前活动标签页**注入脚本/CSS、读该 tab 的 URL/title/favicon、拦该 tab 主框架的网络请求。
- 怎么被激活：用户**显式动作**——点扩展按钮、点右键菜单项、按快捷键、接受 omnibox 建议。
- 安装警告：**没有警告文案**（与 `<all_urls>` 形成对比）。
- 何时失效：原句 "Access to the tab lasts while the user is on that page, and is revoked when the user navigates away or closes the tab."

> **这是 Nomi 该抄的核心模型**：不是"插件预先拿到全量权限"，而是"用户的一次操作 = 一次有界、随导航自动过期的授权"。

### 1.6 安装摩擦 + 用户看到的确切文案

安装步骤（https://support.google.com/chrome_webstore/answer/2664769 ，2026-09-14）：
1. 打开 Chrome Web Store → 2. 选扩展 → 3. 点 **"Add to Chrome"** → 4. 在权限确认框点 **"Add extension"**。
卸载：右键扩展图标 → **"Remove from Chrome"**；或 Manage extensions → **"Remove"** → 再确认 **"Remove"**。

逐权限警告文案（原文逐字，https://developer.chrome.com/docs/extensions/reference/permissions-list ，2026-09-14 抓取；节选与"花钱/秘密"最相关的几条）：

| 权限 | 用户看到的原文 |
|---|---|
| `debugger` | "Access the page debugger backend." ＋ "Read and change all your data on all websites." |
| `proxy` | "Read and change all your data on all websites." |
| `nativeMessaging` | "Communicate with cooperating native applications." |
| `clipboardRead` | "Read data you copy and paste." |
| `clipboardWrite` | "Modify data you copy and paste." |
| `history` | "Read and change your browsing history on all signed-in devices." |
| `tabs` | "Read your browsing history." |
| `management` | "Manage your apps, extensions, and themes." |
| `identity.email` | "Know your email address." |
| `geolocation` | "Detect your physical location." |
| `downloads` | "Manage your downloads." |
| `desktopCapture` | "Capture content of your screen." |
| `privacy` | "Change your privacy-related settings." |
| `declarativeNetRequest` | "Block content on any page." |

（完整表还有 `bookmarks` / `contentSettings` / `favicon` / `notifications` / `pageCapture` / `readingList` / `sessions` / `system.storage` / `tabCapture` / `tabGroups` / `topSites` / `ttsEngine` / `webAuthenticationProxy` / `webNavigation` / `accessibilityFeatures.*`，均已抓到原文，见同一 URL。）

警告生成规则（https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings ，2026-09-14）：
- 原句 "Some permissions are less intrusive and don't display a warning. Other permissions trigger a warning that users have to allow."
- 警告会**去重/被吞并**：例如同时有 `<all_urls>` 时，`"tabs"` 的那条不再单独显示。
- 升级时如果新增了带警告的权限，**扩展会被禁用直到用户接受**。
- 安装弹窗的按钮字面文案在这页里没有 → 按钮文案我引的是上面 Web Store 帮助页的 "Add extension"。

逐站点用户闸（https://developer.chrome.com/docs/extensions/mv2/runtime-host-permissions ，2026-09-14 检索）：用户可在 `chrome://extensions` 或扩展右键菜单里，把某扩展的站点访问设成 **on click / on specific sites / on all requested sites** 三档；设成 on click 时 Chrome 会给图标加圆点角标表示"它想访问这个站"。

---

## 2. Figma Plugins

### 2.1 manifest 字段（原始字段名 + 原始片段）

来源：https://developers.figma.com/docs/plugins/manifest/ （2026-09-14）

```json
"networkAccess": {
  "allowedDomains": ["none"],
  "reasoning": "string",
  "devAllowedDomains": ["http://localhost:3000"]
}
```

- `allowedDomains`：**必填**。合法形态：`["none"]`（完全不能联网）、`["*"]`（任意域，此时 `reasoning` 变必填）、`"*.example.com"`（通配子域）、具体域或路径（如 `"httpbin.org/get"`）。允许的 scheme：`http`、`https`、`ws`、`wss`。
- 路径粒度：**没有尾斜杠的 pattern 会挡住更深路径**——`api.example.com/rest/get` 不允许访问 `api.example.com/rest/get/exampleresource.json`（https://developers.figma.com/docs/plugins/making-network-requests/ ，2026-09-14）。
- `reasoning`：当 `allowedDomains` 含 `"*"` 或在生产里含本地/开发服务器时必填；**发布后这段理由连同域名清单一起展示在插件的 Community 页上**。
- `devAllowedDomains`：仅开发期生效的域名 pattern。
- `permissions`：`"currentuser" | "activeusers" | "fileusers" | "payments" | "teamlibrary"`，分别解锁 `figma.currentUser` / `figma.activeUsers` / `StampNode.getAuthorAsync` / `figma.payments` / `figma.teamLibrary`。
- `capabilities`：`"textreview" | "codegen" | "inspect" | "vscode"`。
- `editorType`：`"figma" | "figjam" | "dev" | "slides" | "buzz"`（`["figjam","dev"]` 组合不支持）。
- `documentAccess`：唯一值 `"dynamic-page"`，新插件必填。

### 2.2 谁强制 —— 两道，都是运行时

**(a) 网络层 = CSP。** 原句（https://developers.figma.com/docs/plugins/manifest/ ，2026-09-14）：
> "Your plugin can only access the domains that you specify. If your plugin attempts to access other domains, the plugin is prevented from doing so."

违规时用户/开发者看到的**原文错误**（https://developers.figma.com/docs/plugins/making-network-requests/ ，2026-09-14）：
> "Refused to connect to 'https://httpbin.org/post' because it violates the following Content Security Policy directive: "default-src data:"."

生效时点原句："After `networkAccess` is implemented, Figma enforces the list of domains that you gave for `allowedDomains`."
→ 注意：**不是审核时**，是运行时 CSP 直接拒连。这是"机械强制"的教科书形态。

**(b) 架构层 = 两界隔离（比 CSP 更硬）。** 来源：https://developers.figma.com/docs/plugins/how-plugins-run/ （2026-09-14）
- 沙箱主线程原句："The sandbox is a minimal JavaScript environment and **does not expose browser APIs**."
- 具体缺什么，原句："browser APIs like `XMLHttpRequest`, `fetch`, `setTimeout`, and the DOM are not _directly_ available from the sandbox."
- 有网络/DOM 的那一半必须显式开 iframe：`figma.showUI()`，"you can write any HTML/JavaScript and access any browser APIs"。
- 两界通信：原句 "The main thread and the iframe can communicate with each other through **message passing**."（postMessage）

> 含义：**碰文档的那层根本不具备联网能力，联网的那层不碰文档**。就算 CSP 被绕，碰数据的 realm 里也没有 fetch 可用。这是"能力不可达"而非"权限被拒"。

### 2.3 没声明就用会怎样

- 网络：**有原文**（上面的 CSP 拒连错误）。
- `permissions`（如未声明 `"currentuser"` 却调 `figma.currentUser`）：manifest 文档**没有写**未声明时的行为 → **未核实 (unverified)**。
- 审核期是否另有检查（human review 会不会因 `allowedDomains: ["*"]` 打回）：今天没抓到官方原句 → **未核实 (unverified)**。已核实的只有"`reasoning` 会公开展示在 Community 页"。

### 2.4 安装/运行摩擦 + 用户看到什么

来源：https://help.figma.com/hc/en-us/articles/360042532714-Use-plugins-in-files （2026-09-14）

- **没有逐权限的安装弹窗**。用户在 Community 页看到的是一个**网络访问档位标签**，四种：
  - "Unknown network access" — 未定义，插件可访问任意域
  - "Unrestricted network access" — 可访问任意域（附开发者 reasoning）
  - "Restricted network access" — 仅限指定域；**点它可展开看具体域名清单**
  - "No access to network" — 不能联网
- 运行时可见性：插件运行期间文件底部有 toast；用了 iframe 的话，iframe 顶部显示插件名和图标。
- 插件是**手动运行**的（不常驻），关掉 UI 即停。
- "如何移除/停止一个正在跑的插件"的确切 UI 步骤该页没写 → **未核实 (unverified)**。

---

## 3. VS Code Extensions

### 3.1 manifest（package.json）字段

**Workspace Trust**（https://code.visualstudio.com/api/extension-guides/workspace-trust ，2026-09-14）：

```json
"capabilities": {
  "untrustedWorkspaces": { "supported": true }
}
```
三种形态（原文结构）：
```
capabilities:
  untrustedWorkspaces:
    { supported: true } |
    { supported: false, description: string } |
    { supported: 'limited', description: string, restrictedConfigurations?: string[] }
```
- `true` — "fully supported in Restricted Mode as it does not need Workspace Trust"
- `false` — "not supported in Restricted Mode as it cannot function without Workspace Trust"
- `'limited'` — "Some features of the extension are supported in Restricted Mode"
- `restrictedConfigurations` — 一组配置项 ID，不信任时**不接受工作区给出的值**（防"工作区里塞一个恶意 linter 路径"）。

**Proposed API**（https://code.visualstudio.com/api/advanced-topics/using-proposed-api ，2026-09-14）：
```json
"enabledApiProposals": ["<proposalName>"]
```
原句："Proposed APIs are ... subject to change, only available in Insiders distribution and should not be used in published extensions." 以及 "While you should not publish extensions using the proposed API on the Marketplace, you can still share your extension with your peers by packaging and sharing your extension."
→ 这条主要靠**发布侧策略**约束；"stable 里运行会具体怎样"该页没写 → **未核实 (unverified)**。

### 3.2 谁强制 —— **关键反例：没有沙箱（官方原句）**

来源：https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security （2026-09-14）
> "The extension host has the same permissions as VS Code itself. This means that any action that VS Code can perform, an extension can also perform."

来源：https://code.visualstudio.com/docs/editor/workspace-trust （2026-09-14）
> "Most extensions run code on your behalf and could potentially do harm."

官方团队的补充说法（https://github.com/microsoft/vscode-discussions/discussions/8 ，2026-09-14）：
> "there is no mechanism to prevent a malicious extension from executing your commands. In fact malicious extensions running under VS Code could do much worse - change the source code of your extension by using fs api"
同帖："In the future we plan to investigate more into sandboxing extensions."（即：**当下没有沙箱**）

扩展宿主进程（https://code.visualstudio.com/api/advanced-topics/extension-host ，2026-09-14）：
> "The Extension Host in VS Code prevents extensions from impacting startup performance, slowing down UI operations, [and] modifying the UI."
→ 注意这只是**稳定性/性能隔离**，页面里**没有**"separate process""sandboxed"的字样。"扩展宿主是独立进程"这一点今天没在官方页抓到明确表述 → **未核实 (unverified)**（业界常识但本轮不作为证据）。

**层次归属**：VS Code 的强制发生在 ① 扩展宿主对受限模式的启停（应用层），② Marketplace 发布侧（签名/扫描/封禁），③ 首装时的发布者信任弹窗。**没有** OS 进程沙箱、没有网络层白名单、没有逐能力的运行时权限检查。

### 3.3 SecretStorage（OS keychain 支撑）

- 用法：`context.secrets.get('key')`（`SecretStorage` 挂在 `ExtensionContext` 上）。
- 官方 discussion 原句（https://github.com/microsoft/vscode-discussions/discussions/8 ，2026-09-14）：
  > "we encrypt the strings before adding them to the keyring to make it harder for other processes and extensions that also have access to the keyring to read the secrets"
- 落盘位置：macOS 用 Keychain（条目名 "Code Safe Storage" / "Code - Insiders Safe Storage"）存加密密钥，密文落在用户数据目录的 SQLite；桌面端用 Electron `safeStorage`；Linux 用 Secret Service/libsecret，Windows 用 Credential Vault。（来源：https://github.com/microsoft/vscode-discussions/discussions/748 ，2026-09-14 检索结果）
- 明确警告：**不要**用 `workspaceState` / `globalState` 存密钥，那是明文。
- `SecretStorage` 接口的逐方法签名（`get`/`store`/`delete`/`onDidChange`）今天在 https://code.visualstudio.com/api/references/vscode-api 上抓取被截断，未取到原文 → **方法签名未核实 (unverified)**（"用 context.secrets、OS keyring 支撑、先加密"这三点已核实）。

> 对 Nomi 的直接教训：即便是"没有沙箱"的 VS Code，也**明确区分**了"明文 state"和"OS keychain + 先加密的 secret"两条通道，并在文档里把前者点名为反模式。我们的 key 存储至少要做到这一档。

### 3.4 Marketplace 侧（发布时/安装时）

同一 runtime-security 页（2026-09-14），逐条原句：
- 发布者信任弹窗："As of VS Code release 1.97, when you first install an extension from a third-party publisher, VS Code shows a dialog prompting you to confirm that you trust the publisher."（**弹窗的逐字文案两页都没给 → 未核实 (unverified)**）
- 恶意软件扫描："The Marketplace runs a malware scan on each extension package that's published to ensure its safety."
- 扩展签名："The Visual Studio Marketplace signs all extensions when they're published. VS Code checks this signature when you install an extension to verify the integrity and the source of the extension package."（Marketplace 页同义表述：安装时验签失败会提示 "exercise caution before deciding to install anyway"）
- 封禁名单：恶意扩展会被下架并 "automatically uninstalled by VS Code"。
- 认证发布者（https://code.visualstudio.com/api/working-with-extensions/publishing-extension ，2026-09-14）："You can become a **verified publisher** by verifying ownership of an eligible domain associated with your brand or identity." 门槛：扩展在市场上 ≥6 个月，域名注册 ≥6 个月，DNS TXT 验证，人工审核 5 个工作日。通过后名字旁有蓝色对勾。

### 3.5 安装摩擦 + 用户闸

- 安装：Extensions 视图点 Install（一步）；1.97 起首次装陌生发布者多一个信任确认弹窗。
- 关闭单个扩展：扩展条目右侧 **Manage**（齿轮）→ Disable（可选全局或仅本工作区），会提示重启扩展宿主；卸载同一齿轮 → **Uninstall**。
- **全局开关**：`security.workspace.trust.enabled`（默认 `true`）。相关项：`security.workspace.trust.startupPrompt`、`security.workspace.trust.emptyWindow`、`security.workspace.trust.untrustedFiles`、`extensions.supportUntrustedWorkspaces`（**用户可覆盖扩展自己的声明**，重要）。
- Restricted Mode 下的实际后果（官方 guide 原文要点）：声明 `false` 的扩展 "disabled until Workspace Trust is granted"；其余得到 "limited functionality geared towards browsing code"；**调试被禁、任务执行被禁**。
- 信任弹窗按钮：**Trust** / **Don't Trust**；弹窗完整文案原文该页未给 → **未核实 (unverified)**。
- 发布者信任管理：命令 **Extensions: Manage Trusted Extensions Publishers**。

---

## 4. 给 Nomi 的可抄结论（只写有证据支撑的）

1. **网络白名单必须写进 manifest 并由运行时网络层拒连，不是审核时看。** Figma 是最干净的样板：`networkAccess.allowedDomains` + 运行时 CSP 拒连 + 路径粒度（无尾斜杠即挡更深路径）+ 用 `"*"` 必须写 `reasoning` 且 `reasoning` 对用户公开。我们持有 key，最怕的就是插件把 key 外传——这条直接对上。
2. **"碰敏感数据的那层没有联网能力"比"有能力但被拒"更强。** Figma 两界架构（沙箱无 `fetch`/DOM，iframe 有网络但不碰文档，靠 postMessage）是能力不可达，值得照搬到"插件代码 / 宿主 API"分界上。
3. **默认授权用 activeTab 式的一次性、随上下文过期的窗口**，而不是安装时一把全给：用户显式动作触发、导航即撤销、且**安装时零警告文案**（摩擦最低）。
4. **警告文案必须是固定的、逐权限的、以"它能对你做什么"写的短句**（Chrome 的 "Read data you copy and paste." 这种），不是开发者自由发挥的描述。同时要做"警告去重"（更广的权限吞掉更窄的那条），否则用户会被噪声淹没。
5. **未声明即失败的形态要选对**：Chrome 有一类是"字段静默缺失"（`tab.url` 不存在），排查成本很高。我们应当选**抛错**而非静默缺失。
6. **VS Code 是我们不该抄的那条路**：官方明说扩展与宿主同权限、无沙箱，安全全靠发布侧（签名 + 扫描 + 封禁）和工作区信任开关。但它有两点值得抄：① `capabilities.untrustedWorkspaces` 这种"扩展自己声明在不信任环境下能干什么"的三档模型；② `restrictedConfigurations`——**不接受来自不可信来源的某些配置值**，正好对应"项目文件里塞一个恶意模型端点"这类攻击。
7. **全局一键降级开关**（`security.workspace.trust.enabled` + `extensions.supportUntrustedWorkspaces` 允许用户覆盖扩展声明）是标配：用户必须能不信任任何插件的自我声明。

---

## 5. 本轮未核实清单（unverified，不要当事实用）

- Chrome：未声明权限时的**统一**失败语义（是抛错还是 undefined）没有官方总述页；只核实了 `tabs` 字段"只在有权限时存在"、`userScripts` 在关闭时 `undefined`、跨域被 CORS 处理三种局部形态。
- Chrome：安装权限弹窗的**逐字**标题/列表格式（只核实了按钮 "Add to Chrome" / "Add extension" 来自 Web Store 帮助页）。
- Figma：未声明 `permissions` 却调用 `figma.currentUser` / `figma.payments` 的运行时行为。
- Figma：审核（human review）阶段是否对 `allowedDomains: ["*"]` 有额外检查或打回。
- Figma：停止/移除正在运行的插件的确切 UI 步骤。
- VS Code：扩展宿主"是独立进程"的官方明文（只核实了"与 VS Code 同权限、无沙箱"和"防止影响启动性能/UI"）。
- VS Code：`SecretStorage` 接口的逐方法签名（`get`/`store`/`delete`/`onDidChange`）。
- VS Code：Workspace Trust 弹窗与 1.97 发布者信任弹窗的**逐字**文案。
- VS Code：proposed API 扩展在 stable 版运行时的确切失败行为。

## 6. 抓取过的 URL（全部 2026-09-14）

- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- https://developer.chrome.com/docs/extensions/reference/permissions-list
- https://developer.chrome.com/docs/extensions/reference/api/permissions
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developer.chrome.com/docs/extensions/reference/api/tabs
- https://developer.chrome.com/docs/extensions/reference/api/userScripts （经检索）
- https://developer.chrome.com/docs/extensions/mv2/runtime-host-permissions （经检索）
- https://support.google.com/chrome_webstore/answer/2664769
- https://developers.figma.com/docs/plugins/manifest/
- https://developers.figma.com/docs/plugins/how-plugins-run/
- https://developers.figma.com/docs/plugins/making-network-requests/
- https://help.figma.com/hc/en-us/articles/360042532714-Use-plugins-in-files
- https://code.visualstudio.com/api/extension-guides/workspace-trust
- https://code.visualstudio.com/docs/editor/workspace-trust
- https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security
- https://code.visualstudio.com/docs/configure/extensions/extension-marketplace
- https://code.visualstudio.com/api/advanced-topics/extension-host
- https://code.visualstudio.com/api/advanced-topics/using-proposed-api
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- https://code.visualstudio.com/api/references/vscode-api （内容被截断，SecretStorage 段未取到）
- https://github.com/microsoft/vscode-discussions/discussions/8
- https://github.com/microsoft/vscode-discussions/discussions/748 （经检索）
