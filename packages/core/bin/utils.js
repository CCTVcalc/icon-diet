import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { Readable } from 'node:stream'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SVGIcons2SVGFontStream = require('svgicons2svgfont')
const svg2ttf = require('svg2ttf')
const ttf2woff2 = require('ttf2woff2')

const USER_ICON_PACK = config.EXT_PACK.prefix

function getExtraClassForFa (originalName) {
  if (originalName.startsWith('fas')) return 'fa-solid'
  if (originalName.startsWith('fab')) return 'fa-brands'
  if (originalName.startsWith('far')) return 'fa-regular'
  return undefined
}

export function getBaseIcons (db, iconsSet, currentSet = 'material-icons') {
  const currentPrefix = config?.PACKS?.quasar?.[currentSet]?.prefix || 'mat'
  const iconNames = iconsSet[currentSet] || []
  const basePackDB = db[currentPrefix] || db[currentSet] || { icons: {} }

  return iconNames.map(name => {
    let dbIcon = {}
    let extraClass = undefined

    if (currentSet === 'fontawesome-v7') {
      const parts = name.split(/\s+/)
      const style = parts[0]
      const cleanName = parts[1]

      extraClass = getExtraClassForFa(style)
      const faPack = db['fa'] || { icons: {} }

      dbIcon = faPack.icons.find(i => i.name === cleanName && i.extraClass === extraClass)
    } else {
      dbIcon = basePackDB.icons[name]
    }

    const result = {
      prefix: currentPrefix,
      name,
      body: dbIcon.body || '',
      separator: basePackDB.separator || '_',
      width: basePackDB.size || 24,
      height: basePackDB.size || 24,
      color: config.BASE_PACK.color
    }

    if (extraClass) result.extraClass = extraClass

    return result
  })
}

