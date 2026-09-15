# Lane D — 桌面应用插件信任模型（Zed / Raycast / Obsidian / Electron）

抓取日期：**2026-09-14**。所有结论带官方 URL；当天没查到的一律标 **未核实 (unverified)**。
代码级结论取自 `zed-industries/zed` `main` 分支 raw 文件（2026-09-14 拉取），标注为「源码核实」——源码是官方真相源，但比文档更容易随版本漂移。

---

## 0. 一句话对比表

| | 插件跑在哪 | 能拿到用户模型 key 吗 | 声明式清单 | 谁来执行 | 违规时 | 安装摩擦 |
|---|---|---|---|---|---|---|
| **Zed** | WASM (wasmtime, `wasm32-wasip2`)，WASI 只 preopen 扩展自己的工作目录 | 不能直接读（key 在系统 keychain，`get-settings` 有类别白名单）；但 `worktree.shell-env()` 未受能力门控（源码核实）→ 环境变量里的 key 会泄 | `extension.toml` 的 `[[capabilities]]`（`process:exec` / `download_file` / `npm:install`）+ 用户侧 `granted_extension_capabilities` 设置 | **运行时双重检查**：宿主 Rust 代码同时校验「清单声明」和「用户授予」 | 宿主抛错：`capability for process:exec … was not listed in the extension manifest` / `… is not granted by the extension host` | Gallery 一键装，**无权限弹窗**；发布需人工评审 |
| **Raycast** | 单个子 Node.js 进程，每扩展一个 v8 worker 线程 | **不需要**：`AI.ask()` 走 Raycast 自己的后端（需 Pro）；也可以自己在 `preferences` 里存 key | `package.json`（`preferences[].type: "password"`、`platforms`、`tools`、`ai`）——**没有 permissions 字段** | **只有评审期 + CI 校验**；运行时「not further sandboxed」 | 不会发生——运行时不拦（能力本来就是全开的 Node） | Store 一键装，**无权限弹窗**；发布必过人工评审 |
| **Obsidian** | 与应用同进程（Electron 渲染层），**完全不沙箱** | 不适用（Obsidian 本体不管 key）；插件能读磁盘上任何东西，包括别的插件存的 key | `manifest.json`（`id`/`name`/`version`/`minAppVersion`/`isDesktopOnly`…）——**没有任何权限字段** | **不执行**（官方明说做不到）；只有自动扫描 + 安全评分卡 | 不会发生——没有能力概念 | 全局 Restricted Mode 默认开；关掉它才能装，逐个插件再手动 enable |
| **Electron 本体** | 渲染进程默认 `sandbox: true`（Chromium 沙箱）；主进程 / `utilityProcess` 全权限 | — | — | OS/Chromium 进程沙箱（仅渲染层） | — | 官方立场：Electron **不适合**跑不受信任的内容 |

---

## 1. Zed Extensions

### 1.1 跑在哪

- 扩展编译成 WebAssembly，目标 `wasm32-wasip2`，宿主用 wasmtime。
  官方文档：「Procedural parts of extensions are written in Rust and compiled to WebAssembly. … we use the `wasm32-wasip2` Rust target」
  <https://zed.dev/docs/extensions/developing-extensions>（fetched 2026-09-14）
- **WASI 给的文件系统权限极窄**（源码核实，`crates/extension_host/src/wasm_host.rs` `build_wasi_ctx`，2026-09-14）：

```rust
let permissions = wasmtime_wasi::FsPerms::ReadWrite;
let mut ctx = WasiCtxBuilder::new();
ctx.inherit_stdio().env("PWD", &path).env("RUST_BACKTRACE", "full");
ctx.preopened_dir(&path, ".", permissions)?;
ctx.preopened_dir(&path, &path, permissions)?;
```

  即：**只 preopen 扩展自己的 work dir**（`~/Library/Application Support/Zed/extensions/work/<id>`），没有 `inherit_network()`、没有 `inherit_env()`。所以 WASI 层面几乎没有能力——真正的能力全部来自宿主显式 import 的 WIT 接口。

- 官方博客对能力面的自述（2026-09-14 抓取，<https://zed.dev/blog/zed-decoded-extensions>）：
  「There's no support for modifying the UI to create new panels, or making arbitrary HTTP requests, or touching the file system how you want.」
  ⚠️ 这句话**已经过时**：当前 `main` 的 WIT 里 `http-client.fetch` 是任意 URL 的（见下），该 import 不受 capability 门控。

