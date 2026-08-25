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

export function homepageClientJs(downloadUrls, interactionData) {
  const interactions = JSON.stringify(interactionData).replaceAll('<', '\\u003c')
  return `(() => {
  const downloadUrls = ${JSON.stringify(downloadUrls)}
  const interactionData = ${interactions}
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

  const activateCost = (tab) => {
    const data = interactionData.cost.find((item) => item.id === tab.dataset.cost)
    if (!data) return
    document.querySelectorAll('[data-cost]').forEach((item) => {
      const selected = item === tab
      item.setAttribute('aria-selected', String(selected))
      item.setAttribute('tabindex', selected ? '0' : '-1')
    })
    document.querySelector('#cost-panel')?.setAttribute('aria-labelledby', tab.id)
    document.querySelector('#cost-index').textContent = data.index
    document.querySelector('#cost-title').textContent = data.title
    document.querySelector('#cost-copy').textContent = data.description
    document.querySelector('#cost-proof').textContent = data.proof
    const image = document.querySelector('#cost-image')
    image.src = data.image
    image.alt = data.imageAlt
  }

  const activateWorkflow = (tab) => {
    const data = interactionData.workflow.find((item) => item.id === tab.dataset.step)
    if (!data) return
    document.querySelectorAll('[data-step]').forEach((item) => {
      const selected = item === tab
      item.setAttribute('aria-selected', String(selected))
      item.setAttribute('tabindex', selected ? '0' : '-1')
    })
    document.querySelector('#workflow-panel')?.setAttribute('aria-labelledby', tab.id)
    const image = document.querySelector('#workflow-image')
    image.src = data.image
    image.alt = data.imageAlt
    document.querySelector('#workflow-caption').textContent = data.caption
  }

  const bindTabs = (selector, activate) => {
    const tabs = Array.from(document.querySelectorAll(selector))
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab))
      tab.addEventListener('keydown', (event) => {
        const horizontal = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        const vertical = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
        let nextIndex = index + horizontal + vertical
        if (event.key === 'Home') nextIndex = 0
        else if (event.key === 'End') nextIndex = tabs.length - 1
        else if (!horizontal && !vertical) return
        event.preventDefault()
        const next = tabs[(nextIndex + tabs.length) % tabs.length]
        activate(next)
        next.focus()
      })
    })
  }
  bindTabs('[data-cost]', activateCost)
  bindTabs('[data-step]', activateWorkflow)

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