export function parseCurrentCss ({ isExt, rootDir, outDir, allowedPacksDb, userIconPack, cssPath }) {
  const targetPath = cssPath || (isExt ? path.join(rootDir, 'src', 'css', 'idiet.css') : path.join(outDir, 'idiet.css'))
  if (!fs.existsSync(targetPath)) return []

  const content = fs.readFileSync(targetPath, 'utf8')
  const regex = /\.([a-zA-Z0-9_.-]+)::before\s*\{\s*content:\s*['"]\\([a-fA-F0-9]+)['"]\s*;?\s*\}/g
  const allowedPrefixes = Object.keys(allowedPacksDb).concat([userIconPack])
  const sortedPrefixes = [...allowedPrefixes].sort((a, b) => b.length - a.length)
  const results = []

  let match
  while ((match = regex.exec(content)) !== null) {
    const fullClassName = match[1]
    let matchedPrefix = ''
    let matchedName = ''

    if (fullClassName.startsWith('fa-')) {
      const parts = fullClassName.split('.') 
      
      if (parts.length === 2) {
        const styleClass = parts[0]
        const iconClass = parts[1]

        const shortStyle = styleClass.replace(/^fa-([a-z])[a-z]+$/, 'fa$1') 
        const cleanIconName = iconClass.replace(/^fa-/, '')

        matchedPrefix = 'fa'
        matchedName = `${shortStyle}$${cleanIconName}`
      }
    } else {
      for (const prefix of sortedPrefixes) {
        const packMeta = prefix === userIconPack ? config.EXT_PACK : allowedPacksDb[prefix]
        const separator = packMeta?.separator || '-'
        const prefixWithSep = `${prefix}${separator}`

        if (fullClassName.startsWith(prefixWithSep)) {
          matchedPrefix = prefix
          matchedName = fullClassName.slice(prefixWithSep.length)
          break
        }
      }
    }

    if (matchedPrefix) {
      results.push({
        fullClassName,
        prefix: matchedPrefix,
        name: matchedName
      })
    }
  }
  return results
}

export async function buildFontAndCss (icons, allowedPacksDb) {
  const fontStream = new SVGIcons2SVGFontStream({
    fontName: 'idiet',
    fontHeight: 1000,
    normalize: true,
    round: 10,
    centerHorizontally: true
  })

  const fontChunks = []
  fontStream.on('data', chunk => fontChunks.push(chunk))

  const svgFontPromise = new Promise((resolve, reject) => {
    fontStream.on('end', () => resolve(Buffer.concat(fontChunks).toString('utf8')))
    fontStream.on('error', err => reject(err))
  })

  const codepoints = {}
  const uniquePrefixes = new Set()
  const uniquePrefixesWithSeparator = new Set()
  let currentUnicode = 0xE000
 
  for (const icon of icons) {
    const prefix = icon.prefix || 'icon'
    uniquePrefixes.add(prefix)
    
    const separator = icon.separator || allowedPacksDb[prefix]?.separator || '-'
    uniquePrefixesWithSeparator.add(prefix + separator)

    const iconNameKey = `${prefix}${separator}${icon.name}`

    let svgBody = icon.body
    const width = icon.width || allowedPacksDb[prefix]?.size || 24
    const height = icon.height || allowedPacksDb[prefix]?.size || 24

    if (!svgBody?.includes('<svg')) {
      svgBody = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${svgBody || ''}</svg>`
    }

    if (svgBody.includes('@')) {
      svgBody = svgBody.replace(/@/g, '')
    }

    const glyphStream = new Readable()
    glyphStream.push(svgBody)
    glyphStream.push(null)
    glyphStream.metadata = {
      name: iconNameKey,
      unicode: [String.fromCodePoint(currentUnicode)]
    }

    codepoints[iconNameKey] = currentUnicode
    currentUnicode++
    fontStream.write(glyphStream)
  }

  fontStream.end()
  const svgFont = await svgFontPromise

  const ttf = svg2ttf(svgFont, {})
  const ttfBuffer = Buffer.from(ttf.buffer)
  const woff2Buffer = ttf2woff2(ttfBuffer)

  const baseSelectors = `.q-icon:is(${Array.from(uniquePrefixesWithSeparator).map(prefixS => `[class*="${prefixS}"]`).join(', ')})`
  const woff2Base64 = woff2Buffer.toString('base64')

  const glyphsCss = Object.entries(codepoints).map(([iconKeyName, code]) => {
    let outClass = iconKeyName

     if (iconKeyName.startsWith('fa-')) {
        const n = iconKeyName.slice('fa-'.length)

        const [style, clearName] = n.split('$')
        const extraClass = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' }[style]
        outClass = `${extraClass}.fa-${clearName}`
      }
    return `.${outClass}::before { content: "\\${code.toString(16)}"; }`
  }).join('\n')

  const createCssTemplate = (srcUrl) => `@font-face {
  font-family: 'idiet';
  src: ${srcUrl};
  font-weight: normal;
  font-style: normal;
}

${baseSelectors} {
  font-family: 'idiet' !important;
  font-style: normal;
  font-weight: normal;
  display: inline-block;
  line-height: 1;
  vertical-align: middle;
  -webkit-font-smoothing: antialiased;
}

${glyphsCss}`

  const base64Css = createCssTemplate(`url('data:font/woff2;charset=utf-8;base64,${woff2Base64}') format('woff2')`)
  const fileLinksCss = createCssTemplate(`url('./fonts/idiet.woff2') format('woff2')`)

  return { base64Css, fileLinksCss, woff2Buffer, codepoints, uniquePrefixes: Array.from(uniquePrefixes) }
}

export function getCurrentIcons({ currentIconsMeta, db, iconCache, config, userIconPack }) {
  const results = []

  for (const icon of currentIconsMeta) {
    const matchInCache = iconCache.find(c => c.prefix === icon.prefix && c.name === icon.name)

    if (matchInCache) {
      const isExt = icon.prefix === userIconPack
      const packMeta = isExt ? config.EXT_PACK : db[icon.prefix]
      
      const isBase = icon.prefix === config.BASE_PACK.prefix && 
                     Object.prototype.hasOwnProperty.call(config.BASE_PACK.icons, icon.name)

      results.push({
        width: packMeta?.size || 24,
        height: packMeta?.size || 24,
        color: packMeta?.color || '#FFFFFF',
        ...matchInCache,
        isBase
      })
    }
  }

  return results
}

export function resolveInputIcons ({ inputIcons, db, defaultConfig, userIconPack, userIconPackDir, fs, path }) {
  const allowedPrefixes = Object.keys(db).concat([userIconPack])
  const sortedPrefixes = [...allowedPrefixes].sort((a, b) => b.length - a.length)

  const newIconsFound = []
  const failedIcons = []

  for (const item of inputIcons) {
    let matchedPrefix = ''
    let matchedName = ''

    for (const prefix of sortedPrefixes) {
      const packMeta = prefix === userIconPack ? defaultConfig.EXT_PACK : db[prefix]
      const separator = packMeta?.separator || '-'
      const prefixWithSep = `${prefix}${separator}`

      if (item.startsWith(prefixWithSep)) {
        matchedPrefix = prefix
        matchedName = item.slice(prefixWithSep.length)
        break
      }
    }

    if (!matchedPrefix && item.startsWith('fa-')) {
      matchedPrefix = 'fa'
      matchedName = item.slice(3)
    }

    if (!matchedPrefix) {
      matchedPrefix = defaultConfig.BASE_PACK.prefix
      matchedName = item
    }

    if (matchedPrefix === userIconPack) {
      try {
        const svgBody = fs.readFileSync(path.join(userIconPackDir, `${matchedName}.svg`), 'utf8')
        newIconsFound.push({ 
          prefix: matchedPrefix, 
          name: matchedName, 
          body: svgBody, 
          width: defaultConfig.EXT_PACK.size, 
          height: defaultConfig.EXT_PACK.size, 
          color: defaultConfig.EXT_PACK.color,
          separator: defaultConfig.EXT_PACK.separator
        })
      } catch {
        failedIcons.push(item)
      }
    } else {
      const dbPack = db[matchedPrefix]
      const dbIcon = dbPack?.icons?.[matchedName]

      if (dbIcon) {
        newIconsFound.push({
          prefix: matchedPrefix,
          name: matchedName,
          body: dbIcon.body || '',
          width: dbPack.size,
          height: dbPack.size,
          color: dbPack.color,
          separator: dbPack.separator
        })
      } else {
        failedIcons.push(item)
      }
    }
  }

  return { newIconsFound, failedIcons }
}

export function generateIconMapFnContent (uniquePrefixes = []) {
  const allowedPrefixes = Array.from(new Set([...uniquePrefixes, USER_ICON_PACK]))

  const allowedPrefixesWithSeparators = allowedPrefixes.map(prefix => {
    if (prefix === USER_ICON_PACK) return prefix + (config.EXT_PACK.separator || '-')

    const foundPack = Object.values(config.PACKS?.quasar || {}).find(p => p.prefix === prefix)
    return prefix + (foundPack?.separator || '-')
  })

  const purePrefixes = allowedPrefixesWithSeparators.filter(p => !p.startsWith('fa'))

  return `function idietIconMapFn (iconName) {
      const purePrefixes = ${JSON.stringify(purePrefixes)}
      const faStyles = ['fa-solid', 'fa-regular', 'fa-brands']
      
      const parts = iconName.trim().split(/\\s+/)
      const [first, second] = parts

      if (!first || parts.length > 2) return

      if (second) {
        if (faStyles.includes(first) && second.startsWith('fa-')) {
          return { cls: iconName.trim() }
        }
        return
      }

      if (purePrefixes.some(p => first.startsWith(p))) {
        return { cls: first }
      }
      
      return { cls: 'mat_' + first }
    }
      
    if (typeof module !== 'undefined' && module.exports) module.exports = {idietIconMapFn}

    export default idietIconMapFn  
    `
}
