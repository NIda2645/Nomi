import React from 'react'
import type { ModelSettingsPage } from './modelSettingsNavigation'

type ModelSettingsFocusAction = 'none' | 'focus-back' | 'restore-trigger'

type FocusReturnLocator = {
  path: number[]
  tagName: string
  role: string
  ariaLabel: string
  text: string
  occurrence: number
}

const WORKSPACE_SELECTOR = '[data-settings-model-workspace]:not([hidden])'
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function activeModelSettingsHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-model-settings-dialog]')
    ?? document.querySelector<HTMLElement>(WORKSPACE_SELECTOR)
}

function normalizedText(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function focusSignature(element: HTMLElement): Omit<FocusReturnLocator, 'path' | 'occurrence'> {
  return {
    tagName: element.tagName,
    role: element.getAttribute('role') ?? '',
    ariaLabel: element.getAttribute('aria-label') ?? '',
    text: normalizedText(element),
  }
}

function sameFocusSignature(element: HTMLElement, locator: FocusReturnLocator): boolean {
  const signature = focusSignature(element)
  return signature.tagName === locator.tagName
    && signature.role === locator.role
    && signature.ariaLabel === locator.ariaLabel
    && signature.text === locator.text
}

function elementPath(root: HTMLElement, element: HTMLElement): number[] {
  const path: number[] = []
  let current: Element = element
  while (current !== root && current.parentElement) {
    path.unshift([...current.parentElement.children].indexOf(current))
    current = current.parentElement
  }
  return current === root ? path : []
}

export function createFocusReturnLocator(root: HTMLElement, target: EventTarget | null): FocusReturnLocator | null {
  const targetElement = target instanceof Element ? target.closest<HTMLElement>(FOCUSABLE_SELECTOR) : null
  if (!targetElement || !root.contains(targetElement)) return null
  const signature = focusSignature(targetElement)
  const matches = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((candidate) => {
    const candidateSignature = focusSignature(candidate)
    return candidateSignature.tagName === signature.tagName
      && candidateSignature.role === signature.role
      && candidateSignature.ariaLabel === signature.ariaLabel
      && candidateSignature.text === signature.text
  })
  return {
    ...signature,
    path: elementPath(root, targetElement),
    occurrence: Math.max(0, matches.indexOf(targetElement)),
  }
}

export function resolveFocusReturnLocator(root: HTMLElement, locator: FocusReturnLocator): HTMLElement | null {
  const signatureMatches = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((candidate) => sameFocusSignature(candidate, locator))
  const signatureMatch = signatureMatches[locator.occurrence]
  if (signatureMatch) return signatureMatch

  let candidate: Element = root
  for (const index of locator.path) {
    const next = candidate.children.item(index)
    if (!next) return null
    candidate = next
  }
  if (!(candidate instanceof HTMLElement) || !candidate.matches(FOCUSABLE_SELECTOR)) return null
  const fallbackSignature = focusSignature(candidate)
  if (fallbackSignature.tagName !== locator.tagName || fallbackSignature.role !== locator.role) return null
  if (locator.ariaLabel && fallbackSignature.ariaLabel !== locator.ariaLabel) return null
  return candidate
}

function modelSettingsPageFocusKey(page: ModelSettingsPage): string {
  if (page.type === 'connection') return `${page.type}:${page.vendorKey}`
  if (page.type === 'model' || page.type === 'capability' || page.type === 'script') {
    return `${page.type}:${page.vendorKey}:${page.modelKey}`
  }
  if (page.type === 'verification') return `${page.type}:${page.runId}`
  if (page.type === 'add') return `${page.type}:${page.preset ?? ''}:${page.existingVendorKey ?? ''}`
  return page.type
}

export function modelSettingsFocusAction(
  pageType: ModelSettingsPage['type'],
  hasRecordedTrigger: boolean,
): ModelSettingsFocusAction {
  if (hasRecordedTrigger) return 'restore-trigger'
  return pageType === 'home' ? 'none' : 'focus-back'
}

export function useModelSettingsPageFocus(page: ModelSettingsPage, onBack: () => void): void {
  const pageKey = modelSettingsPageFocusKey(page)
  const currentPageKeyRef = React.useRef(pageKey)
  const pendingTriggerRef = React.useRef<FocusReturnLocator | null>(null)
  const savedTriggersRef = React.useRef(new Map<string, FocusReturnLocator>())

  React.useEffect(() => {
    const handlePageBack = (): void => {
      const backButton = activeModelSettingsHost()?.querySelector<HTMLElement>('[data-model-settings-back]')
      if (backButton) backButton.click()
      else onBack()
    }
    window.addEventListener('nomi-model-settings-back', handlePageBack)
    return () => window.removeEventListener('nomi-model-settings-back', handlePageBack)
  }, [onBack])

  React.useEffect(() => {
    const rememberTrigger = (event: MouseEvent): void => {
      const host = activeModelSettingsHost()
      if (host) pendingTriggerRef.current = createFocusReturnLocator(host, event.target)
    }
    document.addEventListener('click', rememberTrigger, true)
    return () => document.removeEventListener('click', rememberTrigger, true)
  }, [])

  React.useEffect(() => {
    if (currentPageKeyRef.current !== pageKey) {
      if (pendingTriggerRef.current) {
        savedTriggersRef.current.set(currentPageKeyRef.current, pendingTriggerRef.current)
      }
      pendingTriggerRef.current = null
      currentPageKeyRef.current = pageKey
    }

    const savedTrigger = savedTriggersRef.current.get(pageKey)
    const action = modelSettingsFocusAction(page.type, Boolean(savedTrigger))
    if (action === 'none') return
    const frame = window.requestAnimationFrame(() => {
      const workspace = activeModelSettingsHost()
      if (!workspace) return
      if (action === 'restore-trigger' && savedTrigger) {
        const target = resolveFocusReturnLocator(workspace, savedTrigger)
        savedTriggersRef.current.delete(pageKey)
        if (target) {
          target.focus()
          return
        }
      }
      // 页面自己声明了首要输入目标就让给它。这个 rAF 跑在 React 的 autoFocus **之后**，
      // 于是「进来就能打字」的页面（所有 key-only 供应商的接入页都是这种：整页就一个 Key 输入框）
      // 会被无声地改成「还得先自己点一下输入框」——autoFocus 写了等于没写。
      // 焦点仍落在新页面内部，读屏进入新上下文的语义不受影响。
      const autofocusTarget = workspace.querySelector<HTMLElement>('[data-model-settings-autofocus]')
      if (autofocusTarget) {
        autofocusTarget.focus({ preventScroll: true })
        return
      }
      workspace.querySelector<HTMLElement>('[data-model-settings-back]')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [page.type, pageKey])
}