### 1.2 扩展能拿到什么（WIT world，源码核实 2026-09-14）

`crates/extension_api/wit/since_v0.8.0/extension.wit`：

```wit
package zed:extension;

world extension {
    import context-server;
    import dap;
    import github;
    import http-client;
    import platform;
    import process;
    import nodejs;

    import get-settings: func(path: option<settings-location>, category: string, key: option<string>) -> result<string, string>;
    import download-file: func(url: string, file-path: string, file-type: downloaded-file-type) -> result<_, string>;
    import make-file-executable: func(filepath: string) -> result<_, string>;

    resource worktree {
        root-path: func() -> string;
        read-text-file: func(path: string) -> result<string, string>;
        which: func(binary-name: string) -> option<string>;
        shell-env: func() -> env-vars;      // ← 整个 shell 环境变量
    }
}
```

- `process.wit`：`run-command: func(command: command) -> result<output, string>`（真·子进程，逃出 WASM 沙箱）
- `http-client.wit`：`fetch: func(req: http-request) -> result<http-response, string>`，任意 method / URL / header / body

**门控与否（源码核实，`crates/extension_host/src/wasm_host/wit/since_v0_8_0.rs`）**：

| import | 是否过 capability 门 |
|---|---|
| `process.run-command` | ✅ `self.capability_granter.grant_exec(&command.command, &command.args)?` |
| `download-file` | ✅ `grant_download_file(&parsed_url)?` |
| `nodejs` npm install | ✅ `grant_npm_install_package(&package_name)?` |
| `http-client.fetch` | ❌ **无门控**（可对任意主机发任意请求） |
| `worktree.read-text-file` / `shell-env` / `which` | ❌ 无门控 |
| `get-settings` | 部分：宿主按 `category` 白名单，仅 `"language"` / `"lsp"` / `"context_servers"`，其余 `bail!("Unknown settings category: {}", category)` |

### 1.3 能不能拿到用户的模型 API key

- **Zed 自己的 provider key 存在系统 keychain**，官方文档：「Provider keys saved through Zed are stored in the system keychain, not in `settings.json`.」
  <https://zed.dev/docs/ai/privacy-and-security>（raw: `docs/src/ai/privacy-and-security.md`，fetched 2026-09-14）
  → 扩展没有读 keychain 的 import，`get-settings` 也没有 LLM 类别 → **不能从 Zed 正常通道拿到 key**。
- **但两条侧路（源码核实，非官方声明）**：
  1. `worktree.shell-env()` 原样返回 shell 环境变量。用户若把 `ANTHROPIC_API_KEY` 等写在 shell profile 里，任何扩展无需声明任何能力即可读到，再用未门控的 `http-client.fetch` 外传。
  2. `get-settings(category = "context_servers")` 返回该 MCP server 的 `command.env`（源码里明确把 `env` 序列化出去）——用户给 MCP server 配的 token 因此对扩展可见。
- 反向：`extension.toml` 现在有 `language_model_providers`（源码核实，`crates/extension/src/extension_manifest.rs`：`pub language_model_providers: BTreeMap<Arc<str>, LanguageModelProviderManifestEntry>`，字段 `name` / `icon`），即扩展可以**提供**模型 provider。该字段在 zed.dev 文档中**未见记载** → 行为细节（key 由谁持有）**未核实 (unverified)**。

### 1.4 清单字段（raw）

必填：`id`、`name`、`version`、`schema_version`、`authors`、`description`、`repository`（<https://zed.dev/docs/extensions/developing-extensions>）。

能力声明（官方文档 <https://zed.dev/docs/extensions/capabilities>，fetched 2026-09-14）：

```toml
[[capabilities]]
kind = "process:exec"
command = "gem"
args = ["**"]

[[capabilities]]
kind = "download_file"
host = "github.com"
path = ["zed-industries", "zed", "**"]

[[capabilities]]
kind = "npm:install"
package = "typescript"
```

serde 定义（源码核实，`crates/extension/src/capabilities.rs`）：

```rust
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ExtensionCapability {
    #[serde(rename = "process:exec")] ProcessExec(ProcessExecCapability),   // { command, args }
    DownloadFile(DownloadFileCapability),                                   // { host, path }
    #[serde(rename = "npm:install")] NpmInstallPackage(NpmInstallPackageCapability), // { package }
}
```

