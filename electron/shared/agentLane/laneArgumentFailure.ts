// 「契约拒收了这次参数」那一条失败的**唯一写法**。纯函数、零运行时依赖（zod 只取类型）。
import type { ZodError, ZodIssue } from 'zod';
import type { LaneToolFailureShape } from './laneToolContract';

/**
 * 契约 parse 的失败 → 模型看到的失败正文（§3.3 的形状）。
 *
 * 2026-09-22：**住在共享层**，给 `laneTools.mts`（NodeNext 岛）与 `laneExtendedDesktopPorts.ts`（CommonJS 宿主）两边用——
 * 它是纯函数；从岛里导出给 CJS 那半 import 会把 `.mts` 拖进 CommonJS 工程（`agent-runtime-wiring` 那条断言守的就是这个）。那边的 `spec.schema.parse(...)` 原来直接抛裸
 * `ZodError`，而 `ZodError.message` 就是 `JSON.stringify(issues, null, 2)`——模型收到的是一整段
 * JSON 数组（2026-09-21 实测 5 次、09-22 复跑 3 次，`resultText` 以 `[` 开头的那几条就是它）。
 * 同一条 lane 上两个校验点、两种说法，正是 handoff §7.5 记下的「schema 沿内部路被校验了 3-4 次」。
 * 说法只留这一份。
 *
 * 只带**类型名与字段名**，绝不回传收到的值：用户文稿正文、素材路径都可能在参数里。
 * `allowed` 从枚举类 issue 的 `options` 取，那是模型自纠时最有用的一样东西。
 */
export function argumentFailure(toolName: string, args: unknown, error: ZodError): LaneToolFailureShape {
  const issues = error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    expected: expectedOf(issue),
    receivedType: receivedTypeOf(issue, args),
  }));
  const enumIssue = error.issues.find(
    (issue): issue is Extract<ZodIssue, { options: unknown[] }> =>
      issue.code === 'invalid_enum_value' || issue.code === 'invalid_union_discriminator',
  );
  return {
    code: 'tool_arguments_invalid',
    message: `${toolName} was called with arguments its contract rejects.`,
    issues,
    ...(enumIssue ? { allowed: enumIssue.options.map(String) } : {}),
    nextAction: 'Fix the listed fields and call again with the same operation. Fields that belong to another operation must be left out.',
  };
}

function expectedOf(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.expected;
    case 'invalid_enum_value':
    case 'invalid_union_discriminator':
      return `one of ${issue.options.map(String).join(', ')}`;
    case 'unrecognized_keys':
      return `no field named ${issue.keys.join(', ')} for this operation`;
    default:
      // 剩下的是我们自己写的约束文案（"connect_canvas_edges needs at least one edge"）
      // 或 zod 的界文案（"Array must contain at least 1 element(s)"）——都不含收到的值。
      return issue.message;
  }
}

function receivedTypeOf(issue: ZodIssue, args: unknown): string {
  if (issue.code === 'invalid_type') return issue.received;
  let current: unknown = args;
  for (const key of issue.path) {
    if (!current || typeof current !== 'object') return 'undefined';
    current = (current as Record<string | number, unknown>)[key as string | number];
  }
  return Array.isArray(current) ? 'array' : current === null ? 'null' : typeof current;
}
