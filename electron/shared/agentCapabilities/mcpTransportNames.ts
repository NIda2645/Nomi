/**
 * 对外 `tools/list` 上**不从契约别名派生**的那几个工具名的唯一 owner。
 *
 * 为什么要这么一个文件：`nomi_read` 是收编 10 个读工具后的统一读入口（`mcpToolCatalog.ts` 的
 * READ_TOOL），它不挂在某一个能力契约上，所以 `contract.aliases.mcp` 里查不到它。而只投对外
 * profile 的动词（`verbs/onboardingVerbs.ts`）要在说明书里点名它——「setupId 从哪来、怎么等」
 * 这句话不说清，模型就只能猜。
 *
 * 名字写在这里、两边都从这里读，`mcpToolCatalog` 与动词装配期校验用的是同一个字面量；
 * 改名字只有一处可改（P1：不是第二份定义，是同一份的住址）。
 */
export const MCP_READ_TOOL_NAME = "nomi_read";
