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

/**
 * 页面脚本。home 为真时才带上首页独有的两段：功能段片段播放、「点一下打开弹窗」的触发器
 * （快速上手没有这两样东西，带上就是死代码——评审指出）。
 */
export function homepageClientJs(downloadUrls, { segments: home = true } = {}) {
  const homeOnly = home ? `  // 首屏片子是原生播放器（不用脚本也能播）；脚本在时再亮出样张里那颗「播放宣传片（有声音）」，开播后自己消失。
  const film = document.querySelector('video[data-film]')
  const filmPlay = document.querySelector('[data-film-play]')
  if (film && filmPlay) {
    filmPlay.hidden = false
    filmPlay.addEventListener('click', () => { film.play().catch(() => {}) })
    film.addEventListener('play', () => filmPlay.remove(), { once: true })
  }

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
` : ''
  return `(() => {
  const downloadUrls = ${JSON.stringify(downloadUrls)}
  const selectDownload = ${selectDownload.toString()}
  const resolveDownloadRequest = ${resolveDownloadRequest.toString()}
  const localeKey = 'nomi_locale'
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

  // 库页面的「复制」：复制按钮指向的那块提示词原文；剪贴板被拒时退回「选中它」，让人自己按复制。
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy)
    if (!source) return
    try {
      await navigator.clipboard.writeText(source.innerText.trim())
      button.dataset.copied = 'true'
      setTimeout(() => { delete button.dataset.copied }, 1600)
    } catch {
      const range = document.createRange()
      range.selectNodeContents(source)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }))

${homeOnly}  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close())
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close() })
    dialog.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('modal-open')
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
})()`
}
