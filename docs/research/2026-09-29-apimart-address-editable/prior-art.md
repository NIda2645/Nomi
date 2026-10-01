# 先查别人：内置平台的接口地址，谁来改

问题：Nomi 内置的 APIMart 主域在部分网络下连不上，用户需要把接入地址改成官方国内线路。0.22.4 起新装机在设置页改地址会被一条认证锁拒绝。这个地址该不该归用户改、判据该放哪。

## 生态里怎么做（2026-09-29 用 gh 实读源码）

- Cherry Studio：内置供应商也有可编辑的接口地址输入框，预设地址只是默认值，还带「重置」。
  `src/renderer/pages/settings/ProviderSettings/ConnectionSettings/ApiHost.tsx:33` 取预设默认地址，`:54-61` 用户改了就写回并触发提交。
  https://github.com/CherryHQ/cherry-studio/blob/main/src/renderer/pages/settings/ProviderSettings/ConnectionSettings/ApiHost.tsx
- LobeChat（lobehub）：每家内置供应商的设置里声明 `proxyUrl` 槽，用户可填自己的接口地址，占位符是官方默认。
  `packages/model-bank/src/modelProviders/xai.ts:15-17`。
  https://github.com/lobehub/lobehub/blob/main/packages/model-bank/src/modelProviders/xai.ts
- 结论：两家都不锁内置平台的地址，默认值来自预设、用户随时能改、能恢复默认。没有一家因为「这家被认证过」就禁止改地址。

## 依赖里怎么做

- Vercel AI SDK 的 OpenAI 兼容 provider 都接受调用方传入 `baseURL`，地址是调用方的配置而不是 provider 的常量：
  https://ai-sdk.dev/providers/ai-sdk-providers/openai （createOpenAI 的 baseURL 设置）；
  本仓库安装版类型定义 `node_modules/@ai-sdk/openai/dist/index.d.ts:267`。

## 仓库里怎么做

- 08-28 引入认证锁：提交 `529188045` 的 `electron/catalog/rendererCatalogMutation.ts:23-25`，把「这家名下任何一行带 adapter 标记」当成「整条连接归认证管」，`:29-34` 对这类连接改动一律拒绝。锁的本意是保护认证契约（鉴权放法、连接种类），地址被顺带锁了。
- 现在判据的唯一主人：`electron/catalog/certificationOwnership.ts:31-41`（`isCertificationOwnedConnection`），内置家只认内置目录里的模型带标记才归认证管，用户自己加、自己自检的模型只管它自己。
- 调用它的设置页入口：`electron/catalog/rendererCatalogMutation.ts:27`。

## 结论

- 用已有：恢复旧行为，地址归用户在设置里改，与 Cherry Studio、LobeChat 一致；鉴权放法、连接种类仍受认证保护。
- 不另造规则、不加新 IPC、不加新弹窗；「归不归认证管」收成 `certificationOwnership.ts` 一份判据，其余四处改为引用它。
