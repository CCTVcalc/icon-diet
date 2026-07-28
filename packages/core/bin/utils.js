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

export function getIconFullName (prefix, separator, name) {
  return (prefix && separator && name)
    ? `${prefix}${separator}${name}`
    : false
}

function getExtraClassForFa (originalName) {
  if (originalName.startsWith('fas')) return 'fa-solid'
  if (originalName.startsWith('fab')) return 'fa-brands'
  if (originalName.startsWith('far')) return 'fa-regular'
  return undefined
}

export function getIconsData (iconNames, iconCache) {
  const names = typeof iconNames === 'string' ? [iconNames]  : iconNames
  
  const icons = []
  const invalidIcons = []
  
  names.forEach(i => {
    const icon = iconCache.get(i)
    if (icon) icons.push(icon)
    else invalidIcons.push(i)
  })

  return { icons, invalidIcons }
}

export async function buildFontAndCss (icons) {
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
  const uniquePrefixesWithSep = new Set()
  let currentUnicode = 0xE000
 
  for (const icon of icons) {
    const prefix = icon.prefix
    const separator = icon.separator
    uniquePrefixesWithSep.add(prefix + separator)

    let svgBody = icon.body
    const width = icon.size || 24
    const height = icon.size || 24

    if (!svgBody?.includes('<svg')) {
      svgBody = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${svgBody || ''}</svg>`
    }

    if (svgBody.includes('@')) svgBody = svgBody.replace(/@/g, '')

    const glyphStream = new Readable()
    glyphStream.push(svgBody)
    glyphStream.push(null)
    glyphStream.metadata = { name: icon.fullName, unicode: [String.fromCodePoint(currentUnicode)] }

    codepoints[icon.fullName] = currentUnicode
    currentUnicode++
    fontStream.write(glyphStream)
  }

  fontStream.end()
  const svgFont = await svgFontPromise

  const ttf = svg2ttf(svgFont, {})
  const ttfBuffer = Buffer.from(ttf.buffer)
  const woff2Buffer = ttf2woff2(ttfBuffer)

  const baseSelectors = `.q-icon:is(${Array.from(uniquePrefixesWithSep).map(pS => `[class*="${pS}"]`).join(', ')})`
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

  return {
    base64Css,
    fileLinksCss,
    woff2Buffer,
    codepoints,
    uniquePrefixes: Array.from(uniquePrefixesWithSep).map(pS => pS.slice(0, -1))
  }
}

export function generateIconMapFnContent (uniquePrefixes = []) {
  const allowedPrefixes = Array.from(new Set([...uniquePrefixes, USER_ICON_PACK]))

  const allowedPrefixesWithSeparators = allowedPrefixes.map(prefix => {
    if (prefix === USER_ICON_PACK) return prefix + (config.EXT_PACK.separator || '-')

    const foundPack = Object.values(config.PACKS?.quasar || config.PACKS?.iconify || {}).find(p => p.prefix === prefix)
    return prefix + (foundPack?.separator || '-')
  })

  const purePrefixes = allowedPrefixesWithSeparators
    .filter(p => !p.startsWith('fa'))
    .sort((a, b) => b.length - a.length)

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
      
    if (typeof module !== 'undefined' && module.exports) module.exports = { idietIconMapFn }

    export default idietIconMapFn  
    `
}
