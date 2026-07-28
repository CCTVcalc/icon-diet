#!/usr/bin/env node

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'
import { execSync } from 'node:child_process'
import { zipSync } from 'fflate'
import { config as defaultConfig } from './config.js'
import { previewTemplate } from './preview.js'
import { buildDatabase } from './buildDB/creatorDB.js'
import { buildIconSets } from './buildDB/creatorIconSet.js'
import { processSvgIcon } from './svg-processor.js'
import { scanProjectFiles, getQuasarIconSet } from './scan-files.js'
import * as utils from './utils.js'
import Busboy from 'busboy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.join(__dirname, '..')
const DB_PATH = path.join(DEFAULT_ROOT, 'data', 'quasar-icons-db.json')
const ICON_SETS_PATH = path.join(DEFAULT_ROOT, 'data', 'quasar-icon-sets.json') 

async function runServer(customConfig = {}) {
  const config = { ...defaultConfig, ...customConfig }
  const isExt = !!config.isExt
  
  const ROOT_DIR = isExt ? process.env.PROJECT_ROOT : DEFAULT_ROOT
  const GUI_DIR = config.guiDir || path.join(DEFAULT_ROOT, 'gui')
  const USER_ICON_PACK = defaultConfig.EXT_PACK.prefix
  const USER_ICON_PACK_DIR = isExt 
      ? path.join(ROOT_DIR, 'src', 'idiet', 'ext-icon') 
      : path.join(ROOT_DIR, 'ext-icon')
  
  if (!isExt) {
    !fs.existsSync(USER_ICON_PACK_DIR) && fs.mkdirSync(USER_ICON_PACK_DIR, { recursive: true })
    !fs.existsSync(path.join(ROOT_DIR, 'out')) && fs.mkdirSync(path.join(ROOT_DIR, 'out'), { recursive: true })
  }
  
  const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  }

  let db = {}
  const ALLOWED_PACKS_DB = {}
  const ICON_CACHE = new Map()
  const ALLOWED_PREFIXES = Object.values(defaultConfig.PACKS)
    .flatMap(category => Object.entries(category))
    .map(([key, pack]) => pack.prefix ?? key)
    .unshift(USER_ICON_PACK)

  let iconSets = []
  const SUPPORT_ICON_SET = defaultConfig.SUPPORT_ICON_SET
  let ICON_SET = defaultConfig.BASE_PACK.iconSet
  if (isExt) {
    if (config.extIconSet && SUPPORT_ICON_SET.includes(config.extIconSet)) ICON_SET = config.extIconSet
    else console.log(`[icon-diet] WARNING: IconSet ${config.extIconSet} from quasar.config.js/.ts is not supported. Falling back to ${defaultConfig.BASE_PACK.iconSet}.`)
  }

  async function initIconCache (onlyUserPacks = false) {
    if (!onlyUserPacks) {
      await buildDatabase()
      await buildIconSets()
    }

    ICON_CACHE.clear()

    if (fs.existsSync(USER_ICON_PACK_DIR)) {
      try {
        const files = fs.readdirSync(USER_ICON_PACK_DIR)
        const userIcons = []

        for (const file of files) {
          if (path.extname(file) === '.svg') {
            const name = path.basename(file, '.svg')
            const filePath = path.join(USER_ICON_PACK_DIR, file)
            const content = fs.readFileSync(filePath, 'utf8')
            const bodyMatch = content.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)

            const fullName = utils.getIconFullName(USER_ICON_PACK, defaultConfig.EXT_PACK.separator, name)
            if (bodyMatch && fullName) {
              userIcons.push({
                fullName,
                prefix: USER_ICON_PACK,
                separator: defaultConfig.EXT_PACK.separator,
                name,
                size: defaultConfig.EXT_PACK.size,
                color: defaultConfig.EXT_PACK.color,
                body: bodyMatch[1],
                search: [name, fullName]
              })
            }
          }
        }

        if (userIcons.length !== 0) userIcons
            .sort((a, b) => (a.fullName).localeCompare(b.fullName)) 
            .forEach(i => ICON_CACHE.set(i.fullName, i))
          
      } catch (e) {
        console.error(e)
      }
    }

    if (!onlyUserPacks && fs.existsSync(DB_PATH)) {
      try {
        const dbContent = fs.readFileSync(DB_PATH, 'utf8')
        db = JSON.parse(dbContent)
      } catch (e) {
        console.error(e)
      }
    }

    if (db) {
      for (const [prefix, pack] of Object.entries(db)) {
        for (const [name, icon] of Object.entries(pack.icons)) {
          const fullName = utils.getIconFullName(prefix, pack.separator, name)
          if (fullName) {
            ICON_CACHE.set(fullName, {
              fullName,
              prefix,
              separator: pack.separator,
              color: pack.color,
              name,
              size: pack.size,
              ...icon,
              search: [...new Set([name, fullName, ...(icon.search || [])])]
            })
          }
        }
      }
    }

    if (!onlyUserPacks && fs.existsSync(ICON_SETS_PATH)) {
      try {
        const iconSetsContent = fs.readFileSync(ICON_SETS_PATH, 'utf8')
        iconSets = JSON.parse(iconSetsContent)
      } catch (e) {
        console.error(e)
      }
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          isExt,
          iconSet: ICON_SET,
          defaultIconSet: defaultConfig.BASE_PACK.iconSet,
          iconSets: Object.keys(iconSets),
          userIconPackName: defaultConfig.EXT_PACK.name
        }))
      }

      if (url.pathname === '/api/search' && req.method === 'POST') {
        let body = []
        req.on('data', chunk => body.push(chunk))
        req.on('end', () => {
          try {
            const { query = '', start = 0, limit = 100, packs = [] } = JSON.parse(Buffer.concat(body).toString())
            const lowerQuery = query.toLowerCase()
            const activePacks = Array.isArray(packs) && packs.length ? packs : ALLOWED_PREFIXES

            const filtered = []

            for (const icon of ICON_CACHE.values()) {
              if (!activePacks.includes(icon.prefix)) continue

              const isMatch = icon.fullName.includes(lowerQuery) || 
                (icon.search && icon.search.some(term => term.includes(lowerQuery)))

              if (isMatch) filtered.push(icon)
            }

            const total = filtered.length
            const icons = filtered.slice(+start, +start + +limit)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ icons, total, hasMore: +start + +limit < total }))
          } catch (e) {
            console.error(e)
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid request' }))
          }
        })
        return
      }

      if (url.pathname === '/api/projects' && req.method === 'GET') {
        const outPath = path.join(ROOT_DIR, 'out')
        const result = []

        if (fs.existsSync(outPath)) {
          const entries = fs.readdirSync(outPath, { withFileTypes: true })

          for (const entry of entries) {
            if (!entry.isDirectory()) continue

            const projectDir = path.join(outPath, entry.name)
            const cssPath = path.join(projectDir, 'idiet', 'idiet.css')
            const metaPath = path.join(projectDir, '.meta.json')

            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            let count = 0
            const unavailableIcons = []
            
            meta.icons.forEach(i => {
              if (ICON_CACHE.get(i)) count++
              else unavailableIcons.push(i)
            })
            
            result.push({
              name: entry.name,
              basePack: meta.basePack,
              packs: meta.packs,
              count,
              unavailableCount: unavailableIcons.length,
              unavailableIcons
            })
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(result))
      }

      if (url.pathname === '/api/project-details' && req.method === 'POST') {
        let body = []
        req.on('data', chunk => body.push(chunk))
        req.on('end', () => {
          try {
            let metaPath

            if (isExt) {
              metaPath = path.join(ROOT_DIR, 'src', 'idiet', '.meta.json')
            } else {
              const payload = JSON.parse(Buffer.concat(body).toString() || '{}')
              if (!payload.folderName) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ error: 'folderName is required' }))
              }
              metaPath = path.join(ROOT_DIR, 'out', payload.folderName, '.meta.json')
            }

            if (!fs.existsSync(metaPath)) {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              return res.end(JSON.stringify({ error: 'Project file(s) not found!' }))
            }

            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            if (!isExt) ICON_SET = meta.basePack

            const icons = []
            const notFoundIcons = []
            
            meta.icons.forEach(i => {
              const icon = ICON_CACHE.get(i)
              if (icon) icons.push(icon)
              else notFoundIcons.push(i)
            })

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ icons, notFoundIcons, iconSet: ICON_SET }))
          } catch (e) {
            console.error(e)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Failed to process project details' }))
          }
        })
        return
      }

      if (url.pathname === '/api/set-iconset' && req.method === 'POST') {
        try {
          let rawBody = ''
          for await (const chunk of req) rawBody += chunk

          const payload = JSON.parse(rawBody || '{}')
          
          if (payload?.iconSet) ICON_SET = payload.iconSet

          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ iconSet: ICON_SET }))

        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Invalid JSON payload' }))
        }
      }

      if (url.pathname === '/api/base-icons' && req.method === 'GET') {
        const baseIcons = utils.getIconsData(iconSets[ICON_SET], ICON_CACHE).icons
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(baseIcons))
      }

      if (url.pathname === '/api/packs' && req.method === 'GET') {
        const result = []

        const configPacks = Object.values(config.PACKS).flatMap(group => Object.entries(group))

        configPacks.forEach(([configKey, packConfig]) => {
          const targetPrefix = packConfig.prefix || configKey
          
          const dbKey = Object.keys(db).find(
            key => key === targetPrefix || db[key]?.key === configKey || key === configKey
          )

          if (!dbKey) return
          const packData = db[dbKey]

          result.push({
            id: dbKey,
            key: packData.key,
            name: packData.title,
            author: packData.author,
            separator: packData.separator,
            count: packData.count || 0,
            license: packData.license?.title,
            version: packData.version,
            color: packData.color,
            source: packData.source
          })
        })

        let userExtIconCount = 0
        for (const icon of ICON_CACHE.values()) {
          if (icon.prefix === USER_ICON_PACK) userExtIconCount++
        }

        if (userExtIconCount > 0 || fs.existsSync(USER_ICON_PACK_DIR)) {
          result.unshift({ 
            id: USER_ICON_PACK, 
            ...config.EXT_PACK,
            count: userExtIconCount
          })
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(result))
      }

      if (url.pathname === '/api/generate' && req.method === 'POST') {
        let body = []
        req.on('data', chunk => body.push(chunk))
        req.on('end', async () => {
          try {
            const parsedBody = JSON.parse(Buffer.concat(body).toString())
            const icons = parsedBody.icons || []
            const projectPath = isExt ? ROOT_DIR : (parsedBody.projectPath || ROOT_DIR)

            const baseIcons = iconSets[ICON_SET]
            const iconsToBuild = [...new Set([...baseIcons, ...icons])]
              .map(i => ICON_CACHE.get(i))

            const { base64Css, fileLinksCss, woff2Buffer, uniquePrefixes, codepoints } = await utils.buildFontAndCss(iconsToBuild)

            const README_BUFFER = fs.readFileSync(path.join(__dirname, 'templates', 'readme.txt'))
            const BOOT_BUFFER = fs.readFileSync(path.join(__dirname, 'templates', 'idiet-boot.js'))
            const mapFnFileContent = utils.generateIconMapFnContent(uniquePrefixes)

            const userHtmlCards = []
            const baseHtmlCards = []

            Object.keys(codepoints).forEach(iconKeyName => {
              const isBase = baseIcons.includes(iconKeyName)

              let displayIconName = iconKeyName

              if (iconKeyName.startsWith('fa-')) {
                const n = iconKeyName.slice('fa-'.length)

                const [style, clearName] = n.split('$')
                const extraClass = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' }[style]
                displayIconName = `${extraClass} fa-${clearName}`
              }

              const fixMat = n => n.startsWith('mat_') ? n.slice('mat_'.length) : n

              const cardHtml = `
    <div class="card-icon-item" onclick="copyClass('${fixMat(displayIconName)}')" title="${fixMat(displayIconName)}">
      <div class="card-icon-wrapper">
        <i class="q-icon ${displayIconName}"></i>
      </div>
      <div class="card-icon-info">
        <span class="card-icon-fullname">${fixMat(displayIconName)}</span>
      </div>
    </div>`

              if (isBase) baseHtmlCards.push(cardHtml)
              else userHtmlCards.push(cardHtml)
            })

            const previewHtml = previewTemplate(isExt)
              .replace('<!-- UserIconsGrid -->', userHtmlCards.join(''))
              .replace('<!-- BaseIconsGrid -->', baseHtmlCards.join(''))

            const metaData = JSON.stringify(Object.assign(
              isExt ? {} : { basePack: ICON_SET},
              {
                packs: uniquePrefixes,
                icons
              }
            ))
            
            if (isExt) {
              const currentProjectDir = projectPath
              if (!currentProjectDir) {
                throw new Error('projectPath is required for extension mode')
              }

              const targetIdietDir = path.join(currentProjectDir, 'src', 'idiet')
              fs.mkdirSync(targetIdietDir, { recursive: true })

              fs.writeFileSync(path.join(targetIdietDir, 'idiet.css'), base64Css, 'utf8')
              fs.writeFileSync(path.join(targetIdietDir, 'idietIconMapFn.js'), mapFnFileContent, 'utf8')
              fs.writeFileSync(path.join(targetIdietDir, 'idiet-boot.js'), BOOT_BUFFER)
              fs.writeFileSync(path.join(targetIdietDir, 'preview.html'), previewHtml, 'utf8')
              fs.writeFileSync(path.join(targetIdietDir, '.meta.json'), metaData, 'utf8')
              fs.writeFileSync(path.join(targetIdietDir, 'DONT_EDIT_IN_DIR.txt'),
                'Files in the "idiet" folder are automatically generated. \n Do not attempt to modify them manually.\n',
                'utf8'
              )

              res.writeHead(200, { 'Content-Type': 'application/json' })
              return res.end(JSON.stringify({ success: true, mode: 'ext' }))
            } else {
              const now = new Date()
              const folderName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`
              const targetDir = path.join(ROOT_DIR, 'out', folderName)
              const fontsDir = path.join(targetDir, 'fonts')
              const idietDir = path.join(targetDir, 'idiet')
              
              fs.mkdirSync(fontsDir, { recursive: true })
              fs.mkdirSync(idietDir, { recursive: true })

              fs.writeFileSync(path.join(targetDir, 'readme.txt'), README_BUFFER, 'utf8')
              fs.writeFileSync(path.join(targetDir, 'preview.html'), previewHtml, 'utf8')
              fs.writeFileSync(path.join(targetDir, '.meta.json'), metaData, 'utf8')

              fs.writeFileSync(path.join(idietDir, 'idiet.css'), base64Css, 'utf8')
              fs.writeFileSync(path.join(idietDir, 'idietIconMapFn.js'), mapFnFileContent, 'utf8')
              fs.writeFileSync(path.join(idietDir, 'idiet-boot.js'), BOOT_BUFFER)

              fs.writeFileSync(path.join(fontsDir, 'idiet.woff2'), woff2Buffer)
              fs.writeFileSync(path.join(fontsDir, '_idiet.css'), fileLinksCss, 'utf8')

              const zippedData = zipSync({
                'idiet/idiet.css': Buffer.from(base64Css, 'utf8'),
                'idiet/idiet-boot.js': BOOT_BUFFER,
                'idiet/idietIconMapFn.js': Buffer.from(mapFnFileContent, 'utf8'),
                'preview.html': Buffer.from(previewHtml, 'utf8'),
                'readme.txt': README_BUFFER,
                'fonts/idiet.woff2': woff2Buffer,
                'fonts/_idiet.css': Buffer.from(fileLinksCss, 'utf8')
              })

              const zipPath = path.join(targetDir, 'idiet.zip')
              fs.writeFileSync(zipPath, zippedData)

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true, folder: folderName }))
            }
          } catch (e) {
            console.error(e)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Generation failed: ' + e.message }))
          }
        })
        return
      }
      
      if (url.pathname === '/api/check-icons' && req.method === 'POST') {
        let body = []
        req.on('data', chunk => body.push(chunk))
        req.on('end', () => {
          try {
            let { iconNames } = JSON.parse(Buffer.concat(body).toString())
            
            if (typeof iconNames === 'string') iconNames = [iconNames]

            if (!iconNames || !Array.isArray(iconNames)) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              return res.end(JSON.stringify({ error: 'iconNames must be an array of strings or a single string' }))
            }

            const icons = utils.getIconsData(iconNames, ICON_CACHE)
            const invalidIcons = icons.invalidIcons
            const approved = icons.icons.map(i => i.fullName)
            const iconsToGenerate = [...approved]
            const rejected = []
            
            // for user input mat icons as "close" or "o_close"
            invalidIcons.forEach(i => {
              const icon = ICON_CACHE.get('mat_' + i)
              if (icon) {
                approved.push(i)
                iconsToGenerate.push('mat_' + i)
              } else {
                rejected.push(i)
              }
            })

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ 
              success: true, 
              approved, 
              rejected, 
              iconsToGenerate: [...new Set(iconsToGenerate)] 
            }))

          } catch (e) {
            console.error(e)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ error: 'Failed to check icons: ' + e.message }))
          }
        })
        return
      }

      if (url.pathname === '/api/upload' && req.method === 'POST') {
        const busboy = Busboy({ headers: req.headers })
        
        const processed = []
        const errors = []
        const filePromises = []

        busboy.on('file', (name, file, info) => {
          const { filename } = info
          
          if (!filename.toLowerCase().endsWith('.svg')) {
            errors.push({ file: filename, reason: 'Only SVG files!' })
            file.resume()
            return
          }

          let svgContent = ''
          file.on('data', (chunk) => {
            svgContent += chunk.toString('utf8')
          })

          const filePromise = new Promise((resolve) => {
            file.on('end', () => {
              try {
                const cleanContent = processSvgIcon(svgContent)

                const safeName = path.basename(filename, '.svg')
                  .toLowerCase()
                  .replace(/[^a-zA-Z0-9_-]/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '')

                const finalFilename = `${safeName}.svg`
                const targetPath = path.join(USER_ICON_PACK_DIR, finalFilename)

                const isUpdate = fs.existsSync(targetPath)

                const fullSvgFileContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${cleanContent}</svg>`
                fs.writeFileSync(targetPath, fullSvgFileContent, 'utf8')

                const separator = defaultConfig.EXT_PACK.separator
                const fullName = utils.getIconFullName(USER_ICON_PACK, separator, safeName)

                ICON_CACHE.set(fullName, {
                  prefix: USER_ICON_PACK,
                  size: defaultConfig.EXT_PACK.size,
                  separator,
                  name: safeName,
                  fullName,
                  body: cleanContent,
                  search: [safeName, fullName]
                })

                processed.push({ 
                  file: filename, 
                  name: safeName, 
                  status: isUpdate ? 'updated' : 'created' 
                })
              } catch (err) {
                errors.push({ file: filename, reason: err.message })
              } finally {
                resolve()
              }
            })
          })

          filePromises.push(filePromise)
        })

        busboy.on('finish', async () => {
          await Promise.all(filePromises)
          await initIconCache(true)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ processed, errors }))
        })

        req.pipe(busboy)
        return
      }

      if (url.pathname === '/api/scan-files' && req.method === 'POST') {
        let body = []
        let iconSetStatus = 'success'

        req.on('data', chunk => body.push(chunk))
        req.on('end', async () => {
          try {
            const rawBody = Buffer.concat(body).toString()
            const payload = rawBody ? JSON.parse(rawBody) : {}
            const projectPath = isExt ? ROOT_DIR : (payload.projectPath || ROOT_DIR)

            if (!isExt) {
              const scanIconSet = await getQuasarIconSet(projectPath)
              if (SUPPORT_ICON_SET.includes(scanIconSet)) {
                ICON_SET = scanIconSet
              } else {
                ICON_SET = defaultConfig.BASE_PACK.iconSet
                iconSetStatus = 'fail'
              }
            }

            const baseIconPack = {
              prefix: defaultConfig.PACKS.quasar[ICON_SET]?.prefix || 'mat',
              baseIconsName: iconSets[ICON_SET] ?? []
            }

            const results = await scanProjectFiles({
              projectPath,
              isExt,
              rootDir: ROOT_DIR,
              dbPath: DB_PATH,
              iconCache: ICON_CACHE,
              config: defaultConfig,
              baseIconPack
            })

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              icons: results.icons.filter(i => !iconSets[ICON_SET].includes(i.fullName)),
              iconSet: ICON_SET,
              iconSetStatus
            }))
          } catch (e) {
            console.error(e)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: e.message }))
          }
        })
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Not Found' }))
    }

    if (url.pathname.startsWith('/out/')) {
      const filePath = path.join(ROOT_DIR, url.pathname)
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          return res.end('404 Not Found')
        }
        const ext = path.extname(filePath)
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
        fs.createReadStream(filePath).pipe(res)
      })
      return
    }

    if (url.pathname === '/api/update-packages' && req.method === 'POST') {
      try {
        const pkgPath = path.join(DEFAULT_ROOT, 'package.json')
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        const iconifyDeps = Object.keys(pkg.dependencies || {})
          .filter(dep => dep.startsWith('@iconify-json/'))
        
        const packagesToUpdate = ['@quasar/extras', ...iconifyDeps].join(' ')
        
        if (packagesToUpdate.trim()) {
          let updateCmd = `npm update ${packagesToUpdate}`
          
          if (fs.existsSync(path.join(DEFAULT_ROOT, 'yarn.lock'))) {
            updateCmd = `yarn upgrade ${packagesToUpdate}`
          } else if (fs.existsSync(path.join(DEFAULT_ROOT, 'pnpm-lock.yaml'))) {
            updateCmd = `pnpm update ${packagesToUpdate}`
          } else if (fs.existsSync(path.join(DEFAULT_ROOT, 'bun.lockb')) || fs.existsSync(path.join(DEFAULT_ROOT, 'bun.lock'))) {
            updateCmd = `bun update ${packagesToUpdate}`
          }

          execSync(updateCmd, { stdio: 'ignore' })
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ success: true, message: 'Packages updated successfully' }))
      } catch (e) {
        console.error(e)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Failed to update packages: ' + e.message }))
      }
    }

    if (url.pathname === '/api/rebuild-database' && req.method === 'POST') {
      try {
        await buildDatabase(true)
        await buildIconSets(true)
        await initIconCache()

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ success: true, message: 'Database rebuilt successfully' }))
      } catch (e) {
        console.error(e)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Failed to rebuild database: ' + e.message }))
      }
    }

    let filePath = path.join(GUI_DIR, url.pathname === '/' ? 'index.html' : url.pathname)
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        return res.end('404 Not Found')
      }
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
      fs.createReadStream(filePath).pipe(res)
    })
  })

  await initIconCache()

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') process.exit(1)
    if (!isExt) console.error('[icon-diet] Server error:', err)
  })

  server.listen(config.port, () => {
    if (!isExt) console.log(`Server running at http://localhost:${config.port}`)
    if (process.send) process.send({ status: 'ready' })
  })
}

if (process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('icon-diet'))) {
  await runServer({
    isExt: process.env.IS_EXTENSION === 'true',
    extIconSet: process.env.EXT_ICON_SET,
    port: process.env.PORT ? Number(process.env.PORT) : defaultConfig.port,
    rootDir: process.env.PROJECT_ROOT
  })
}