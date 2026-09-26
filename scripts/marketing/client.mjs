import { resolveDownloadRequest, selectDownload } from './downloads.mjs'

export function localeBootstrapJs() {
  return `(() => {
  if (location.pathname !== '/') return
  const localeKey = 'nomi_locale'
  const preferred = (() => { try { return localStorage.getItem(localeKey) } catch { return null } })()
  const browserLanguages = navigator.languages || [navigator.language || '']
  const browserLocale = browserLanguages
    .map((value) => String(value).toLowerCase())
    .map((value) => value.startsWith('zh') ? 'zh-CN' : value.startsWith('en') ? 'en' : null)
    .find(Boolean)
  const resolvedLocale = preferred === 'en' || preferred === 'zh-CN' ? preferred : browserLocale
  if (resolvedLocale === 'en') location.replace('/en/' + location.search + location.hash)
})()`
}

export function homepageClientJs(downloadUrls) {
  return `(() => {
  const downloadUrls = ${JSON.stringify(downloadUrls)}
  const selectDownload = ${selectDownload.toString()}
  const resolveDownloadRequest = ${resolveDownloadRequest.toString()}
  const localeKey = 'nomi_locale'
  const pageLocale = document.documentElement.lang
  document.querySelectorAll('[data-locale-choice]').forEach((link) => {
    if (location.hash) {
      const destination = new URL(link.href, location.href)
      destination.hash = location.hash
      link.href = destination.pathname + destination.search + destination.hash
    }
    link.addEventListener('click', () => {
      try { localStorage.setItem(localeKey, link.dataset.localeChoice) } catch {}
    })
  })

  const menuToggle = document.querySelector('.menu-toggle')
  const navLinks = document.querySelector('#nav-links')
  const closeMenu = () => {
    navLinks?.classList.remove('open')
    menuToggle?.setAttribute('aria-expanded', 'false')
  }
  menuToggle?.addEventListener('click', () => {
    const open = navLinks?.classList.toggle('open') || false
    menuToggle.setAttribute('aria-expanded', String(open))
  })
  navLinks?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navLinks?.classList.contains('open')) {
      closeMenu()
      menuToggle?.focus()
    }
  })

  // 首屏整片：点了才加载、才出声（B 站那一版就是这个文件）。
  document.querySelectorAll('[data-film-play]').forEach((button) => button.addEventListener('click', () => {
    const frame = button.closest('[data-film]')
    if (!frame) return
    const video = document.createElement('video')
    video.className = 'film-video'
    video.src = frame.dataset.filmSrc
    video.controls = true
    video.playsInline = true
    frame.querySelector('.film-poster')?.remove()
    button.remove()
    frame.appendChild(video)
    video.play().catch(() => {})
  }))

  // 功能段：同一个片子文件，只在 [start, end] 这几秒里循环；滚到眼前才静音播放，减少动效偏好时不自动播。
  const segments = Array.from(document.querySelectorAll('video[data-segment]'))
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  segments.forEach((video) => {
    const start = Number(video.dataset.start)
    const end = Number(video.dataset.end)
    video.addEventListener('loadedmetadata', () => { video.currentTime = start })
    video.addEventListener('timeupdate', () => {
      if (video.currentTime >= end || video.currentTime < start - 0.5) video.currentTime = start
    })
    if (reduceMotion) { video.controls = true; video.preload = 'metadata' }
  })
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      const video = entry.target
      if (entry.isIntersecting) {
        if (video.preload === 'none') video.preload = 'auto'
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    }), { threshold: 0.35 })
    segments.forEach((video) => observer.observe(video))
  }
  document.querySelectorAll('[data-open-dialog]').forEach((trigger) => trigger.addEventListener('click', (event) => {
    const dialog = document.querySelector('#' + trigger.dataset.openDialog)
    if (!dialog || typeof dialog.showModal !== 'function') return
    event.preventDefault()
    dialog.showModal()
    document.body.classList.add('modal-open')
  }))
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close())
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close() })
    dialog.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('modal-open')
      dialog.querySelector('video')?.pause()
    })
  })

  const downloadDialog = document.querySelector('#download-dialog')
  const showDownloadOptions = () => {
    if (!downloadDialog || typeof downloadDialog.showModal !== 'function') return
    downloadDialog.showModal()
    document.body.classList.add('modal-open')
  }
  downloadDialog?.querySelectorAll('[data-direct-download]').forEach((link) => link.addEventListener('click', () => {
    downloadDialog.close()
  }))

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
    })
  }
  document.querySelectorAll('[data-download-nomi]').forEach((link) => link.addEventListener('click', async (event) => {
    event.preventDefault()
    const request = await resolvePlatformDownload()
    if (request.url) location.href = request.url
    else showDownloadOptions()
  }))
  void resolvePlatformDownload().then((request) => {
    applyPlatformDownload(request.url)
    if (!request.autoDownload) return
    const cleanUrl = new URL(location.href)
    for (const key of ['download', 'source', 'platform', 'arch']) cleanUrl.searchParams.delete(key)
    history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)
    if (request.url) location.href = request.url
    else showDownloadOptions()
  })
  document.documentElement.dataset.enhanced = 'true'
  document.documentElement.dataset.locale = pageLocale
})()`
}
