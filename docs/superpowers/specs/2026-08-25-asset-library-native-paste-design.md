# 素材库原生图片拖入与粘贴设计

日期：2026-08-25

## 目标

让用户可以把 Finder/桌面里的图片文件直接拖入素材库，或复制文件后在素材库按 `Cmd/Ctrl+V` 导入。两条入口必须落到同一条本地复制链路：源文件不被删除，目标文件按原始字节复制，不经过图片解码、缩放或压缩。

## 用户体验

1. 用户打开素材库并点击面板空白处、素材卡或素材库工具区域。
2. 用户从 Finder/桌面拖入一张或多张文件，或者在 Finder 复制文件后回到素材库按 `Cmd/Ctrl+V`。
3. 素材库显示拖拽接收态；松手或粘贴后只导入图片文件，非图片计入跳过数。
4. 导入完成后写入层广播已有的 `nomi:assets:updated` 事件，素材库刷新并通过 toast 告知成功、跳过和失败数量。
5. 搜索框等 `input`、`textarea`、`contenteditable` 获得焦点时，粘贴事件继续执行文本粘贴，不启动素材导入。

现有“上传”按钮保留；现有画布、时间轴和素材库内部素材卡拖拽语义不改变。

## 架构

### Renderer

- `AssetLibraryPanel` 在根容器处理外部 `Files` 拖入，并只在文件拖入时 `preventDefault`。
- 同一根容器处理 `paste`：先判断事件目标是否为文本编辑控件，再通过 preload 调用主进程读取系统剪贴板中的文件路径。
- Renderer 只负责筛选图片、展示拖拽状态、调用导入 API 和刷新/提示；不读取源文件字节。

### Preload / Main

- preload 暴露 `clipboard.readFilePaths()` 和 `assets.copyFiles()` 两个最小桥接能力。
- 主进程使用 Electron `clipboard.availableFormats()` / `clipboard.readBuffer()` 读取 macOS `public.file-url`、Linux `text/uri-list`、Windows `FileNameW`/`FileName` 文件路径格式，并解析为绝对路径。
- `copyFiles` 在主进程校验项目存在、源路径是普通文件、内容类型是图片后，调用素材写入层的复制实现。

### Storage

- 在 `electron/assets/projectAssetStore.ts` 增加 `copyAssetFile`，复用 `uniqueAssetPath`、sidecar 元数据和 `broadcastAssetsUpdated`。
- 复制使用 `fs.copyFileSync`，不使用 `moveAssetFile`，保证 Finder 源文件保留。
- 文件归入 `assets/imported/<YYYY-MM-DD>/`；同名文件继续使用已有 `-2`、`-3` 唯一命名规则。
- 每个成功结果返回现有 `DesktopAssetDto` 形状，前端只依赖数量和刷新信号。

## 边界与错误

- 只接受 `image/*` 和图片扩展名；空 MIME 时按扩展名兜底。
- 路径不存在、目录、无权限、项目不存在或复制失败时，单个文件失败不阻塞其他文件。
- 复制采用临时目标文件再 rename 的方式，避免中断时留下半成品；失败结果不广播刷新。
- 剪贴板没有文件路径时粘贴事件无副作用；拖入无文件时不接管浏览器默认行为。
- 不读取或上传网络 URL，不把 Finder 路径写入渲染层持久化数据。

## 验收与测试

- 纯函数测试：文件路径解析、图片筛选、文本编辑目标判定、导入结果计数。
- 主进程测试：单文件复制、多文件部分失败、同名唯一化、源/目标字节哈希一致、非图片拒绝。
- Renderer 测试：拖入调用统一导入回调；粘贴在输入框内不导入，面板粘贴调用 clipboard bridge。
- 真实验证：创建 PNG fixture，拖入和粘贴各执行一次，使用 `shasum -a 256` 对比源文件与项目 `assets/imported` 文件；再运行素材库刷新并预览。
