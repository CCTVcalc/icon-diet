import { fork } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { executeBackendCommand, makeRequest } from './utils.js'
import { parseArgs } from 'node:util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default function (api) {
  const idietFolder = path.join(api.appDir, 'src/idiet')
  let quasarConf = null
  const backendEnv = {
    ...process.env,
    IS_EXTENSION: 'true',
    EXT_ICON_SET: 'material-icons',
    PROJECT_ROOT: process.cwd()
  }

  const POST_DEFAULT_OPTIONS = {
    hostname: '127.0.0.1',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }
  const GET_DEFAULT_OPTIONS = {
    hostname: '127.0.0.1',
    method: 'GET'
  }
  
  api.extendQuasarConf(async (conf) => {
    quasarConf = conf
    
    const appPacks = [
      'material-icons',
      'material-icons-outlined',
      'material-icons-round',
      'material-icons-sharp',
      'material-symbols-outlined',
      'material-symbols-rounded',
      'material-symbols-sharp',
      'mdi-v7',
      'fontawesome-v7'
    ]
    
    const activeViolations = conf.extras?.filter(item => appPacks.includes(item)) || []

    backendEnv.EXT_ICON_SET = conf.framework?.iconSet && appPacks.includes(conf.framework.iconSet)
      ? conf.framework.iconSet 
      : 'material-icons'

    const hasBoot = conf.boot && conf.boot.some(b => 
      typeof b === 'string' ? b.includes('idiet-boot') : b.path?.includes('idiet-boot')
    )

    if (!hasBoot) {
      const tempBackend = await executeBackendCommand(backendEnv)
      await doScan(tempBackend.port, true)
      tempBackend.kill()
    }

    const hasCustomMapFn = conf.framework?.iconMapFn !== undefined

    if (activeViolations.length > 0 || hasCustomMapFn) {
      console.error('\n\n🚨 [icon diet] CRITICAL WARNING!')
      
      if (activeViolations.length > 0) {
        console.error(`You have included standard fonts in 'extras': [${activeViolations.join(', ')}].`)
        console.error('This breaks Icon Diet optimization and bloats the bundle!')
        console.error('SOLUTION: Comment out or remove them from the "extras" section in "quasar.config.js/.ts".')
      }
      
      if (hasCustomMapFn) {
        console.error('\nYou defined "framework.iconMapFn" directly in "quasar.config.js/.ts".')
        console.error('Icon Diet automatically injects the mapping via its own boot file.')
        console.error('SOLUTION: Remove the "framework.iconMapFn" property from your Quasar configuration.')
        console.error('If you need custom rules, edit the "src/idiet/idietIconMapFn.js" file instead.')
      }
      
      console.error('--------------------------------------------------\n\n')
      process.exit(1)
    }

    conf.boot.push('~/src/idiet/idiet-boot.js')
  })

  api.registerCommand('start', async () => {
    const binPath = path.resolve(__dirname, '../../core/bin/index.js')
    const basePort = (quasarConf?.devServer?.port || 9000) + 179
    const MAX_RETRIES = 5

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const guiPort = basePort + attempt
      
      const child = fork(binPath, [], {
        env: backendEnv,
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        detached: true
      })

      const isStarted = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill()
          resolve(false)
        }, 3000)

        child.on('message', function listener(msg) {
          if (msg && msg.status === 'ready') {
            clearTimeout(timer)
            child.off('message', listener)
            resolve(true)
          }
        })

        child.once('exit', () => {
          clearTimeout(timer)
          resolve(false)
        })
      })

      if (isStarted) {
        console.log(`\n🚀 [icon-diet] Web GUI is successfully running at: http://localhost:${guiPort}\n`)

        const extIconFolder = path.join(idietFolder, 'ext-icon')
        if (!fs.existsSync(extIconFolder)) {
          fs.mkdirSync(extIconFolder, { recursive: true })
        }

        fs.writeFileSync(path.join(idietFolder, '.gui.pid'), String(child.pid))
        child.unref()
        process.exit(0)
      }

      console.log(`⚠️ [icon-diet] Port ${guiPort} is busy. Trying next one...`)
    }

    console.error('❌ [icon-diet] Could not find an available port for Web GUI.')
  })

  api.registerCommand('stop', async () => {
    const pidFile = path.join(idietFolder, '.gui.pid')

    if (!fs.existsSync(pidFile)) {
      console.log('ℹ️ [icon-diet] Web GUI is not running (or already stopped).')
      return
    }

    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10)

      if (pid) {
        process.kill(pid, 'SIGTERM')
        console.log(`🛑 [icon-diet] Web GUI (PID: ${pid}) has been stopped.`)
      }
    } catch (err) {
      if (err.code === 'ESRCH') {
        console.log('ℹ️ [icon-diet] Web GUI was already stopped.')
      } else {
        console.error('❌ [icon-diet] Failed to stop Web GUI:', err.message)
      }
    } finally {
      try {
        fs.unlinkSync(pidFile)
      } catch {}
    }
  })

  api.registerCommand('scan', async () => {
    let backend
    try {
      backend = await executeBackendCommand(backendEnv)
      await doScan(backend.port, false)
    } catch (e) {
      console.error('❌ [icon-diet] Scan command failed:', e.message)
    } finally {
      if (backend) backend.kill()
    }
  })

  api.registerCommand('add-icon', async () => {
    const rawIcons = getCleanCliIcons()
    console.log('[icon-diet] Detected incoming icons:', rawIcons)

    if (rawIcons.length === 0) {
      console.log('❌ [icon-diet] Please specify icons. Example: quasar run icon-diet add-icon mdi-close, bi-alarm mdi-home')
      return
    }

    const uniqueIcons = [...new Set(rawIcons)]
    const candidates = uniqueIcons.filter(icon => !icon.startsWith('fa-'))
    const skippedFa = uniqueIcons.filter(icon => icon.startsWith('fa-'))

    if (candidates.length === 0) {
      console.log('⚠️ [icon-diet] No suitable candidates found for validation (FontAwesome icons skipped).')
      if (skippedFa.length > 0) console.log(`Skipped (FontAwesome): ${skippedFa.join(', ')}`)
      return
    }

    let backend
    try {
      backend = await executeBackendCommand(backendEnv)
      console.log(`🔍 [icon-diet] Checking candidates (${candidates.length} pcs)...`)
      
      const checkResult = await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/check-icon'
      }, {
        iconNames: candidates
      })

      const approved = []
      const rejected = []
      const newIconsToGenerate = []

      for (const [iconName, data] of Object.entries(checkResult?.icons || {})) {
        if (data) {
          approved.push(iconName)
          newIconsToGenerate.push(data)
        } else {
          rejected.push(iconName)
        }
      }

      console.log('\n=== CHECK RESULTS ===')
      if (approved.length > 0) console.log(`\n✅ VALID CANDIDATES (${approved.length}):\n${approved.map(i => `  - ${i}`).join('\n')}`)
      if (rejected.length > 0) console.log(`\n❌ INVALID CANDIDATES (${rejected.length}):\n${rejected.map(i => `  - ${i}`).join('\n')}`)
      if (skippedFa.length > 0) console.log(`\n⚠️ IGNORED (FontAwesome) (${skippedFa.length}):\n${skippedFa.map(i => `  - ${i}`).join('\n')}`)
      console.log('\n========================')

      if (newIconsToGenerate.length === 0) {
        console.log('\n⚠️ [icon-diet] Generation skipped because no valid icons were found.')
        return
      }

      await mergeAndGenerateIcons(backend.port, newIconsToGenerate)

    } catch (e) {
      console.log('❌ [icon-diet] Icon processing error:', e.message || e)
    } finally {
      if (backend) backend.kill()
    }
  })

  api.registerCommand('show-fonts', async () => {
    let backend

    try {
      backend = await executeBackendCommand(backendEnv)

      const projectDetails = await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/project-details'
      })

      const projectIcons = projectDetails?.icons || []
      const projectPacks = [...new Set(projectIcons.map(i => i.prefix))]

      const packs = await makeRequest({
        ...GET_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/packs'
      })

      const outPacks = packs?.filter(p => projectPacks.includes(p.id)) || []

      if (outPacks.length !== 0) {
        console.log('\n🔤 [icon-diet] Project font(s):')
        outPacks.forEach(pack => {
          console.log(`   - ${pack.id}: ${pack.source} ${pack.name} /${pack.count}/${pack.license ? (' ' + pack.license) : ''}${pack.version && pack.version !== '0.0.0' ? ' v' + pack.version : ''}`)
        })
        console.log('')
      } else {
        console.log('Nothing found!')
      }

    } catch (e) {
      console.log('❌ [icon-diet] Error:', e.message || e)
    } finally {
      if (backend) backend.kill()
    }
  })

  api.registerCommand('show-fonts-available', async () => {
    let backend

    try {
      backend = await executeBackendCommand(backendEnv)

      const packs = await makeRequest({
        ...GET_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/packs'
      })

      console.log('\n🔤 [icon-diet] Available fonts:')
      
      ;['@quasar/extras', '@iconify'].forEach(source => {
        console.log(`\n from ${source}:`)
        packs
          ?.filter(p => p.source === source)
          .forEach(pack => {
            console.log(`   - ${pack.id}: ${pack.name} /${pack.count}/${pack.license ? (' ' + pack.license) : ''}${pack.version && pack.version !== '0.0.0' ? ' v' + pack.version : ''}`)
          })
      })
      console.log('')

    } catch (e) {
      console.log('❌ [icon-diet] Error:', e.message || e)
    } finally {
      if (backend) backend.kill()
    }
  })
 
  api.registerCommand('show-icons', async () => {
    let backend

    try {
      backend = await executeBackendCommand(backendEnv)

      const projectDetails = await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/project-details'
      })
      const icons = projectDetails?.icons || []
      const out = icons.map(el => `${el.prefix}${el.separator}${el.name}`)

      if (out.length !== 0) {
        console.log(`\n Project icon(s):\n  ${out.join(', ')}\n  Total: ${out.length} \n`)
      } else {
        console.log('Nothing found!')
      }

    } catch (e) {
      console.log('❌ [icon-diet] Error:', e.message || e)
    } finally {
      if (backend) backend.kill()
    }
  })

  api.registerCommand('rebuildDB', async () => {
    let backend

    try {
      backend = await executeBackendCommand(backendEnv)

      await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/update-packages'
      })
      console.log('✅ [icon-diet] Icon packages updated successfully.')

      await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/rebuild-database'
      })
      console.log('✅ [icon-diet] Database rebuilt successfully.')

    } catch (e) {
      console.log('❌ [icon-diet] Process error:', e.message || e)
    } finally {
      if (backend) backend.kill()
    }
  })

  api.registerCommand('help', () => {
    console.log(`💡 [icon diet] Usage in CLI: quasar run icon-diet [command]

Common commands:
  start                 Run web-server with GUI
  stop                  Stop web-server with GUI
  scan                  Scan project and add found icons to web-font
  add-icon              Add icons without GUI (accepts multiple names with prefix, e.g., mdi-close. Excludes fa- icons)
  show-fonts            List of fonts used in your project
  show-fonts-available  Lists available fonts
  show-icons            Display icon names used in your project
  rebuildDB             Update source (@quasar/extras and @iconify) and rebuild DB
  help                  Show this help

Notes:
  1. Web GUI uses a free port in the range: devServer.port + (179 to 184).
  2. Adding FontAwesome ('fa-') and custom SVG ('ext-') icons requires the Web GUI.
  3. The 'scan' command uses static analysis and may miss dynamically generated icon names.
`)
  })

  async function doScan(backendPort, isInit = false) {
    console.log(isInit 
        ? '📦 [icon-diet] First run detected. Running initial project scan...' 
        : '🔍 [icon-diet] Scanning project files...'
    )

    const scanResult = await makeRequest({
      ...POST_DEFAULT_OPTIONS,
      port: backendPort,
      path: '/api/scan-files'
    })

    const discoveredIcons = scanResult?.icons || []

    if (discoveredIcons.length === 0) {
      console.log('⚠️ [icon-diet] No icons found during the scan.')
      return
    }

    let finalIconsBatch = discoveredIcons

    if (!isInit) {
      console.log('\n🔄 [icon-diet] Fetching current project icons to prevent overwriting...')
      
      const projectDetails = await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backendPort,
        path: '/api/project-details',
      })

      const currentIcons = projectDetails?.icons || []
      
      const uniqueIconsMap = new Map()
      currentIcons.forEach(icon => uniqueIconsMap.set(`${icon.prefix}:${icon.name}`, icon))
      
      discoveredIcons.forEach(icon => {
        const key = `${icon.prefix}:${icon.name}`
        if (!uniqueIconsMap.has(key)) {
          uniqueIconsMap.set(key, icon)
        }
      })

      finalIconsBatch = Array.from(uniqueIconsMap.values())
    }

    console.log(`📦 [icon-diet] Generating web-font for ${finalIconsBatch.length} total icons...`)
    
    await makeRequest({
      ...POST_DEFAULT_OPTIONS,
      port: backendPort,
      path: '/api/generate'
    }, {
      icons: finalIconsBatch
    })

    console.log(
      isInit 
        ? '✅ [icon-diet] Initial scan completed. Assets generated in "src/idiet/".' 
        : '✅ [icon-diet] Web-font assets updated successfully!'
    )
  }

  async function mergeAndGenerateIcons (backendPort, newIcons) {
    console.log('\n🔄 [icon-diet] Fetching current project icons to prevent overwriting...')
    
    const projectDetails = await makeRequest({
      ...POST_DEFAULT_OPTIONS,
      port: backendPort,
      path: '/api/project-details'
    })

    const currentIcons = projectDetails?.icons || []
    
    const uniqueIconsMap = new Map()
    currentIcons.forEach(icon => uniqueIconsMap.set(`${icon.prefix}:${icon.name}`, icon))
    
    let newlyAddedCount = 0
    newIcons.forEach(icon => {
      const key = `${icon.prefix}:${icon.name}`
      if (!uniqueIconsMap.has(key)) {
        uniqueIconsMap.set(key, icon)
        newlyAddedCount++
      }
    })

    const finalIconsBatch = Array.from(uniqueIconsMap.values())

    console.log(`📦 [icon-diet] Generating web-font for ${finalIconsBatch.length} total icons (${currentIcons.length} existing + ${newlyAddedCount} new)...`)
    
    await makeRequest({
       ...POST_DEFAULT_OPTIONS,
      port: backendPort,
      path: '/api/generate'
    }, {
      icons: finalIconsBatch
    })

    console.log('✅ [icon-diet] Web-font assets updated successfully!')
  }

  function getCleanCliIcons () {
    const cleanTokens = process.argv.filter(arg => {
      if (arg === process.execPath) return false
      if (path.isAbsolute(arg)) return false
      if (arg.includes('/') || arg.includes('\\')) return false
      
      return true
    })

    const { positionals } = parseArgs({ args: cleanTokens, strict: false })

    return positionals
      .flatMap(arg => arg.split(/[\s,]+/))
      .map(img => img.trim().replace(/['"]/g, ''))
      .filter(Boolean)
  }
}
