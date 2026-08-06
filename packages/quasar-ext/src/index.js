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

let configPort = 9000

export default function (api) {
  const backendEnv = {
    ...process.env,
    IS_EXTENSION: 'true',
    EXT_ICON_SET: 'material-icons', // default Quasar value
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
  
  const withSyncConfig = (fn) => async () => { await syncQuasarConfig(); await fn() }

  api.extendQuasarConf(onQuasarConfUpdate)
  api.registerCommand('start', withSyncConfig(onStartGUI))
  api.registerCommand('scan', withSyncConfig(runScan))
  api.registerCommand('add-icon', withSyncConfig(onAddIcon))
  api.registerCommand('show-fonts', withSyncConfig(onShowFonts))
  api.registerCommand('show-fonts-available', onShowAvailableFonts)
  api.registerCommand('show-icons', withSyncConfig(onShowIcons))
  api.registerCommand('rebuildDB', onRebuildDB)
  api.registerCommand('help', onShowHelp)

  async function onQuasarConfUpdate (conf) {
    const bootFilePath = path.join(api.appDir, 'src/idiet/idiet-boot.js')
    
    if (fs.existsSync(bootFilePath)) conf.boot.push('~/src/idiet/idiet-boot.js')
    else console.log('[icon diet] WARNING! Boot file not found!')

    const activeViolations = conf.extras?.filter(item => appPacks.includes(item)) || []
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
  }

  async function syncQuasarConfig () {
    const QuasarConfigFile = require('@quasar/app-vite/lib/quasar-config-file')
    const quasarConfFile = new QuasarConfigFile({ ctx: api.ctx })
    const config = await quasarConfFile.get()
    
    const configIconSet = config.framework?.iconSet
    if (appPacks.includes(configIconSet)) backendEnv.EXT_ICON_SET = configIconSet
    else {
      backendEnv.EXT_ICON_SET = 'material-icons'
      if (configIconSet) console.log(`[icon-diet] WARNING! IconSet ${configIconSet} not supported!`)
    }

    configPort = config.devServer?.port || configPort
  }
  
  async function onStartGUI () {
    const binPath = require.resolve('icon-diet-core/bin/index.js')
    const basePort = (configPort || 9000) + 179
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
  }

  async function runScan () {
    let backend

    try {
      backend = await executeBackendCommand(backendEnv)
      console.log('🔍 [icon-diet] Scanning project files...')

      const scanResult = await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/scan-files'
      })

      const discoveredIcons = scanResult?.icons.map(i => i.fullName) || []

      if (discoveredIcons.length === 0) {
        console.log('🟡 No icons found during the scan.')
        return
      }

      console.log('\n🔄 [icon-diet] Fetching current project icons...')
      
      const projectDetails = await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/project-details',
      })

      const currentIcons = projectDetails?.icons.map(i => i.fullName) || []
      
      const finalIconsBatch = Array.from(new Set([...currentIcons, ...discoveredIcons]))

      console.log(`📦 Generating web-font for ${finalIconsBatch.length} total icons...`)
      
      await makeRequest({
        ...POST_DEFAULT_OPTIONS,
        port: backend.port,
        path: '/api/generate'
      }, {
        icons: finalIconsBatch
      })

      console.log('✅ Web-font updated')
    } catch (e) {
      console.error('🔴 [icon-diet] Scan command failed:', e.message)
    } finally {
      if (backend) backend.kill()
    }
  }
  
  async function onAddIcon () {
    const rawIcons = getCleanCliIcons()
    
    console.log('[icon-diet] Detected incoming icons:', rawIcons)
    console.log(`💡 fa- names must be in single quotes and use the fa-truncated_prefix$name format (e.g., 'fa-fas$user', 'fa-fab$aws').`)
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
  }
  
  // HELPER FOR ADD-ICONS
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

  // HELPER FOR ADD-ICONS
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
  
  async function onShowFonts () {
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
  }

  async function onShowAvailableFonts () {
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
  }
   
  async function onShowIcons () {
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
  }
  
  async function onRebuildDB () {
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
  }
  
  function onShowHelp () {
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
  }
}
