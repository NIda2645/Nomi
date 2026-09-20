import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: { index: number }) => ({ 'generationCommon.shotConversion.shot': `镜头 ${values?.index}`, 'generationCommon.shotConversion.firstFrame': '首帧图', 'generationCommon.shotConversion.video': '视频' } as Record<string, string>)[key] ?? key }) }))
import { ShotPreviewOverlays } from './ConvertShotToVideoButton'

describe('shot label shared by full and lightweight nodes', () => {
  it('distinguishes first frame and video while retaining their common number', () => {
    expect(renderToStaticMarkup(React.createElement(ShotPreviewOverlays, { shotIndex: 2, shotRole: 'first_frame' }))).toContain('镜头 2 · 首帧图')
    expect(renderToStaticMarkup(React.createElement(ShotPreviewOverlays, { shotIndex: 2, shotRole: 'video' }))).toContain('镜头 2 · 视频')
  })
  it('keeps orphan first-frame identity visible without inventing a number', () => {
    const html = renderToStaticMarkup(React.createElement(ShotPreviewOverlays, { shotIndex: null, shotRole: 'first_frame' }))
    expect(html).toContain('首帧图')
    expect(html).not.toContain('镜头')
  })
})
