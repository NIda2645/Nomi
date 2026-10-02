import { isolatedInstanceMarker } from "./capabilityCore/mcpConfig";

/**
 * `nomi://` 只归正式安装：谁最后启动谁拿走协议，开发版和走查 / 评测的隔离实例一旦登记，
 * 用户点链接就会拉起一个跑完即删的临时实例。判据：已打包，且不是隔离实例
 * （隔离判据只有 mcpConfig.isolatedInstanceMarker 一份，和「隔离实例不许写客户端配置」同一扇门）。
 */
export function registerNomiProtocolClient(
  app: { isPackaged: boolean; setAsDefaultProtocolClient: (scheme: string) => boolean },
  isolationMarker: () => string | null = isolatedInstanceMarker,
): boolean {
  if (!app.isPackaged || isolationMarker()) return false;
  try {
    return app.setAsDefaultProtocolClient("nomi");
  } catch {
    return false; // 部分平台不允许登记；尽力而为
  }
}
