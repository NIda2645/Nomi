import { resolveDownloadRequest, selectDownload } from './downloads.mjs'

export function homepageClientJs(downloadUrls) {
  return `(() => {
  const downloadUrls = ${JSON.stringify(downloadUrls)}
  const selectDownload = ${selectDownload.toString()}
  const resolveDownloadRequest = ${resolveDownloadRequest.toString()}
  const localeKey = 'nomi_locale'
  const pageLocale = document.documentElement.lang
  const preferred = (() => { try { return localStorage.getItem(localeKey) } catch { return null } })()
  const browserLanguages = navigator.languages || [navigator.language || '']
  const wantsEnglish = browserLanguages[0]?.toLowerCase().startsWith('en') && !browserLanguages.some((value) => value.toLowerCase().startsWith('zh'))
  if (location.pathname === '/' && !preferred && wantsEnglish) {
    location.replace('/en/' + location.search + location.hash)
    return
  }
  document.querySelectorAll('[data-locale-choice]').forEach((link) => link.addEventListener('click', () => {
    try { localStorage.setItem(localeKey, link.dataset.localeChoice) } catch {}
  }))
  const dialog = document.querySelector('#launch-film')
  const trigger = document.querySelector('[data-open-film]')
  const close = document.querySelector('[data-close-film]')
  if (dialog && trigger && typeof dialog.showModal === 'function') {
    trigger.addEventListener('click', (event) => { event.preventDefault(); dialog.showModal() })
    close?.addEventListener('click', () => dialog.close())
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close() })
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector('[data-hero-video]')?.pause()
  const resolvePlatformDownload = async () => {
    const platform = navigator.platform || ''
    const userAgent = navigator.userAgent || ''
    let architecture = ''
    if (navigator.userAgentData?.getHighEntropyValues) {
      try { architecture = (await navigator.userAgentData.getHighEntropyValues(['architecture'])).architecture || '' } catch {}
    }
    return resolveDownloadRequest({ search: location.search, platform, userAgent, architecture })
  }
  const applyPlatformDownload = (url) => {
    if (!url) return
    document.querySelectorAll('[data-download-nomi]').forEach((link) => {
      link.href = url
      link.removeAttribute('target')
      link.removeAttribute('rel')
    })
  }
  document.querySelectorAll('[data-download-nomi]').forEach((link) => link.addEventListener('click', async (event) => {
    event.preventDefault()
    const request = await resolvePlatformDownload()
    location.href = request.url || link.href
  }))
  void resolvePlatformDownload().then((request) => {
    applyPlatformDownload(request.url)
    if (!request.autoDownload) return
    const cleanUrl = new URL(location.href)
    for (const key of ['download', 'source', 'platform', 'arch']) cleanUrl.searchParams.delete(key)
    history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)
    if (request.url) location.href = request.url
  })
  document.documentElement.dataset.enhanced = 'true'
  document.documentElement.dataset.locale = pageLocale
})()`
}
