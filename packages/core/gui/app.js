import { api } from './api.js'
import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs/+esm'

document.addEventListener('DOMContentLoaded', async () => {
  const dom = {
    leftPanelList: document.querySelector('.left-panel-list'),
    baseList: document.querySelector('.base-icons-list'),
    gridContainer: document.querySelector('.grid-container'),
    mainContent: document.querySelector('.main-content'),
    btnGenerate: document.querySelector('.btn-generate'),
    btnFilter: document.querySelector('.btn-filter'),
    btnOptions: document.querySelector('.btn-options'),
    btnUpload: document.querySelector('.btn-upload'),
    fileInput: document.getElementById('icon-file-input'),
    btnScan: document.querySelector('.btn-scan'),
    btnMyIcons: document.querySelector('.btn-my-icons'),
    iconOutTemplate: document.getElementById('card-icon-out-item-template'),
    iconTemplate: document.getElementById('card-icon-item-template'),
    searchFieldTemplate: document.getElementById('search-field-template'),
    
    dialog: document.querySelector('.filter-dialog'),
    checkboxSelectAll: document.querySelector('.dialog-header-checkbox'),
    dialogTitle: document.querySelector('.dialog-title'),
    dialogPacksList: document.querySelector('.packs-list'),
    btnDialogCancel: document.querySelector('.btn-dialog-cancel'),
    btnDialogOk: document.querySelector('.btn-dialog-ok'),
    packTemplate: document.getElementById('card-icon-pack-template'),

    sidebar: document.querySelector('.projects-sidebar'),
    sidebarBody: document.querySelector('.projects-body'),
    btnSidebarClose: document.querySelector('.btn-projects-close'),

    scanDialog: document.querySelector('.scan-dialog'),
    scanPathInput: document.querySelector('.scan-path-input'),
    btnScanCancel: document.querySelector('.btn-scan-cancel'),
    btnScanSubmit: document.querySelector('.btn-scan-submit'),

    alertDialog: document.querySelector('.alert-dialog'),
    alertDialogText: document.querySelector('.alert-dialog-text'),
    alertDialogClose: document.querySelector('.alert-dialog-close'),

    btnSort: document.querySelector('.left-panel-sort'),
    btnClear: document.querySelector('.left-panel-clear'),
    toast: document.getElementById('toast')
  }
  
  const USER_ICON_PACK = 'ext'
  const LIMIT = 100
  let currentStart = 0
  let currentQuery = ''
  let hasMore = true
  let isLoading = false
  
  let loadedIcons = []
  let selectedIcons = new Map()
  const baseIcons = await api.getBaseIcons()
  
  let allPacks = [] 
  let selectedPacks = new Set()
  let searchTimeout

  const baseIconsNames = baseIcons.map(i => i.name)
  function checkIconIsBase (icon) {
    if (!icon) return false
    if (icon.prefix === baseIcons[0].prefix && baseIconsNames.includes(icon.name)) return true
  }
  
  function showAlert (message) {
    dom.alertDialogText.textContent = message
    dom.alertDialog.showModal()
  }

  dom.alertDialogClose.addEventListener('click', () => dom.alertDialog.close())

  dom.alertDialog.addEventListener('click', (e) => {
    if (e.target === dom.alertDialog) dom.alertDialog.close()
  })

  function createSearchField (container, placeholderText, onInputCallback) {
    if (!container || !dom.searchFieldTemplate) return null

    const clone = dom.searchFieldTemplate.content.cloneNode(true)
    container.appendChild(clone)

    const fieldEl = container.querySelector('.search-field')
    const inputEl = container.querySelector('.search-field-input')
    const clearEl = container.querySelector('.search-field-clear')

    inputEl.placeholder = placeholderText

    const updateState = () => {
      fieldEl.classList.toggle('is-empty', inputEl.value.trim() === '')
    }

    updateState()

    inputEl.addEventListener('input', (e) => {
      updateState()
      if (onInputCallback) onInputCallback(e.target.value)
    })

    clearEl.addEventListener('click', () => {
      inputEl.value = ''
      updateState()
      inputEl.focus()
      if (onInputCallback) onInputCallback('')
    })

    return {
      input: inputEl,
      clear: () => {
        inputEl.value = ''
        updateState()
      }
    }
  }

  createSearchField(
    document.querySelector('.main-search-container'),
    'Search icons...',
    (value) => {
      clearTimeout(searchTimeout)
      currentQuery = value.trim()
      
      searchTimeout = setTimeout(() => {
        currentStart = 0
        hasMore = true
        loadGridIcons(false)
      }, 300)
    }
  )
  
  const dialogSearchComponent = createSearchField(
    document.querySelector('.dialog-search-container'),
    'Search packs...',
    value => {
      renderDialogPacks(value.trim())
    }
  )

  if (dom.checkboxSelectAll && dom.checkboxSelectAll.tagName !== 'INPUT') {
    const mainInput = document.createElement('input')
    mainInput.type = 'checkbox'
    mainInput.className = 'dialog-header-checkbox-input'
    dom.checkboxSelectAll.appendChild(mainInput)
    dom.checkboxSelectAll = mainInput
  }

  new Sortable(dom.leftPanelList, {
    animation: 150,
    onEnd: () => {
      const newSelectedMap = new Map()
      const renderedItems = dom.leftPanelList.querySelectorAll('.card-icon-out-item')
      
      renderedItems.forEach(item => {
        const iconKey = item.getAttribute('data-key')
        if (selectedIcons.has(iconKey)) {
          newSelectedMap.set(iconKey, selectedIcons.get(iconKey))
        }
      })
      
      selectedIcons = newSelectedMap
    }
  })

  let isExt = false
  try {
    const config = await api.getConfig()
    isExt = !!config.isExt
  } catch (err) {
    console.error('[icon-diet] Failed to fetch config:', err.message)
  }

  if (isExt) {
    if (dom.btnMyIcons) {
      dom.btnMyIcons.style.display = 'none'
    }

    try {
      const current = await api.getCurrentIcons()
      if (current && current.icons && current.icons.length > 0) {
        current.icons.forEach(icon => {
          const iconKey = `${icon.prefix}:${icon.name}`
          if (!selectedIcons.has(iconKey)) {
            selectedIcons.set(iconKey, icon)
          }
        })
        renderSelectedList()
      }
    } catch (err) {
      console.error('[icon-diet] Failed to load current icons:', err.message)
    }

    dom.btnScan.addEventListener('click', async () => {
      dom.btnScan.disabled = true
      const originalText = dom.btnScan.innerHTML
      dom.btnScan.textContent = 'Scanning...'

      try {
        const result = await api.scanFiles()
        if (result.error) {
          showAlert(result.error)
          return
        }

        if (result && Array.isArray(result.icons) && result.icons.length > 0) {
          result.icons.forEach(icon => {
            const iconKey = `${icon.prefix}:${icon.name}`
            selectedIcons.set(iconKey, icon)
          })
          
          renderSelectedList()
          renderGrid(loadedIcons)
          
          showAlert(`Automated project scan complete. Found and added ${result.icons.length} icons.\n\nPlease note: Icons constructed dynamically via string concatenation might have been skipped. Please verify the selected icon list manually.`)
        } else {
          showAlert('No matching icons found during scanning.')
        }
      } catch (err) {
        console.error(err)
        showAlert('An error occurred during project scanning. Please verify the backend logs.')
      } finally {
        dom.btnScan.disabled = false
        dom.btnScan.innerHTML = originalText
      }
    })

    dom.btnGenerate.addEventListener('click', async () => {
      if (selectedIcons.size === 0) return

      dom.btnGenerate.disabled = true
      dom.btnGenerate.textContent = 'Generating...'

      try {
        const iconsArray = Array.from(selectedIcons.values())
        const result = await api.generateBundle(iconsArray)
        
        if (result.success) {
          showAlert('Font and styles successfully generated and integrated into your Quasar project!')
        } else {
          showAlert(`Error: ${result.error}`)
        }
      } catch (error) {
        console.error('Generation request failed:', error)
        showAlert('Failed to generate font bundle.')
      } finally {
        dom.btnGenerate.disabled = false
        const count = selectedIcons.size
        dom.btnGenerate.textContent = 'Generate font ' + (count !== 0 ? `(${count})` : '')
      }
    })

  } else {
    if (dom.btnMyIcons) {
      dom.btnMyIcons.addEventListener('click', async (e) => {
        e.stopPropagation()
        try {
          const projects = (await api.getProjects()).reverse()
          if (!dom.sidebarBody) return
          dom.sidebarBody.innerHTML = ''

          if (!projects || !projects.length) {
            const emptyDiv = document.createElement('div')
            emptyDiv.className = 'projects-empty'
            emptyDiv.textContent = 'No icon font builds found'
            dom.sidebarBody.appendChild(emptyDiv)
          } else {
            const projectTemplate = document.getElementById('project-item-template')
            projects.forEach(proj => {
              const projName = typeof proj === 'object' ? (proj.name || proj.id) : proj
              
              const clone = projectTemplate.content.cloneNode(true)
              const itemContainer = clone.querySelector('.project-item')
              const name = clone.querySelector('.project-name')
              const prefix = clone.querySelector('.project-prefix')
              const countAvailable = clone.querySelector('.project-count-available')
              const countTotal = clone.querySelector('.project-count-total')
              
              name.textContent = projName
              prefix.textContent = proj.packs?.join(', ')

              countAvailable.textContent = proj.count - proj.unavailableCount

              if (proj.unavailableCount !== 0) {
                countAvailable.classList.add('is-warning')
                countTotal.textContent = '/' + proj.count
              }
              
              itemContainer.addEventListener('click', () => loadSavedProject(projName))
              dom.sidebarBody.appendChild(clone)
            })
          }

          if (dom.sidebar) dom.sidebar.classList.add('is-open')
        } catch (err) {
          console.error(err)
          showAlert('Failed to load saved fonts')
        }
      })
    }

    if (dom.btnSidebarClose && dom.sidebar) {
      dom.btnSidebarClose.addEventListener('click', () => {
        dom.sidebar.classList.remove('is-open')
      })
    }

    document.addEventListener('click', (e) => {
      if (dom.sidebar && !dom.sidebar.contains(e.target) && e.target !== dom.btnMyIcons) {
        dom.sidebar.classList.remove('is-open')
      }
    })

    async function loadSavedProject(folderName) {
      try {
        const data = await api.getProjectDetails(folderName)
        
        if (data.error) throw new Error(data.error)
        
        const { icons = [], notFoundIcons = [] } = data

        if (!icons.length) {
          showAlert('The icons used are no longer supported in the application.')
          return
        }

        selectedIcons.clear()
        for (const icon of icons) {
          const iconKey = `${icon.prefix}:${icon.name}`
          selectedIcons.set(iconKey, icon)
        }

        renderSelectedList()
        renderGrid(loadedIcons)
        
        if (dom.sidebar) dom.sidebar.classList.remove('is-open')

        if (notFoundIcons.length > 0) {
          showAlert(`Failed to load the following icons:\n\n${notFoundIcons.join('\n')}`)
        }
      } catch (err) {
        console.error(err)
        showAlert('Error parsing the saved font structure.')
      }
    }

    dom.btnScan.addEventListener('click', () => dom.scanDialog.showModal())
    dom.btnScanCancel.addEventListener('click', () => dom.scanDialog.close())
    dom.scanPathInput.addEventListener('input', () => {
      dom.btnScanSubmit.disabled = dom.scanPathInput.value.trim() === ''
    })

    dom.scanDialog.addEventListener('close', () => {
      dom.scanPathInput.value = ''
      dom.btnScanSubmit.disabled = true
    })

    dom.btnScanSubmit.addEventListener('click', async () => {
      let projectPath = dom.scanPathInput.value
      if (!projectPath) return

      projectPath = projectPath.trim()
      if (projectPath.toLowerCase().endsWith('/src') || projectPath.toLowerCase().endsWith('\\src')) {
        projectPath = projectPath.slice(0, -4)
      }

      dom.scanDialog.close()
      dom.btnScan.disabled = true
      const originalText = dom.btnScan.innerHTML
      dom.btnScan.textContent = 'Scanning...'

      try {
        const result = await api.scanFiles(projectPath)
        
        if (result.error) {
          showAlert(result.error)
          return
        }

        if (result && Array.isArray(result.icons) && result.icons.length > 0) {
          result.icons.forEach(icon => {
            const iconKey = `${icon.prefix}:${icon.name}`
            selectedIcons.set(iconKey, icon)
          })
          
          renderSelectedList()
          renderGrid(loadedIcons)
          
          showAlert(`Automated project scan complete. Found and added ${result.icons.length} icons.\n\nPlease note: Icons constructed dynamically via string concatenation might have been skipped. Please verify the selected icon list manually.`)
        } else {
          showAlert('No matching icons found during scanning.')
        }
      } catch (err) {
        console.error(err)
        showAlert('An error occurred during project scanning. Please verify the backend logs.')
      } finally {
        dom.btnScan.disabled = false
        dom.btnScan.innerHTML = originalText
      }
    })

    dom.btnGenerate.addEventListener('click', async () => {
      if (selectedIcons.size === 0) return

      dom.btnGenerate.disabled = true
      dom.btnGenerate.textContent = 'Generating...'

      try {
        const iconsArray = Array.from(selectedIcons.values())
        const result = await api.generateBundle(iconsArray)
        
        if (result.success && result.folder) {
          const zipUrl = `/out/${result.folder}/idiet.zip`
          const link = document.createElement('a')
          link.href = zipUrl
          link.download = `icons-${result.folder}.zip`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        } else {
          showAlert(`Error: ${result.error}`)
        }
      } catch (error) {
        console.error('Generation request failed:', error)
        showAlert('Failed to generate font bundle.')
      } finally {
        dom.btnGenerate.disabled = false
        const count = selectedIcons.size
        dom.btnGenerate.textContent = 'Generate font ' + (count !== 0 ? `(${count})` : '')
      }
    })
  }

  async function loadGridIcons(append = false, forceRefresh = false) {
    if (isLoading || (!hasMore && append)) return
    isLoading = true

    try {
      if (!append) {
        dom.gridContainer.innerHTML = '<div class="loading">Loading...</div>'
      }

      const activePacks = Array.from(selectedPacks)
      const data = await api.searchIcons(activePacks, currentQuery, currentStart, LIMIT)
      const newIcons = data.icons || []
      hasMore = data.hasMore

      if (append) {
        const loadingEl = dom.gridContainer.querySelector('.loading')
        if (loadingEl) loadingEl.remove()
        loadedIcons = [...loadedIcons, ...newIcons]
      } else {
        loadedIcons = newIcons
      }
      renderGrid(loadedIcons, forceRefresh)
    } catch (error) {
      console.error('Error loading icons:', error)
    } finally {
      isLoading = false
    }
  }

  async function initFilterDialog() {
    try {
      const fetchPacksMethod = api.getPacks || api.getCollections || api.getIconsPacks
      if (typeof fetchPacksMethod === 'function') {
        allPacks = await fetchPacksMethod.call(api)
      } else {
        allPacks = []
      }
      
      const hasUserExtIcon = allPacks.some(pack => pack.id === USER_ICON_PACK)
      if (!hasUserExtIcon) {
        allPacks.push({
          id: USER_ICON_PACK,
          name: 'User extension icons',
          count: 0,
          license: 'Local',
          color: '#0f9d58'
        })
      }

      allPacks.forEach(pack => selectedPacks.add(pack.id))
      updateMasterCheckboxState()
      updateFilterButtonState()
    } catch (e) {
      console.error('Failed to load icon packs from API: ', e)
    }
  }

  function updateMasterCheckboxState() {
    if (!dom.checkboxSelectAll) return
    
    if (selectedPacks.size === 0) {
      dom.checkboxSelectAll.checked = false
      dom.checkboxSelectAll.indeterminate = false
    } else if (selectedPacks.size === allPacks.length) {
      dom.checkboxSelectAll.checked = true
      dom.checkboxSelectAll.indeterminate = false
    } else {
      dom.checkboxSelectAll.checked = false
      dom.checkboxSelectAll.indeterminate = true
    }
  }

  function updateFilterButtonState() {
    if (!dom.btnFilter) return
    if (selectedPacks.size < allPacks.length) {
      dom.btnFilter.classList.add('is-active')
    } else {
      dom.btnFilter.classList.remove('is-active')
    }
  }

  function renderDialogPacks(searchQuery = '') {
    dom.dialogPacksList.innerHTML = ''
    
    const filtered = allPacks.filter(pack => {
      const name = pack.name || ''
      const id = pack.id || ''
      return name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             id.toLowerCase().includes(searchQuery.toLowerCase())
    })

    if (filtered.length === 0) {
      const emptyDiv = document.createElement('div')
      emptyDiv.className = 'packs-empty'
      emptyDiv.textContent = 'No packs found'
      dom.dialogPacksList.appendChild(emptyDiv)
      return
    }

    filtered.forEach(pack => {
      const clone = dom.packTemplate.content.cloneNode(true)
      const container = clone.querySelector('.card-icon-pack')
      const checkbox = clone.querySelector('.card-icon-pack-checkbox')
      const nameDiv = clone.querySelector('.card-icon-pack-name')
      const countDiv = clone.querySelector('.card-icon-pack-qty')
      const prefixDiv = clone.querySelector('.card-icon-pack-prefix')
      const licenseDiv = clone.querySelector('.card-icon-pack-license')
      const versionDiv = clone.querySelector('.card-icon-pack-version')
      const sourceDiv = clone.querySelector('.card-icon-pack-source')

      checkbox.checked = selectedPacks.has(pack.id)
      
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedPacks.add(pack.id)
        } else {
          selectedPacks.delete(pack.id)
        }
        updateMasterCheckboxState()
      })

      container.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked
          checkbox.dispatchEvent(new Event('change'))
        }
      })

      nameDiv.textContent = pack.name || pack.id
      if (countDiv) {
        countDiv.textContent = pack.count || 0
      }
      if (prefixDiv) {
        prefixDiv.textContent = pack.id
        if (pack.color) prefixDiv.style.color = pack.color
      }
      if (licenseDiv && pack.license) licenseDiv.textContent = pack.license
      if (versionDiv && pack.version && pack.version !== '0.0.0') versionDiv.textContent = 'v' + pack.version
      if (sourceDiv && pack.source) sourceDiv.textContent = pack.source

      dom.dialogPacksList.appendChild(clone)
    })
  }

  if (dom.checkboxSelectAll) {
    dom.checkboxSelectAll.addEventListener('change', () => {
      if (dom.checkboxSelectAll.checked) {
        allPacks.forEach(pack => selectedPacks.add(pack.id))
      } else {
        selectedPacks.clear()
      }
      const currentSearchVal = dialogSearchComponent ? dialogSearchComponent.input.value : ''
      renderDialogPacks(currentSearchVal.trim())
    })
  }

  dom.btnFilter.addEventListener('click', () => {
    updateMasterCheckboxState()
    if (dialogSearchComponent) dialogSearchComponent.clear()
    renderDialogPacks()
    dom.dialog.showModal()
  })

  dom.btnDialogCancel.addEventListener('click', () => dom.dialog.close())

  dom.btnDialogOk.addEventListener('click', () => {
    dom.dialog.close()
    updateFilterButtonState()
    currentStart = 0
    hasMore = true
    loadGridIcons(false)
  })

  function renderGrid(iconsToRender) {
    dom.gridContainer.innerHTML = ''

    iconsToRender.forEach(icon => {
      const clone = dom.iconTemplate.content.cloneNode(true)
      const item = clone.querySelector('.card-icon-item')
      const iconGlif = clone.querySelector('.card-icon-placeholder')
      const prefixWrapper = clone.querySelector('.card-icon-name-prefix-wrapper')
      const prefixExtra = clone.querySelector('.card-icon-name-prefix-extra')
      const prefix = clone.querySelector('.card-icon-name-prefix')
      const separator = clone.querySelector('.card-icon-name-separator')
      const name = clone.querySelector('.card-icon-name')
      const copyBtn = clone.querySelector('.card-icon-btn-copy-name')

      const iconKey = `${icon.prefix}:${icon.name}`
      const width = icon.width || 32
      const height = icon.height || 32
      
      let extraClass = null
      let iconDisplayName = icon.name
      if (icon.prefix === 'fa') {
        const [style, name] = icon.name.split('$')
        iconDisplayName = name
        extraClass = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' }[style]
      }  
      
      const iconFullName = (extraClass ?? ' ') + `${icon.prefix}${icon.separator}${iconDisplayName}`
      item.setAttribute('data-tooltip', iconFullName)

      iconGlif.innerHTML = 
        `<svg width="24" height="24" viewBox="0 0 ${width} ${height}" fill="none">
          ${icon.body}
        </svg>`
      if (prefixWrapper && icon.color) prefixWrapper.style.color = icon.color

      prefixExtra.textContent = extraClass ?? ''
      prefixExtra.style['padding-right'] = extraClass ? '8px' : 'none'
      prefix.textContent = icon.prefix
      separator.textContent = icon.separator
      name.textContent = iconDisplayName

      if (selectedIcons.has(iconKey)) {
        item.classList.add('active')
      }

      if (!checkIconIsBase(icon)) 
        item.addEventListener('click', () => toggleIconSelection(icon, item))
      else
        item.classList.add('is-base-icon')

      copyBtn.addEventListener('click', (e) => copyIconNameToClipboard(e, iconFullName))

      dom.gridContainer.appendChild(clone)
    })
  }

  function renderSelectedList() {
    dom.leftPanelList.innerHTML = ''

    selectedIcons.forEach(icon => {
      const clone = dom.iconOutTemplate.content.cloneNode(true)
      const item = clone.querySelector('.card-icon-out-item')
      const iconGlif = clone.querySelector('.card-icon-out-placeholder')
      const prefixWrapper = clone.querySelector('.card-icon-out-name-prefix-wrapper')
      const prefixExtra = clone.querySelector('.card-icon-out-name-prefix-extra')
      const prefix = clone.querySelector('.card-icon-out-name-prefix')
      const separator = clone.querySelector('.card-icon-out-name-separator')
      const name = clone.querySelector('.card-icon-out-name')
      const helperDiv = clone.querySelector('.card-icon-out-name-helper')
      const copyBtn = clone.querySelector('.card-icon-btn-copy-name')
      const removeBtn = clone.querySelector('.remove-btn')

      const iconKey = `${icon.prefix}:${icon.name}`
      const width = icon.width || 24
      const height = icon.height || 24

      let extraClass = null
      let iconDisplayName = icon.name
      if (icon.prefix === 'fa') {
        const [style, name] = icon.name.split('$')
        iconDisplayName = name
        extraClass = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' }[style]
      }  
      
      const iconFullName = (extraClass ?? ' ') + `${icon.prefix}${icon.separator}${iconDisplayName}`
      item.setAttribute('data-tooltip', iconFullName)
      
      iconGlif.innerHTML = 
        `<svg width="32" height="32" viewBox="0 0 ${width} ${height}" fill="none">
          ${icon.body}
        </svg>`
      if (prefixWrapper && icon.color) prefixWrapper.style.color = icon.color

      prefixExtra.textContent = extraClass ?? ''
      prefixExtra.style['padding-right'] = extraClass ? '8px' : 'none'
      prefix.textContent = icon.prefix
      separator.textContent = icon.separator
      name.textContent = iconDisplayName

      if (icon.helper) {
        helperDiv.textContent = icon.helper
      } else if (helperDiv) {
        helperDiv.remove()
      }

      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        removeIcon(iconKey)
      })

      copyBtn.addEventListener('click', (e) => copyIconNameToClipboard(e, iconFullName))
      dom.leftPanelList.appendChild(clone)
    })

    const count = selectedIcons.size
    dom.btnGenerate.textContent = 'Generate font '  + (count !== 0 ? `(${count})` : '')
    dom.btnGenerate.disabled = count === 0
    dom.btnSort.style.display = count < 3 ? 'none' : ''
    dom.btnClear.style.display = count < 3 ? 'none' : ''
  }

  function renderBaseList() {
    baseIcons.forEach(icon => {
      const clone = dom.iconOutTemplate.content.cloneNode(true)
      const iconGlif = clone.querySelector('.card-icon-out-placeholder')
      const prefixWrapper = clone.querySelector('.card-icon-out-name-prefix-wrapper')
      const prefixExtra = clone.querySelector('.card-icon-out-name-prefix-extra')
      const prefix = clone.querySelector('.card-icon-out-name-prefix')
      const separator = clone.querySelector('.card-icon-out-name-separator')
      const name = clone.querySelector('.card-icon-out-name')
      const helperDiv = clone.querySelector('.card-icon-out-name-helper')
      const copyBtn = clone.querySelector('.card-icon-btn-copy-name')
      const removeBtn = clone.querySelector('.remove-btn')

      const width = icon.width || 24
      const height = icon.height || 24

      const iconFullName = (icon.extraClass ? (icon.extraClass + ' ') : '') + `${icon.prefix}${icon.separator}${icon.name}`
      
      iconGlif.innerHTML = 
        `<svg width="32" height="32" viewBox="0 0 ${width} ${height}" fill="none">
          ${icon.body}
        </svg>`
      if (prefixWrapper && icon.color) prefixWrapper.style.color = icon.color

      prefixExtra.textContent = icon.extraClass ?? ''
      prefixExtra.style['padding-right'] = icon.extraClass ? '8px' : 'none'
      prefix.textContent = icon.prefix
      separator.textContent = icon.separator
      name.textContent = icon.name

      if (icon.helper) {
        helperDiv.textContent = icon.helper
      } else if (helperDiv) {
        helperDiv.remove()
      }

      removeBtn.style.display = 'none'
      copyBtn.addEventListener('click', (e) => copyIconNameToClipboard(e, iconFullName))
      dom.baseList.appendChild(clone)
    })
  }

  function copyIconNameToClipboard (evt, icon) {
    evt.stopPropagation()
    navigator.clipboard.writeText(icon)
      .then(() => {
        dom.toast.style.opacity = '1'
        setTimeout(() => dom.toast.style.opacity = '0', 2000)
      })
      .catch(err => console.error('Could not copy text: ', err))
  }

  function toggleIconSelection(icon, itemDiv) {
    const iconKey = `${icon.prefix}:${icon.name}`

    if (selectedIcons.has(iconKey)) {
      selectedIcons.delete(iconKey)
      itemDiv.classList.remove('active')
    } else {
      const newMap = new Map()
      newMap.set(iconKey, icon)
      
      for (const [key, value] of selectedIcons) {
        newMap.set(key, value)
      }
      
      selectedIcons = newMap
      itemDiv.classList.add('active')
    }

    renderSelectedList()
  }

  function removeIcon(iconKey) {
    selectedIcons.delete(iconKey)
    renderSelectedList()
    
    const gridItems = dom.gridContainer.querySelectorAll('.card-icon-item')
    gridItems.forEach(item => {
      const prefix = item.querySelector('.card-icon-name-prefix')?.textContent.replace(':', '') || ''
      const name = item.querySelector('.card-icon-name').textContent
      if (`${prefix}:${name}` === iconKey) {
        item.classList.remove('active')
      }
    })
  }

  dom.gridContainer.addEventListener('scroll', () => {
    if (!hasMore || isLoading) return

    const { scrollTop, scrollHeight, clientHeight } = dom.gridContainer
    
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      currentStart += LIMIT
      loadGridIcons(true)
    }
  })

  dom.btnSort.addEventListener('click', () => {
    const iconsArray = Array.from(selectedIcons.entries())

    iconsArray.sort((a, b) => {
      const [keyA, iconA] = a
      const [keyB, iconB] = b

      if (iconA.prefix !== iconB.prefix) {
        if (iconA.prefix === USER_ICON_PACK) return -1
        if (iconB.prefix === USER_ICON_PACK) return 1
        
        return iconA.prefix.localeCompare(iconB.prefix)
      }
      
      return iconA.name.localeCompare(iconB.name)
    })

    selectedIcons = new Map(iconsArray)
    renderSelectedList()
  })

  dom.btnClear.addEventListener('click', () => {
    selectedIcons.clear()
    renderSelectedList()
    renderGrid(loadedIcons)
  })

  if (dom.btnUpload && dom.fileInput) {
    dom.btnUpload.addEventListener('click', () => dom.fileInput.click())

    dom.fileInput.addEventListener('change', async () => {
      if (!dom.fileInput.files.length) return

      dom.btnUpload.disabled = true
      const originalText = dom.btnUpload.innerHTML
      dom.btnUpload.textContent = 'Uploading...'

      try {
        const result = await api.uploadIcons(dom.fileInput.files)
        
        if (result.processed && result.processed.length > 0) {
          if (typeof api.getPacks === 'function') {
            allPacks = await api.getPacks()
          }

          const hasUpdates = result.processed.some(item => item.status === 'updated')
          const updatedIcons = result.processed
            .filter(item => item.status === 'updated')
            .map(item => item.name)

          currentStart = 0
          hasMore = true
          dom.gridContainer.innerHTML = ''
          await loadGridIcons(false, hasUpdates)

          if (hasUpdates) {
            showAlert(`Icons successfully updated:\n\n${updatedIcons.map(name => `- ${name}`).join('\n')}`)
          }
        }

        if (result.errors && result.errors.length > 0) {
          const errorMessages = result.errors.map(err => `- ${err.file}: ${err.reason}`).join('\n')
          showAlert(
            `Some icons could not be uploaded:\n\n${errorMessages}\n\n` +
            `Fix requirements:\n` +
            `1. Do not use lines (convert stroke to path via Outline Stroke or Flatten in Figma or Outline Stroke and Pathfinder in Illustrator).\n` +
            `2. Do not contain groups with transforms.\n` +
            `3. Do not contain <defs>, <use>, <line>, or <polyline> tags.`
          )
        }
      } catch (err) {
        console.error(err)
        showAlert('An error occurred during file upload.')
      } finally {
        dom.fileInput.value = ''
        dom.btnUpload.disabled = false
        dom.btnUpload.innerHTML = originalText
      }
    })
  }
  
  renderBaseList()
  await initFilterDialog()
  renderSelectedList()
  loadGridIcons()
})