通配语义：`command`/`host`/`package` 可为 `"*"`；`args`/`path` 里 `"*"` = 一个任意段，末位 `"**"` = 任意剩余段（源码 `ProcessExecCapability::allows` / `DownloadFileCapability::allows`）。

### 1.5 谁执行 + 违规会怎样

**语言运行时（wasmtime 宿主边界）执行，不是评审期。** 而且是**两把锁**（源码核实 `crates/extension_host/src/capability_granter.rs`）：

```rust
pub fn grant_exec(&self, desired_command: &str, desired_args: &[...]) -> Result<()> {
    self.manifest.allow_exec(desired_command, desired_args)?;   // 锁 1：扩展清单声明过吗
    let is_allowed = self.granted_capabilities.iter().any(...); // 锁 2：用户授予过吗
    if !is_allowed {
        bail!("capability for process:exec {desired_command} {desired_args:?} is not granted by the extension host");
    }
    Ok(())
}
```

未声明时的错误串（源码 `extension_manifest.rs::allow_exec`）：
`"capability for process:exec {desired_command} {desired_args:?} was not listed in the extension manifest"`
→ 通过 WIT 的 `result<_, string>` 回给扩展，**调用失败，不是进程终止**。

官方文档对用户侧那把锁的描述：「Restricting or removing a capability will cause an error to be returned when an extension attempts to call the corresponding extension API without sufficient capabilities.」默认值等价于全开：

```json
{ "granted_extension_capabilities": [
    { "kind": "process:exec", "command": "*", "args": ["**"] },
    { "kind": "download_file", "host": "*", "path": ["**"] },
    { "kind": "npm:install", "package": "*" } ] }
```

全局关断开关存在：`"granted_extension_capabilities": []`，文档自己承认「this will likely make many extensions non-functional」。
<https://zed.dev/docs/extensions/capabilities>

### 1.6 安装摩擦

- Gallery 里一键装：`cmd-shift-x` / 菜单 Zed > Extensions。**没有任何权限弹窗、没有警告文案**（`docs/src/extensions/installing-extensions.md` 全文 2026-09-14 读过，无此内容）。
- 装到 `~/Library/Application Support/Zed/extensions`（`installed/` 源码 + `work/` 扩展产物）。
- 可用 `auto_install_extensions` 设置批量装/卸。
- **卸载/禁用的具体 UI 步骤文档没写** → 未核实 (unverified)。
- 发布侧有人工评审：「every submission is reviewed, and not all of them make the cut」——<https://github.com/zed-industries/extensions>（fetched 2026-09-14）。
- 历史提案 #8552「Allow precise control over the capabilities granted to specific extensions」（逐扩展权限勾选 UI）被 **closed as not planned**；当前实现是全局 `granted_extension_capabilities`，不是逐扩展。<https://github.com/zed-industries/zed/issues/8552>（fetched 2026-09-14）

---

## 2. Raycast Extensions

### 2.1 跑在哪（官方安全页，fetched 2026-09-14 <https://developers.raycast.com/information/security>）

- 「Raycast launches a **single child Node.js process** where extensions get loaded and unloaded as needed.」每个扩展在自己的 v8 worker 线程里，独立 event loop / heap。
- 沙箱程度：「Extensions are **not further sandboxed** as far as policies for file I/O, networking, or other features of the Node runtime are concerned.」
  → 即：**任意网络、任意文件读写**（受 macOS TCC 限制，访问 Documents / 屏幕录制等敏感目录仍要系统授权）。

### 2.2 模型 key：可以不持有

- AI API：「The AI API provides developers with seamless access to AI functionality without requiring API keys, configuration, or extra dependencies.」签名 `async function ask(prompt: string, options?: AskOptions): Promise<string> & EventEmitter`；需要 Raycast Pro，可用 `environment.canAccess(AI)` 探测；限速 10 req/min、100 req/hour。
  <https://developers.raycast.com/api-reference/ai>（fetched 2026-09-14）
- 这是本 lane 里**唯一**「宿主代打模型、插件不碰 key」的成熟先例。
- 扩展仍可以自己存 key（见下 `type: "password"`），产品没有禁止。

### 2.3 清单字段（raw）

顶层：`name`、`title`、`description`、`icon`、`author`、`platforms`、`categories`、`commands`、`tools`、`ai`、`owner`、`access`、`contributors`、`pastContributors`、`keywords`、`preferences`、`external`、`license`。
**没有 `permissions` 字段。** 唯一接近的是 `platforms`（`"macOS"` / `"Windows"`）和 `access`（`"public"` / `"private"`）。
<https://developers.raycast.com/information/manifest>（fetched 2026-09-14）

