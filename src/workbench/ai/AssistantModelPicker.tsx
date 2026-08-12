// 助手模型选择器：让用户指定创作/画布 agent 用哪个 text 模型（根治「盲选第一个=撞到不响应的就全卡」）。
// 写偏好到 localStorage（assistantModelPref），runWorkbenchAgent 自动带进 payload，两个面板都生效。
import React from 'react'
import { useTranslation } from 'react-i18next'
import { listWorkbenchModelCatalogModels, listWorkbenchModelCatalogVendors, type ModelCatalogModelDto } from '../api/modelCatalogApi'
import { decodeModelIdentity, encodeModelIdentity, labelForModel } from './assistantModelIdentity'
import { getAssistantModelPref, setAssistantModelPref } from './assistantModelPref'
import { NomiSelect, NomiSkeleton } from '../../design'

// 与后端 chooseTextModel 一致的"像通用对话模型"判定：vision/preview 等不可靠发 tool_use 的降权，
// 选默认时排到最后。让默认就是一个具体的、能用的模型（而不是看不懂的「自动选模型」）。
const DEPRIORITIZE = /vision|preview|audio|tts|whisper|embed|rerank|ocr|search|thinking/i
function pickDefaultModel(models: ModelCatalogModelDto[]): ModelCatalogModelDto | undefined {
  return [...models].sort(
    (a, b) =>
      (DEPRIORITIZE.test(`${a.modelKey} ${a.labelZh}`) ? 1 : 0) -
      (DEPRIORITIZE.test(`${b.modelKey} ${b.labelZh}`) ? 1 : 0),
  )[0]
}

export default function AssistantModelPicker({ className }: { className?: string } = {}): JSX.Element | null {
  const { t } = useTranslation()
  const [models, setModels] = React.useState<ModelCatalogModelDto[]>([])
  const [vendorNames, setVendorNames] = React.useState<Record<string, string>>({})
  const [loaded, setLoaded] = React.useState(false)
  // 选中值是**两段身份**（vendorKey + modelKey）——只用 modelKey 会在同名模型上张冠李戴，见 assistantModelIdentity。
  const [selected, setSelected] = React.useState<string>(() => {
    const pref = getAssistantModelPref()
    return pref ? encodeModelIdentity(pref) : ''
  })

  React.useEffect(() => {
    let alive = true
    void listWorkbenchModelCatalogVendors()
      .then((rows) => {
        if (alive) setVendorNames(Object.fromEntries(rows.map((v) => [v.key, v.name])))
      })
      .catch(() => {})
    listWorkbenchModelCatalogModels({ kind: 'text', enabled: true })
      .then((rows) => {
        if (!alive) return
        setModels(rows)
        setLoaded(true)
        // 无偏好时不再显示「自动选模型」：直接落一个具体默认模型（智能挑、能用），并显示其名。
        if (!getAssistantModelPref()?.modelKey && rows.length > 0) {
          const def = pickDefaultModel(rows)
          if (def) {
            setAssistantModelPref({ vendorKey: def.vendorKey, modelKey: def.modelKey })
            setSelected(encodeModelIdentity(def))
          }
        }
      })
      .catch(() => {
        if (alive) {
          setModels([])
          setLoaded(true)
        }
      })
    const sync = () => {
      const pref = getAssistantModelPref()
      setSelected(pref ? encodeModelIdentity(pref) : '')
    }
    window.addEventListener('nomi:assistant-model-changed', sync)
    return () => {
      alive = false
      window.removeEventListener('nomi:assistant-model-changed', sync)
    }
  }, [])

  // pending 规范 #3:加载中给占位骨架,不再凭空消失(return null 让选择器闪现)。
  if (!loaded) {
    return <NomiSkeleton className={`h-7 w-[120px] ${className ?? ''}`} />
  }
  // 加载完确实没有可选 text 模型 → 不渲染(无意义)。
  if (models.length === 0) return null

  const handleChange = (next: string) => {
    setSelected(next)
    // 按两段身份回解：同名模型下再也不会绑到另一个供应商去。
    const identity = decodeModelIdentity(next)
    if (identity) setAssistantModelPref(identity)
  }

  return (
    <NomiSelect
      ariaLabel={t('creationAi.assistantMessage.modelAria')}
      title={t('creationAi.assistantMessage.modelHint')}
      size="xs"
      className={className}
      triggerMaxWidth={160}
      value={selected}
      options={models.map((m) => ({ value: encodeModelIdentity(m), label: labelForModel(m, models, vendorNames) }))}
      onChange={handleChange}
    />
  )
}
