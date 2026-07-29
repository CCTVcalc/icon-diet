import { fork } from 'child_process'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { executeBackendCommand, makeRequest } from './utils.js'
import { parseArgs } from 'node:util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

export default function (api) {
  const idietFolder = path.join(api.appDir, 'src/idiet')
  let quasarConf = null
  const backendEnv = {
    ...process.env,
    IS_EXTENSION: 'true',
    EXT_ICON_SET: null,
    PROJECT_ROOT: api.appDir
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

    backendEnv.EXT_ICON_SET = conf.framework?.iconSet || 'material-icons'

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
      console.error('\n\n🟡 [icon diet] WARNING!')
      
      if (activeViolations.length > 0) {
        console.error(`You have included standard fonts in 'extras': [${activeViolations.join(', ')}].`)
        console.error('SOLUTION: Comment out or remove them from the "extras" section in "quasar.config.js/.ts".')
      }
      
      if (hasCustomMapFn) {
        console.error('\nYou defined "framework.iconMapFn" directly in "quasar.config.js/.ts".')
        console.error('Icon Diet automatically injects the mapping via its own boot file.')
        console.error('SOLUTION: Remove the "framework.iconMapFn" property from your Quasar configuration.')
        console.error('If you need custom rules, edit the "src/idiet/idietIconMapFn.js" file instead.')
      }
    }

    conf.boot.push('~/src/idiet/idiet-boot.js')
  })

  api.registerCommand('start', async () => {
    const binPath = require.resolve('icon-diet-core/bin/index.js')
    const basePort = (quasarConf?.devServer?.port || 9000) + 179
    const MAX_RETRIES = 5

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const guiPort = basePort + attempt

      const child = fork(binPath, [], {
        cwd: api.appDir,
        env: { ...backendEnv, PORT: guiPort },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc']
      })

      const isReady = await new Promise((resolve) => {
        child.on('message', function listener(msg) {
          if (msg && msg.status === 'ready') {
            child.off('message', listener)
            resolve(true)
          }
        })

        child.once('exit', () => resolve(false))
      })

      if (isReady) {
        console.log(`\n🚀 [icon-diet] Web GUI is successfully running at: http://localhost:${guiPort}`)
        console.log(`💡 Press Ctrl+C to stop the Web GUI.\n`)

        const extIconFolder = path.join(idietFolder, 'ext-icon')
        if (!fs.existsSync(extIconFolder)) fs.mkdirSync(extIconFolder, { recursive: true })

        const cleanup = () => {
          if (!child.killed) child.kill('SIGKILL')
          process.exit()
        }

        process.on('SIGINT', cleanup)
        process.on('SIGTERM', cleanup)

        return new Promise(() => {})
      }

      try { child.kill('SIGKILL') } catch (_) {}
      await new Promise(r => setTimeout(r, 200))

      console.log(`🟡 [icon-diet] Port ${guiPort} is busy. Trying next one...`)
    }
    console.error('🔴 [icon-diet] Could not find an available port for Web GUI.')
  })

  api.registerCommand('scan', async () => {
    let backend
    try {
      backend = await executeBackendCommand(backendEnv)
      await doScan(backend.port, false)
    } catch (e) {
      console.error('🔴 [icon-diet] Scan command failed:', e.message)
    } finally {
      if (backend) backend.kill()
    }
  })

  api.registerCommand('add-icon', async () => {
    const rawIcons = getCleanCliIcons()
    
    console.log('[icon-diet] Detected incoming icons:', rawIcons)
    console.log('💡 fa- icons must use the fa-truncated_prefix$name format (e.g., fa-fas$user, fa-fab$aws).')
    if (rawIcons.length === 0) {
      console.log('🔴 [icon-diet] Please specify icons. Example: quasar run icon-diet add-icon mdi-close bi-alarm mdi-home')
      return
    }

    const candidates = [...new Set(rawIcons)]

    if (candidates.length === 0) {
      console.log('🟡 No suitable candidates found for validation.')
      return
    }

    let backend
    try {
      backend = await executeBackendCommand(backendEnv)
      console.log(`🔍 Checking candidates (${candidates.length} pcs)...`)
      
      const { approved, rejected, iconsToGenerate } = await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/check-icons'
      }, {
        iconNames: candidates
      })

      console.log('\n=== CHECK RESULTS ===')
      if (approved.length > 0) console.log(`\n✅ VALID (${approved.length}):\n${approved.map(i => `  - ${i}`).join('\n')}`)
      if (rejected.length > 0) console.log(`\n🔴 INVALID (${rejected.length}):\n${rejected.map(i => `  - ${i}`).join('\n')}`)
      console.log('\n=====================')

      if (iconsToGenerate.length === 0) {
        console.log('\n🟡 Generation skipped because no valid icons were found.')
        return
      }

      await mergeAndGenerateIcons(backend.port, iconsToGenerate)

    } catch (e) {
      console.log('🔴 Icon addition processing error:', e.message || e)
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
      console.log('🔴 [icon-diet] Error:', e.message || e)
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
      
      ;['@quasar/extras', 'iconify'].forEach(source => {
        console.log(`\n from ${source}:`)
        packs
          ?.filter(p => p.source === source)
          .forEach(pack => {
            console.log(`   - ${pack.id}: ${pack.name} /${pack.count}/${pack.license ? (' ' + pack.license) : ''}${pack.version && pack.version !== '0.0.0' ? ' v' + pack.version : ''}`)
          })
      })
      console.log('')

    } catch (e) {
      console.log('🔴 [icon-diet] Error:', e.message || e)
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
      console.log('🔴 [icon-diet] Error:', e.message || e)
    } finally {
      if (backend) backend.kill()
    }
  })

  api.registerCommand('rebuildDB', async () => {
    let backend
    console.log('[icon-diet] Updating database...')

    try {
      backend = await executeBackendCommand(backendEnv)

      await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/update-packages'
      })
      console.log('✅ Icon packages updated successfully.')

      await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/rebuild-database'
      })
      console.log('✅ Database rebuilt successfully.')

    } catch (e) {
      console.log('🔴 [icon-diet] Process error:', e.message || e)
    } finally {
      if (backend) backend.kill()
    }
  })

  api.registerCommand('help', () => {
    console.log(`💡 [icon diet] Usage in CLI: quasar run icon-diet [command]

Common commands:
  start                 Run web-server with GUI
  scan                  Scan project and add found icons to web-font
  add-icon              Add icons without GUI (accepts multiple names with prefix, e.g., mdi-close. Excludes fa- icons)
  show-fonts            List of fonts used in your project
  show-fonts-available  Lists available fonts
  show-icons            Display icon names used in your project
  rebuildDB             Update source (@quasar/extras and iconify) and rebuild DB
  help                  Show this help

Notes:
  1. Web GUI uses a free port in the range: devServer.port + (179 to 184).
  2. Adding FontAwesome ('fa-') and custom SVG ('ext-') icons requires the Web GUI.
  3. The 'scan' command uses static analysis and may miss dynamically generated icon names.
`)
  })

  async function doScan (backendPort, isInit = false) {
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
      console.log('🟡 No icons found during the scan.')
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

      const currentIcons = projectDetails?.icons.map(i => i.fullName) || []
      
      finalIconsBatch = Array.from(new Set([...currentIcons, ...discoveredIcons]))
    }

    console.log(`📦 Generating web-font for ${finalIconsBatch.length} total icons...`)
    
    await makeRequest({
      ...POST_DEFAULT_OPTIONS,
      port: backendPort,
      path: '/api/generate'
    }, {
      icons: finalIconsBatch
    })

    console.log( isInit 
        ? '✅ Initial scan completed. Assets generated in "src/idiet/".' 
        : '✅ Web-font assets updated successfully!'
    )
  }

  async function mergeAndGenerateIcons (backendPort, newIcons = []) {
    const projectDetails = await makeRequest({
      ...POST_DEFAULT_OPTIONS,
      port: backendPort,
      path: '/api/project-details'
    })

    const currentIcons = projectDetails?.icons?.map(i => i.fullName) || []

    const currentSet = new Set(currentIcons)

    const newlyAddedIcons = newIcons.filter(icon => !currentSet.has(icon))
    const newlyAddedCount = newlyAddedIcons.length

    if (newlyAddedCount === 0 && currentIcons.length > 0) {
      console.log('📦 [icon-diet] No new icons detected. Skipping generation.')
      return
    }

    const finalIconsBatch = [...currentIcons, ...newlyAddedIcons]

    console.log(`📦 [icon-diet] Generating web-font for ${finalIconsBatch.length} total icons (${currentIcons.length} existing + ${newlyAddedCount} new)...`)

    await makeRequest({
      ...POST_DEFAULT_OPTIONS,
      port: backendPort,
      path: '/api/generate'
    }, {
      icons: finalIconsBatch
    })

    console.log('✅ Web-font assets updated successfully!')
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
