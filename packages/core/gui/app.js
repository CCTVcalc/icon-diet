import { api } from './api.js'
import Sortable from './assets/sortable.js'

document.addEventListener('DOMContentLoaded', async () => {
  const dom = {
    leftPanelList: document.querySelector('.left-panel-list'),
    baseList: document.querySelector('.base-icons-list'),
    baseIconsQty: document.querySelector('.base-icons-qty'),
    gridContainer: document.querySelector('.grid-container'),
    mainContent: document.querySelector('.main-content'),
    setSelector: document.querySelector('.idt-select-field'),
    dropdown: document.querySelector('.idt-dropdown'),
    dropdownTrigger: document.getElementById('idt-set-trigger'),
    dropdownMenu: document.getElementById('idt-set-menu'),
    setField: document.querySelector('.idt-set-field'),
    menuItemTemplate: document.getElementById('menu-item-template'),
    iconSetInfo: document.getElementById('idt-set-info'),
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
    scanningDialog: document.querySelector('.scanning-dialog'),

    alertDialog: document.querySelector('.alert-dialog'),
    alertDialogText: document.querySelector('.alert-dialog-text'),
    alertDialogClose: document.querySelector('.alert-dialog-close'),

    btnSort: document.querySelector('.left-panel-sort'),
    btnClear: document.querySelector('.left-panel-clear'),
    toast: document.getElementById('toast')
  }
  
  const LIMIT = 100
  let currentStart = 0
  let currentQuery = ''
  let hasMore = true
  let isLoading = false
  let loadedIcons = []
    
  let allPacks = await api.getPacks()
  let baseIcons = await api.getBaseIcons()

  let selectedPacks = new Set()
  let selectedIcons = new Map()
  let searchTimeout

  const getBaseIconsNames = () => baseIcons.map(i => i.name)
  function checkIconIsBase (icon) {
    if (!icon) return false
    return icon?.prefix === baseIcons[0]?.prefix && getBaseIconsNames().includes(icon.name)
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

    const updateState = () => fieldEl.classList.toggle('is-empty', inputEl.value.trim() === '')

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
    value => renderDialogPacks(value.trim())
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

  function prefixOut (icon) {
    const prefix = icon.prefix
    const s = icon.separator
    if (prefix === 'mat') return ''
    if (prefix.startsWith('mat')) return prefix.slice('mat_'.length) + s
    return prefix + s
  }

  let IS_EXT = false
  let ICON_SETS = null
  let USER_ICON_PACK = ''
  
  let ICON_SET = null

  async function syncIconSet (newSet) {
    ICON_SET = newSet
    updateSetSelector(newSet)
    baseIcons = await api.getBaseIcons()
    renderBaseList()
    renderGrid(loadedIcons)
  }

  async function setIconSet (newSet) {
    if (ICON_SET === newSet) return
    if (!IS_EXT) await api.setIconSet(newSet)
    await syncIconSet(newSet)
  }

  function updateSetSelector (newSet) {
    const pack = allPacks.find(e => e.key === newSet)
    const packName = pack?.name || newSet

    if (IS_EXT) {
      if (dom.iconSetInfo) dom.iconSetInfo.textContent = packName
    } else {
      if (dom.dropdownTrigger) dom.dropdownTrigger.textContent = packName
      if (dom.dropdownMenu) {
        dom.dropdownMenu.querySelectorAll('.idt-dropdown-item').forEach(item => {
          item.classList.toggle('is-selected', item.dataset.value === newSet)
        })
      }
    }
  }

  let config
  try {
    config = await api.getConfig()
    IS_EXT = !!config.isExt
    if (!IS_EXT) ICON_SETS = config.iconSets
    USER_ICON_PACK = config.userIconPackName || 'ext'

    await syncIconSet(config.iconSet)
  } catch (err) {
    console.error('[icon-diet] Failed to fetch config:', err.message)
  }

  async function runScan (projectPath) {
    dom.btnScan.disabled = true
    dom.scanningDialog.showModal()

    try {
      const result = await api.scanFiles(projectPath || undefined)

      if (result.error) {
        showAlert(result.error)
        return
      }

      if (result && Array.isArray(result.icons) && result.icons.length > 0) {
        result.icons.forEach(icon => selectedIcons.set(icon.fullName, icon))

        renderSelectedList()

        if (result) await syncIconSet(result.iconSet ?? config.defaultIconSet)
        
        /* Block for standalone app only */
        let alertIconSet = ''
        if (result.iconSetStatus === 'fail')
          alertIconSet = `WARNING! Could not parse iconSet from quasar.config.js /.ts! \n Using default: ${config.defaultIconSet}\n\n`

        showAlert(`Automated project scan complete. \n\n ${alertIconSet} Found and added ${result.icons.length} icons.\n\nPlease note: Icons constructed dynamically via string concatenation might have been skipped. Please verify the selected icon list manually.`)
      } else {
        showAlert('No matching icons found during scanning.')
      }
    } catch (err) {
      console.error(err)
      showAlert('An error occurred during project scanning. Please verify the backend logs.')
    } finally {
      dom.btnScan.disabled = false
      dom.scanningDialog.close()
    }
  }

  async function handleGenerate (onSuccess) {
    if (selectedIcons.size === 0) return

    dom.btnGenerate.disabled = true
    dom.btnGenerate.textContent = 'Generating...'

    try {
      const result = await api.generateBundle([...selectedIcons.values()].map(el => el.fullName))

      if (result.success) await onSuccess(result)
      else showAlert(`Error: ${result.error}`)

    } catch (error) {
      console.error('Generation request failed:', error)
      showAlert('Failed to generate font bundle.')
    } finally {
      dom.btnGenerate.disabled = false
      const count = selectedIcons.size
      dom.btnGenerate.textContent = 'Generate font ' + (count !== 0 ? `(${count})` : '')
    }
  }
  
  if (IS_EXT) {
    /* APP IS QUASAR EXTENSION */
    dom.setSelector.style.display = 'none'
    dom.btnMyIcons.style.display = 'none'

    try {
      const current = await api.getCurrentIcons()
      if (current && current.icons && current.icons.length > 0) {
        current.icons.forEach(icon => {
          if (!selectedIcons.has(icon.fullName)) selectedIcons.set(icon.fullName, icon)
        })
        renderSelectedList()
      }
    } catch (err) {
      console.error('[icon-diet] Failed to load current icons:', err.message)
    }

    dom.btnScan.addEventListener('click', async () => await runScan())
    dom.btnGenerate.addEventListener('click', () => handleGenerate(
      () => showAlert('Font and styles successfully generated and integrated into your project!')
    ))
  } else {
    /* STAND ALONE APP */
   if (ICON_SETS) {
      dom.setField.style.display = 'none'
      
      if (dom.dropdownMenu) dom.dropdownMenu.innerHTML = ''

      ICON_SETS.forEach(i => {
        const pack = allPacks.find(e => e.key === i)
        const packName = pack?.name || i
        const prefixName = pack?.id
        const separator = pack?.separator
        const prefixColor = pack?.color
        
        const clone = dom.menuItemTemplate.content.cloneNode(true)
        const item = clone.querySelector('.idt-dropdown-item')

        item.dataset.value = i
        const name = item.querySelector('.name')
        const prefix = item.querySelector('.prefix')
        
        if (name) name.textContent = packName
        if (prefix) prefix.textContent = prefixName.startsWith('mat') 
          ? prefixName === 'mat'
            ? '<mat>'
            : `<mat_>${prefixName.slice('mat_'.length)}${separator}` 
          : `${prefixName}${separator}`
          
        if (prefix && prefixColor) prefix.style.color = prefixColor
        
        item.addEventListener('click', (e) => {
          e.stopPropagation()
          if (dom.dropdown) dom.dropdown.classList.remove('is-active')
          setIconSet(i)
        })

        if (dom.dropdownMenu) dom.dropdownMenu.appendChild(item)
      })

      if (ICON_SET) updateSetSelector(ICON_SET)

      if (dom.dropdownTrigger && dom.dropdown) {
        dom.dropdownTrigger.addEventListener('click', (e) => {
          e.stopPropagation()
          dom.dropdown.classList.toggle('is-active')
          
          if (dom.dropdown.classList.contains('is-active') && dom.dropdownMenu) {
            const selectedItem = dom.dropdownMenu.querySelector('.idt-dropdown-item.is-selected')
            if (selectedItem) {
              selectedItem.scrollIntoView({ block: 'nearest' })
            }
          }
        })
      }

      document.addEventListener('click', (e) => {
        if (dom.dropdown && !dom.dropdown.contains(e.target)) {
          dom.dropdown.classList.remove('is-active')
        }
      })
    }

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
              const countBase = clone.querySelector('.project-count-base')
              const countMissing = clone.querySelector('.project-count-missing')
              const countMissingWrapper = clone.querySelector('.project-count-missing-wrapper')
              
              name.textContent = projName
              prefix.textContent = proj.packs
                ?.map(p => 
                  p.startsWith('mat')
                    ? p === 'mat' ? '<mat>' : `<mat_>${p.slice('mat_'.length)}`
                    : p
                )
                .join(', ')

              const countBaseIcons = baseIcons.length || 0
              countAvailable.textContent = proj.count

              countBase.textContent = countBaseIcons
              if (proj.unavailableCount === 0) countMissingWrapper.style.display = 'none'
              countMissing.textContent = proj.unavailableCount
              
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
    
    async function loadSavedProject (folderName) {
      try {
        const data = await api.getProjectDetails(folderName)
        
        if (data.error) throw new Error(data.error)
        
        const { icons = [], notFoundIcons = [], iconSet } = data

        if (!icons.length) {
          showAlert('The icons used are no longer supported in the application.')
          return
        }

        selectedIcons.clear()

        for (const icon of icons) selectedIcons.set(icon.fullName, icon)

        if (iconSet) await syncIconSet(iconSet)
        renderSelectedList()
          
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
      runScan(projectPath)
    })

    dom.btnGenerate.addEventListener('click', () => {
      handleGenerate((result) => {
        if (result.folder) {
          const link = document.createElement('a')
          link.href = `/out/${result.folder}/idiet.zip`
          link.download = `icons-${result.folder}.zip`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
      })
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
      const container = clone.querySelector('.pack')
      const checkbox = clone.querySelector('.pack-checkbox')
      const nameDiv = clone.querySelector('.pack-name')
      const countDiv = clone.querySelector('.pack-qty')
      const prefixDiv = clone.querySelector('.pack-prefix')
      const licenseDiv = clone.querySelector('.pack-license')
      const versionDiv = clone.querySelector('.pack-version')
      const sourceDiv = clone.querySelector('.pack-source')

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

      nameDiv.textContent = `${pack.name}${pack.author ? (' - ' + pack.author) : ''}` || pack.id
      if (countDiv) countDiv.textContent = pack.count || 0

      if (prefixDiv) {
       prefixDiv.textContent = pack.id.startsWith('mat') 
          ? pack.id === 'mat'
            ? '<mat>'
            : `<mat_>${pack.id.slice('mat_'.length)}${pack.separator}` 
          : `${pack.id}${pack.separator}`

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

  function renderGrid (iconsToRender) {
    dom.gridContainer.innerHTML = ''

    iconsToRender.forEach(icon => {
      const clone = dom.iconTemplate.content.cloneNode(true)
      const item = clone.querySelector('.item')
      const iconGlif = clone.querySelector('.placeholder')
      const prefixWrapper = clone.querySelector('.name-prefix-wrapper')
      const prefixExtra = clone.querySelector('.name-prefix-extra')
      const prefix = clone.querySelector('.name-prefix')
      const name = clone.querySelector('.name')
      const copyBtn = clone.querySelector('.btn-copy-name')

      const width = icon.size || 32
      const height = icon.size || 32
      
      let extraClass = null
      let iconDisplayName = icon.name
      if (icon.prefix === 'fa') {
        const [style, name] = icon.name.split('$')
        iconDisplayName = name
        extraClass = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' }[style]
      }  
      
      const iconFullName = 
        (extraClass ? (extraClass + ' ') : '') + prefixOut(icon) + iconDisplayName
      item.setAttribute('data-tooltip', iconFullName)

      iconGlif.innerHTML = 
        `<svg width="24" height="24" viewBox="0 0 ${width} ${height}" fill="none">
          ${icon.body}
        </svg>`
      if (prefixWrapper && icon.color) prefixWrapper.style.color = icon.color

      prefixExtra.textContent = extraClass ?? ''
      prefixExtra.style['padding-right'] = extraClass ? '8px' : 'none'
      prefix.textContent = prefixOut(icon) ?? ''
      name.textContent = iconDisplayName

      if (selectedIcons.has(icon.fullName)) item.classList.add('active')
      
      if (!checkIconIsBase(icon)) 
        item.addEventListener('click', () => toggleIconSelection(icon, item))
      else
        item.classList.add('is-base-icon')

      copyBtn.addEventListener('click', (e) => copyIconNameToClipboard(e, iconFullName))

      dom.gridContainer.appendChild(clone)
    })
  }

  function renderLeftPanelItem (icon, type) {
    const clone = dom.iconOutTemplate.content.cloneNode(true)
    const item = clone.querySelector('.item')
    const iconGlif = clone.querySelector('.placeholder')
    const prefixWrapper = clone.querySelector('.name-prefix-wrapper')
    const prefixExtra = clone.querySelector('.name-prefix-extra')
    const prefix = clone.querySelector('.name-prefix')
    const separator = clone.querySelector('.name-separator')
    const name = clone.querySelector('.name')
    const helperDiv = clone.querySelector('.helper')
    const copyBtn = clone.querySelector('.btn-copy-name')
    const removeBtn = clone.querySelector('.remove-btn')

    const width = icon.size || 24
    const height = icon.size || 24

    let extraClass = null
    let iconDisplayName = icon.name
    if (icon.prefix === 'fa') {
      const [style, name] = icon.name.split('$')
      iconDisplayName = name
      extraClass = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' }[style]
    }  
      
    const iconFullName =
      (extraClass ? (extraClass + ' ') : '') + prefixOut(icon) + iconDisplayName
    
    iconGlif.innerHTML = 
      `<svg width="24" height="24" viewBox="0 0 ${width} ${height}" fill="none">
        ${icon.body}
      </svg>`
    if (prefixWrapper && icon.color) prefixWrapper.style.color = icon.color

    prefixExtra.textContent = extraClass ?? ''
    prefixExtra.style['padding-right'] = extraClass ? '8px' : 'none'
    prefix.textContent = prefixOut(icon) ?? ''
    name.textContent = iconDisplayName

    if (icon.helper) helperDiv.textContent = icon.helper
    else if (helperDiv) helperDiv.remove()

    copyBtn.addEventListener('click', (e) => copyIconNameToClipboard(e, iconFullName))
    
    if (type !== 'base') {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        removeIcon(icon.fullName)
      })
      dom.leftPanelList.appendChild(clone)
    } else {
      removeBtn.style.display = 'none'
      dom.baseList.appendChild(clone)
    }
  }
  
  function renderSelectedList() {
    dom.leftPanelList.innerHTML = ''
    selectedIcons.forEach(icon => renderLeftPanelItem (icon))

    const count = selectedIcons.size
    dom.btnGenerate.textContent = 'Generate font '  + (count !== 0 ? `(${count})` : '')
    dom.btnGenerate.disabled = count === 0
    dom.btnSort.style.display = count < 3 ? 'none' : ''
    dom.btnClear.style.display = count < 3 ? 'none' : ''
  }

  function renderBaseList() {
    dom.baseList.innerHTML = ''
    dom.baseIconsQty.textContent = baseIcons.length
    baseIcons.forEach(icon => renderLeftPanelItem (icon, 'base'))
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
    if (selectedIcons.has(icon.fullName)) {
      selectedIcons.delete(icon.fullName)
      itemDiv.classList.remove('active')
    } else {
      const newMap = new Map()
      newMap.set(icon.fullName, icon)
      
      for (const [key, value] of selectedIcons) newMap.set(key, value)
      
      selectedIcons = newMap
      itemDiv.classList.add('active')
    }

    renderSelectedList()
  }

  function removeIcon (iconKey) {
    selectedIcons.delete(iconKey)
    renderSelectedList()
    renderGrid(loadedIcons)
    
    const gridItems = dom.gridContainer.querySelectorAll('.item')
    gridItems.forEach(item => {
      const prefix = item.querySelector('.name-prefix')?.textContent.replace(':', '') || ''
      const name = item.querySelector('.name').textContent
      if (item.fullName === iconKey) {
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