```json
{
  "platforms": ["macOS", "Windows"],
  "preferences": [
    { "name": "apiKey", "title": "API Key", "description": "Your secure API key",
      "type": "password", "required": true }
  ]
}
```

`preferences[].type` 取值：`"textfield"` / `"password"` / `"checkbox"` / `"dropdown"` / `"appPicker"` / `"file"` / `"directory"`。命令 `arguments[].type` 另有 `"password"`（<https://developers.raycast.com/information/lifecycle/arguments>，fetched 2026-09-14）。

**存在哪里：不是 keychain。** 安全页原文：「password preferences can be used to ask users for values such as access tokens, and the local storage APIs provide methods for reading and writing data payloads. In both cases, the data is stored in the local encrypted database」。
反向佐证：上架规则「Extensions requesting Keychain Access will be rejected due to security concerns」（<https://developers.raycast.com/basics/prepare-an-extension-for-store>，fetched 2026-09-14）。

### 2.4 谁执行

**评审期 + CI，运行时不执行。**
- CI：「the Continuous Integration system performs a set of validations to make sure that manifest conforms to the defined schema, required assets have the correct format, the author is valid, and no build and type errors are present」（security 页）。
- 人工：Raycast 成员 + 社区共审；二进制依赖有硬规矩：「Don't bundle opaque binaries where sources are unavailable or where it's unclear how they have been built」、「If you do end up downloading executable binaries in the background, please make sure it's done from a server that you don't have access to」；禁第三方分析「It's not allowed to include external analytics in extensions」。
- **未声明能力时会怎样：不适用**——运行时没有能力表，扩展本来就有完整 Node 能力。

### 2.5 一个可抄的运行时闸：AI 工具确认

AI Extension 的 tool 可导出 `Tool.Confirmation<T>`，在工具真正执行前弹确认，带 `message` / `info`（副作用逐条说明）/ `style`（Regular / Destructive）/ `image`；返回 `undefined` 可跳过 → **开发者 opt-in，不是强制**。
<https://developers.raycast.com/api-reference/tool>（fetched 2026-09-14）

### 2.6 安装摩擦

Store 一键安装，无权限弹窗（官方无任何安装警告文案记录 → 具体 UI 文案**未核实**）。信任完全前移到评审。

---

## 3. Obsidian

来源：<https://obsidian.md/help/plugin-security>（原 `help.obsidian.md/plugin-security` 301 到此）与 <https://obsidian.md/help/community-plugins>；raw 原文取自 `obsidianmd/obsidian-help` master 分支，均 fetched 2026-09-14。

### 3.1 跑在哪 + 官方「不沙箱」声明（逐字）

> 「Due to technical limitations, Obsidian cannot reliably restrict plugins to specific permissions or access levels. This means that plugins will inherit Obsidian's access levels. As a result, consider the following examples of what community plugins can do:
> - Community plugins can access files on your computer.
> - Community plugins can connect to internet.
> - Community plugins can install additional programs.」

即：与应用同进程、同权限，无能力概念。另有一条给敏感数据用户的建议：「we recommend that you perform an independent security audit on the plugin before using it」。

### 3.2 Restricted Mode（全局开关）

> 「By default, Obsidian runs in Restricted Mode to prevent third-party code execution. Only disable Restricted mode if you trust the authors of the plugins that you install.」

关掉：Settings → Community plugins → **Turn on community plugins**。
打开：Settings → Community plugins → Restricted mode 旁 **Turn on**。
「Installed plugins remain in your vault even if you turn on Restricted mode, but are ignored by Obsidian.」

社区插件页顶部官方警告（逐字，`Community plugins.md` 的 callout）：

> 「**Warning** — Community plugins run third-party code on your behalf that could potentially do harm. To learn more about what the Obsidian team does to prevent harmful plugins, refer to Plugin security.」

**App 内点「Turn on community plugins」时弹出的那段确认对话框逐字文案：未核实 (unverified)** —— 官方帮助文档不载该字符串，Obsidian 为闭源不可从源码取；今天只能确认上面两段官方文案。

### 3.3 清单字段

