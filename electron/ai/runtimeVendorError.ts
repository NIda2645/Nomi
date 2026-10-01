import type { RuntimeErrorFacts } from '../shared/agentCapabilities/transportContracts';
import { VendorRequestError, categorizeVendorFailure, encodeVendorErrorMessage } from '../vendor/vendorHttp';
import { upstreamCodeFromBody, upstreamMessageFromBody } from './aiSdkVendorError';

/** Map recorded pi transport facts directly; never impersonate an AI4 error. */
export function describeRuntimeError(error: RuntimeErrorFacts, vendorKey: string): string {
  if (error.kind !== 'http' && error.kind !== 'timeout' && error.kind !== 'network') return error.message;
  const upstreamMsg = (error.body ? upstreamMessageFromBody(error.body) : '') || error.message;
  // 上游自己给的错误码与它说的话一起带过 IPC（和图 / 视频侧、AI SDK 文本侧同一个 pickUpstreamCode）：状态码只说「请求有问题」。
  const upstreamCode = error.body ? upstreamCodeFromBody(error.body) : '';
  const statusLabel = error.status === undefined ? '请求失败' : `HTTP ${error.status}`;
  return encodeVendorErrorMessage(new VendorRequestError(`（${statusLabel}）${upstreamMsg}`, {
    vendorKey, method: 'POST', url: error.url ?? '',
    ...(error.status !== undefined ? { httpStatus: error.status } : {}),
    upstreamMsg: upstreamMsg.slice(0, 256), ...(upstreamCode ? { upstreamCode } : {}), ...categorizeVendorFailure(error.status),
  }));
}
