import { isComfyuiVendorKey } from '../../workbench/generationCanvas/model/comfyuiVendor'
import { ANTIGRAVITY_VENDOR_KEY } from '../../../electron/shared/antigravity'
import type { ChipModel } from './ModelChipGroups'

type RequestScriptModel = Pick<ChipModel, 'vendorKey'>

export function canConfigureModelRequestScript(
  model: RequestScriptModel | null | undefined,
): boolean {
  return Boolean(model && !isComfyuiVendorKey(model.vendorKey) && model.vendorKey !== ANTIGRAVITY_VENDOR_KEY)
}
