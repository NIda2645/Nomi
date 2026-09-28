// Isolated component regression: real menu, confirmation and store; no user project.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { NomiPreviewHost } from '../../../src/design/previewHost'
import { ConfirmDialogHost } from '../../../src/design'
import DocumentListSidebar from '../../../src/workbench/creation/DocumentListSidebar'
import { useWorkbenchStore } from '../../../src/workbench/workbenchStore'
import '@mantine/core/styles.css'
const store = useWorkbenchStore.getState()
store.hydrateWorkbenchDocuments(['a', 'b'].map(id => ({ id, version: 1, title: id, updatedAt: 1, contentJson: { type: 'doc', content: [] } })), 'a')
store.addStoryboardDesign('a', { title: 'Plan A', anchors: [], shots: [] })
createRoot(document.getElementById('root')!).render(<NomiPreviewHost><DocumentListSidebar /><ConfirmDialogHost /></NomiPreviewHost>)