`manifest.json` 的字段（`id` / `name` / `version` / `minAppVersion` / `description` / `author` / `authorUrl` / `isDesktopOnly` 等）在开发者文档 docs.obsidian.md，本轮**未逐字抓取核实**。可确定的是**没有权限/能力字段**——这是 3.1 那段官方声明的直接推论。字段清单本身标 **未核实 (unverified)**。

### 3.4 谁执行 + 安装摩擦

- 执行层：**无**（运行时不拦）。替代物是发布侧：「Obsidian automatically scans every plugin version for security vulnerabilities, code quality issues, and malware」，结果以 **safety scorecard** 展示在插件目录页；「Manual reviews continue for popular, featured, and flagged plugins」。所有插件须守 Obsidian Developer Policies。
- 安装步骤（≥5 步，摩擦明显高于 Zed/Raycast）：关 Restricted Mode → Browse → 选插件 → **Install** → 再 **Enable**（安装 ≠ 启用，两段式）。
- 卸载：Settings → Community plugins → Installed plugins → 垃圾桶图标 → 确认 **Uninstall**。禁用：每个插件一个 Toggle。
- **安全设计点**：「For security purposes, community plugins don't update automatically.」更新必须手动 Check for updates → Update / Update all。

---

## 4. Electron 官方立场（我们自己的地基）

- **沙箱默认值**：「Starting from Electron 20, the sandbox is enabled for renderer processes without any further configuration.」沙箱进程「can only freely use CPU cycles and memory」，其余必须「delegate tasks to more privileged processes」（IPC）。preload 脚本仍可用一小撮模块（`electron`、`events`、`timers`、`url`）与 polyfill 过的 `Buffer` / `process`。
  <https://www.electronjs.org/docs/latest/tutorial/sandbox>（fetched 2026-09-14）
- **对不受信任内容的官方态度**：「Electron is not a web browser. It allows you to build feature-rich desktop applications with familiar web technologies, but your code wields much greater power.」以及「displaying arbitrary content from untrusted sources poses a severe security risk that Electron is not intended to handle」、「Under no circumstances should you load and execute remote code with Node.js integration enabled.」
  <https://www.electronjs.org/docs/latest/tutorial/security>（fetched 2026-09-14）
- **utilityProcess**：「Each Electron app can spawn multiple child processes from the main process using the UtilityProcess API」，明确适合「untrusted services, CPU intensive tasks or crash prone components」；跑在 Node 环境（有 `require` 和全部 Node API），与渲染进程用 MessagePort 通信。注意：它**本身不是沙箱**，只是进程隔离 + 崩溃隔离。
  <https://www.electronjs.org/docs/latest/tutorial/process-model>（fetched 2026-09-14）
- 「主进程无沙箱、拥有完整 OS 权限」这句话的**逐字官方表述本轮未找到** → 未核实 (unverified)；能核实的是上面 sandbox 页对渲染层默认沙箱的表述，以及 process-model 页说主进程跑在有 `require` 的 Node 环境里。

---

## 5. 对 Nomi 的四条可直接抄的结论

1. **唯一真正机械执行的设计是 Zed 的两把锁**：能力既要在 `extension.toml` 里声明，又要在用户 `granted_extension_capabilities` 里授予，两者都在 wasmtime 宿主边界的 Rust 代码里校验，失败返回 `result<_, string>` 错误而不是崩溃。这是「声明式 + 机械执行」最接近我们形状的现役实现。
2. **Zed 的教训同样重要：门要装在全部入口上。** 它给 `process:exec` / `download_file` / `npm:install` 装了门，却漏了 `http-client.fetch` 和 `worktree.shell-env()`——于是「读环境变量里的 key + 任意外发」这条链无需任何声明即可走通（源码核实）。对我们＝R21.3「数门」的活教材：能力清单必须覆盖每一个宿主 import，漏一个等于没有。
3. **模型 key 不该交给插件：Raycast `AI.ask()` 是成熟先例**——宿主代打模型、按 Pro 资格与速率限流（10/min、100/h），插件不持有任何 key。我们的「Agent 调用模型」应当照此：插件只能通过宿主调用，不发 key。
4. **Obsidian 证明「不装门」的代价是把成本推给用户**：全局 Restricted Mode + 两段式安装 + 禁止自动更新 + 安全评分卡，全是补偿性摩擦。对一个握着用户 API key 和钱包的应用，这条路不可选。Electron 官方也明说自己不是用来跑不受信任代码的——所以我们要么走 WASM/子进程隔离，要么把插件能力限到「声明过的宿主 API」这一条窄路。
