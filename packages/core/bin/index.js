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
import { scanProjectFiles } from './scan-files.js'
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
  const USER_ICON_PACK_DIR = config.userIconPackDir || (
    isExt 
      ? path.join(ROOT_DIR, 'src', 'idiet', 'ext-icon') 
      : path.join(ROOT_DIR, 'ext-icon')
  )
  const OUT_DIR = path.join(ROOT_DIR, 'out')
  let db = {}
  let iconSets = []

  const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  }

  const ALLOWED_PACKS_DB = {}
  const ICON_CACHE = []

  async function initIconCache () {
    await buildDatabase()
    await buildIconSets()
    ICON_CACHE.length = 0
    Object.keys(ALLOWED_PACKS_DB).forEach(key => delete ALLOWED_PACKS_DB[key])

    if (fs.existsSync(USER_ICON_PACK_DIR)) {
      try {
        const files = fs.readdirSync(USER_ICON_PACK_DIR)
        for (const file of files) {
          if (path.extname(file) === '.svg') {
            const name = path.basename(file, '.svg')
            const filePath = path.join(USER_ICON_PACK_DIR, file)
            const content = fs.readFileSync(filePath, 'utf8')
            const bodyMatch = content.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
            if (bodyMatch) {
              ICON_CACHE.push({
                ...defaultConfig.EXT_PACK,
                name,
                body: bodyMatch[1],
                search: [name]
              })
            }
          }
        }
      } catch (e) {
        console.error(e)
      }
    }

    if (fs.existsSync(DB_PATH)) {
      try {
        const dbContent = fs.readFileSync(DB_PATH, 'utf8')
        db = JSON.parse(dbContent)
        for (const [prefix, pack] of Object.entries(db)) {
          ALLOWED_PACKS_DB[prefix] = pack
          
          for (const [name, icon] of Object.entries(pack.icons)) {
            ICON_CACHE.push({
              prefix,
              name,
              ...icon,
              search: icon.search || [name]
            })
          }
        }
      } catch (e) {
        console.error(e)
      }
    }

    if (fs.existsSync(ICON_SETS_PATH)) {
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
        return res.end(JSON.stringify({ isExt }))
      }

      if (url.pathname === '/api/current-icons' && req.method === 'GET') {
        const currentIconsMeta = utils.parseCurrentCss({
          isExt,
          rootDir: ROOT_DIR,
          outDir: OUT_DIR,
          allowedPacksDb: ALLOWED_PACKS_DB,
          userIconPack: USER_ICON_PACK
        }).map(icon => ({
          prefix: icon.prefix,
          name: icon.name
        }))
        
        const results = utils.getCurrentIcons({
          currentIconsMeta,
          db,
          iconCache: ICON_CACHE,
          config: defaultConfig,
          userIconPack: USER_ICON_PACK
        })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ icons: results }))
      }

      if (url.pathname === '/api/search' && req.method === 'POST') {
        let body = []
        req.on('data', chunk => body.push(chunk))
        req.on('end', () => {
          try {
            const { query = '', start = 0, limit = 100, packs = [] } = JSON.parse(Buffer.concat(body).toString())
            const lowerQuery = query.toLowerCase()
            const activePacks = Array.isArray(packs) && packs.length ? packs : Object.keys(ALLOWED_PACKS_DB).concat([USER_ICON_PACK])

            let filtered = ICON_CACHE.filter(icon => {
              if (!activePacks.includes(icon.prefix)) return false

              const currentPrefix = icon.prefix.toLowerCase()
              const currentName = icon.name.toLowerCase()
              
              const separator = icon.prefix === USER_ICON_PACK
                ? defaultConfig.EXT_PACK.separator
                : (ALLOWED_PACKS_DB[icon.prefix]?.separator || '')

              const fullName = `${currentPrefix}${separator}${currentName}`

              if (separator !== '' && lowerQuery.includes(separator)) {
                return fullName.includes(lowerQuery)
              }

              if (currentPrefix.startsWith(lowerQuery)) {
                return true
              }

              return currentName.includes(lowerQuery) || icon.search.some(term => term.includes(lowerQuery))
            })

            const seen = new Set()
            filtered = filtered.filter(icon => {
              const key = `${icon.prefix}:${icon.name}`
              return seen.has(key) ? false : seen.add(key)
            })

            const total = filtered.length
            const sliced = filtered.slice(+start, +start + +limit)

            const icons = sliced.map(icon => {
              if (icon.prefix === USER_ICON_PACK) {
                return {
                  ...icon,
                  width: defaultConfig.EXT_PACK.size,
                  height: defaultConfig.EXT_PACK.size,
                  color: defaultConfig.EXT_PACK.color,
                  separator: defaultConfig.EXT_PACK.separator
                }
              }

              const packMeta = ALLOWED_PACKS_DB[icon.prefix]
              return {
                ...icon,
                width: packMeta.size,
                height: packMeta.size,
                color: packMeta.color,
                separator: packMeta.separator
              }
            })

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

      if (url.pathname === '/api/check-icon' && req.method === 'POST') {
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

            const allowedPrefixes = Object.keys(db).concat([USER_ICON_PACK])
            const sortedPrefixes = [...allowedPrefixes].sort((a, b) => b.length - a.length)

            const results = {}

            for (const iconName of iconNames) {
              if (typeof iconName !== 'string') continue

              let matchedPrefix = ''
              let matchedName = ''

              for (const prefix of sortedPrefixes) {
                if (iconName.startsWith(`${prefix}${db[prefix]?.separator || '-'}`)) {
                  matchedPrefix = prefix
                  matchedName = iconName.slice(prefix.length + 1)
                  break
                }
              }

              if (!matchedPrefix) {
                results[iconName] = null
                continue
              }

              if (matchedPrefix === USER_ICON_PACK) {
                const svgPath = path.join(USER_ICON_PACK_DIR, `${matchedName}.svg`)
                if (fs.existsSync(svgPath)) {
                  try {
                    const svgContent = fs.readFileSync(svgPath, 'utf8')
                    const bodyMatch = svgContent.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
                    
                    results[iconName] = {
                      prefix: matchedPrefix,
                      name: matchedName,
                      body: bodyMatch ? bodyMatch[1] : ''
                    }
                  } catch {
                    results[iconName] = null
                  }
                } else {
                  results[iconName] = null
                }
              } else {
                const dbPack = db[matchedPrefix]
                const dbIcon = dbPack?.icons?.[matchedName]

                if (dbIcon) {
                  const resultIcon = {
                    prefix: matchedPrefix,
                    name: matchedName,
                    body: dbIcon.body || ''
                  }

                  if (dbIcon.extraClass) {
                    resultIcon.extraClass = dbIcon.extraClass
                  }

                  results[iconName] = resultIcon
                } else {
                  results[iconName] = null
                }
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ success: true, icons: results }))

          } catch (e) {
            console.error(e)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ error: 'Failed to check icons: ' + e.message }))
          }
        })
        return
      }

      if (url.pathname === '/api/icon' && req.method === 'POST') {
        let body = []
        req.on('data', chunk => body.push(chunk))
        req.on('end', async () => {
          try {
            const payload = JSON.parse(Buffer.concat(body).toString())
            const icons = Array.isArray(payload) ? payload : [payload]
            const results = []

            for (const item of icons) {
              if (!item.prefix || !item.name) {
                results.push({ error: true })
                continue
              }

              if (item.prefix === USER_ICON_PACK) {
                try {
                  const svgBody = fs.readFileSync(path.join(USER_ICON_PACK_DIR, `${item.name}.svg`), 'utf8')
                  results.push({ 
                    prefix: item.prefix, 
                    name: item.name, 
                    body: svgBody, 
                    width: defaultConfig.EXT_PACK.size, 
                    height: defaultConfig.EXT_PACK.size, 
                    color: defaultConfig.EXT_PACK.color,
                    separator: defaultConfig.EXT_PACK.separator
                  })
                } catch {
                  results.push({ prefix: item.prefix, name: item.name, error: true })
                }
              } else {
                const dbPack = db[item.prefix]
                const dbIcon = dbPack?.icons?.[item.name]

                if (!dbIcon) {
                  results.push({ prefix: item.prefix, name: item.name, error: true })
                  continue
                }

                results.push({
                  prefix: item.prefix, 
                  name: item.name, 
                  body: dbIcon.body || '',
                  width: dbPack.size,
                  height: dbPack.size,
                  color: dbPack.color,
                  separator: dbPack.separator
                })
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results))
          } catch {
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
          const dirs = fs.readdirSync(outPath).filter(file => fs.statSync(path.join(outPath, file)).isDirectory())
          for (const dir of dirs) {
            const cssFile = path.join(outPath, dir, 'idiet', 'idiet.css')
            let count = 0
            const projectPacks = new Set()
            const unavailableIcons = []

            if (fs.existsSync(cssFile)) {
              const parsedIcons = utils.parseCurrentCss({
                cssPath: cssFile,
                allowedPacksDb: ALLOWED_PACKS_DB,
                userIconPack: USER_ICON_PACK
              })

              for (const icon of parsedIcons) {
                count++
                const existsInCache = ICON_CACHE.some(c => c.prefix === icon.prefix && c.name === icon.name)
                if (existsInCache) {
                  projectPacks.add(icon.prefix)
                } else {
                  unavailableIcons.push(icon.fullClassName)
                }
              }
            }
            
            result.push({ 
              name: dir, 
              count,
              packs: Array.from(projectPacks),
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
            let cssPath
            
            if (isExt) {
              cssPath = path.join(ROOT_DIR, 'src', 'idiet', 'idiet.css')
            } else {
              const payload = JSON.parse(Buffer.concat(body).toString() || '{}')
              if (!payload.folderName) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ error: 'folderName is required' }))
              }
              cssPath = path.join(ROOT_DIR, 'out', payload.folderName, 'idiet', 'idiet.css')
            }

            if (!fs.existsSync(cssPath)) {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              return res.end(JSON.stringify({ error: 'Project file(s) not found!' }))
            }

            const parsedIcons = utils.parseCurrentCss({
              cssPath,
              allowedPacksDb: ALLOWED_PACKS_DB,
              userIconPack: USER_ICON_PACK
            })

            const icons = []
            const notFoundIcons = []

            for (const icon of parsedIcons) {
              const { prefix: matchedPrefix, name: matchedName, fullClassName } = icon

              /* if (matchedPrefix === defaultConfig.BASE_PACK.prefix && matchedName in defaultConfig.BASE_PACK.icons) {
                continue
              } */

              if (matchedPrefix === USER_ICON_PACK) {
                try {
                  const svgBody = fs.readFileSync(path.join(USER_ICON_PACK_DIR, `${matchedName}.svg`), 'utf8')
                  icons.push({ 
                    prefix: matchedPrefix, 
                    name: matchedName, 
                    body: svgBody, 
                    width: defaultConfig.EXT_PACK.size, 
                    height: defaultConfig.EXT_PACK.size, 
                    color: defaultConfig.EXT_PACK.color,
                    separator: defaultConfig.EXT_PACK.separator
                  })
                } catch {
                  notFoundIcons.push(fullClassName)
                }
              } else {
                const dbPack = db[matchedPrefix]
                const dbIcon = dbPack?.icons?.[matchedName]

                if (dbIcon) {
                  icons.push({
                    prefix: matchedPrefix,
                    name: matchedName,
                    body: dbIcon.body || '',
                    width: dbPack.size,
                    height: dbPack.size,
                    color: dbPack.color,
                    separator: dbPack.separator,
                    extraClass: dbIcon.extraClass
                  })
                } else {
                  notFoundIcons.push(fullClassName)
                }
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ icons, notFoundIcons }))
          } catch (e) {
            console.error(e)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Failed to process project details' }))
          }
        })
        return
      }

      if (url.pathname === '/api/base-icons' && req.method === 'GET') {
        const currentSet = isExt
          ? (config?.extIconSet ?? defaultConfig.BASE_PACK.iconSet)
          : defaultConfig.BASE_PACK.iconSet
        const baseIcons = utils.getBaseIcons(db, iconSets, currentSet)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(baseIcons))
      }

      if (url.pathname === '/api/packs' && req.method === 'GET') {
        const result = []

        Object.entries(db).forEach(([prefix, packData]) => {
          result.push({
            id: prefix,
            name: packData.title,
            separator: packData.separator,
            count: packData.count || 0,
            license: packData.license?.title,
            version: packData.version,
            color: packData.color,
            source: packData.source
          })
        })
        
        const userExtIconCount = ICON_CACHE.filter(icon => icon.prefix === USER_ICON_PACK).length
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

            const currentSet = isExt
              ? config?.extIconSet ?? defaultConfig.BASE_PACK.iconSet
              : defaultConfig.BASE_PACK.iconSet

            const baseIcons = utils.getBaseIcons(db, iconSets, currentSet)
            const iconsToBuild = [ ...baseIcons, ...icons ]

            const { base64Css, fileLinksCss, woff2Buffer, uniquePrefixes, codepoints } = await utils.buildFontAndCss(iconsToBuild, ALLOWED_PACKS_DB)

            const README_BUFFER = fs.readFileSync(path.join(__dirname, 'templates', 'readme.txt'))
            const BOOT_BUFFER = fs.readFileSync(path.join(__dirname, 'templates', 'idiet-boot.js'))
            const mapFnFileContent = utils.generateIconMapFnContent(uniquePrefixes)

            const userHtmlCards = []
            const baseHtmlCards = []

                 

            const basePrefix = defaultConfig.PACKS.quasar[currentSet]?.prefix || defaultConfig.PACKS.iconify[currentSet]?.prefix || 'mat'
            const baseIconNames = new Set(
              baseIcons.map(icon => `${basePrefix}${icon.separator || '_'}${icon.name}`)
            )

            Object.keys(codepoints).forEach(iconKeyName => {
              const isBase = baseIconNames.has(iconKeyName)

              let displayIconName = iconKeyName

              if (iconKeyName.startsWith('fa-')) {
                const n = iconKeyName.slice('fa-'.length)

                const [style, clearName] = n.split('$')
                const extraClass = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' }[style]
                displayIconName = `${extraClass} fa-${clearName}`
              }

              const cardHtml = `
    <div class="card-icon-item" onclick="copyClass('${displayIconName}')" title="${displayIconName}">
      <div class="card-icon-wrapper">
        <i class="q-icon ${displayIconName}"></i>
      </div>
      <div class="card-icon-info">
        <span class="card-icon-fullname">${displayIconName}</span>
      </div>
    </div>`

              if (isBase) baseHtmlCards.push(cardHtml)
              else userHtmlCards.push(cardHtml)
            })

            const previewHtml = previewTemplate(isExt)
              .replace('<!-- UserIconsGrid -->', userHtmlCards.join(''))
              .replace('<!-- BaseIconsGrid -->', baseHtmlCards.join(''))
            
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

                const existingIconIndex = ICON_CACHE.findIndex(icon => icon.prefix === USER_ICON_PACK && icon.name === safeName)
                
                const cacheItem = {
                  prefix: USER_ICON_PACK,
                  name: safeName,
                  body: cleanContent,
                  separator: '-',
                  search: [safeName, `${USER_ICON_PACK}-${safeName}`]
                }

                if (existingIconIndex !== -1) {
                  ICON_CACHE[existingIconIndex] = cacheItem
                } else {
                  ICON_CACHE.push(cacheItem)
                }

                const extIcons = ICON_CACHE.filter(icon => icon.prefix === USER_ICON_PACK)
                  .sort((a, b) => a.name.localeCompare(b.name))
                
                let i = ICON_CACHE.length
                while (i--) {
                  if (ICON_CACHE[i].prefix === USER_ICON_PACK) {
                    ICON_CACHE.splice(i, 1)
                  }
                }
                ICON_CACHE.unshift(...extIcons)

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
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ processed, errors }))
        })

        req.pipe(busboy)
        return
      }

      if (url.pathname === '/api/scan-files' && req.method === 'POST') {
        let body = []
        req.on('data', chunk => body.push(chunk))
        req.on('end', () => {
          try {
            const projectPath = isExt
              ? ROOT_DIR
              : (JSON.parse(Buffer.concat(body).toString()).projectPath || ROOT_DIR)
            const results = scanProjectFiles({
              projectPath,
              isExt,
              rootDir: ROOT_DIR,
              dbPath: DB_PATH,
              iconCache: ICON_CACHE,
              config: defaultConfig
            })
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ icons: results }))
          } catch (e) {
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
  server.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`)

    if (process.send) {
      process.send({ status: 'ready' })
    }
  })
}

if (process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('icon-diet'))) {
  await runServer({
    isExt: process.env.IS_EXTENSION === 'true',
    extIconSet: process.env.EXT_ICON_SET ?? '',
    port: process.env.PORT ? Number(process.env.PORT) : defaultConfig.port,
    rootDir: process.env.PROJECT_ROOT
  })
}