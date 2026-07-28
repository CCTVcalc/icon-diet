import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import * as htmlparser2 from 'htmlparser2'
import stripComments from 'strip-comments'
import * as utils from './utils.js'

export async function getQuasarIconSet (projectRootPath) {
  const configFiles = [
    'quasar.config.ts',
    'quasar.config.js',
    'quasar.config.cjs',
    'quasar.config.mjs'
  ]

  for (const configFile of configFiles) {
    const fullPath = path.join(projectRootPath, configFile)
    if (fs.existsSync(fullPath)) {
      try {
        const rawCode = fs.readFileSync(fullPath, 'utf8')
        const cleanCode = stripComments(rawCode)

        const match = cleanCode.match(/\biconSet\s*:\s*['"`]([^'"`]+)['"`]/)
        if (match && match[1]) {
          return match[1]
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  return null
}

export async function scanProjectFiles ({ projectPath, isExt, rootDir, iconCache, config, baseIconPack }) {
  let srcPath = ''

  if (isExt) {
    srcPath = path.join(projectPath, 'src')
  } else {
    if (!projectPath) {
      throw new Error('Project path is required')
    }
    const resolvedPath = path.isAbsolute(projectPath) ? projectPath : path.resolve(rootDir, projectPath)

    if (path.basename(resolvedPath) === 'src') {
      srcPath = resolvedPath
    } else {
      srcPath = path.join(resolvedPath, 'src')
    }
  }

  if (!fs.existsSync(srcPath)) throw new Error('The "src" directory was not found.')

  function getSortedPrefixes() {
    const prefixMap = new Map()

    if (config.PACKS?.quasar) {
      for (const pack of Object.values(config.PACKS.quasar)) {
        if (pack.prefix) prefixMap.set(pack.prefix, pack.separator)
      }
    }

    if (config.PACKS?.iconify) {
      for (const pack of Object.values(config.PACKS.iconify)) {
        if (pack.prefix) prefixMap.set(pack.prefix, '-')
      }
    }

    if (config.EXT_PACK?.prefix) {
      prefixMap.set(config.EXT_PACK.prefix, config.EXT_PACK.separator)
    }

    return Array.from(prefixMap.entries())
      .map(([prefix, separator]) => ({ prefix, separator }))
      .sort((a, b) => b.prefix.length - a.prefix.length)
  }

  const PREFIX_MAP = getSortedPrefixes()
  const FA_STYLE_MAP = { 'fa-solid': 'fas', 'fa-regular': 'far', 'fa-brands': 'fab' }

  function extractCandidate (str) {
    if (!str || typeof str !== 'string') return null
    const cleanStr = str.trim()
    if (!cleanStr) return null

    if (cleanStr.startsWith('fa-') || cleanStr.includes(' fa-') || cleanStr.includes('\tfa-')) {
      const tokens = cleanStr.split(/\s+/)
      if (tokens.length === 2) {
        const allowedStyles = ['fa-solid', 'fa-regular', 'fa-brands']
        const styleToken = tokens.find(t => allowedStyles.includes(t))
        const nameToken = tokens.find(t => t.startsWith('fa-') && !allowedStyles.includes(t))

        if (styleToken && nameToken) {
          const styleShort = FA_STYLE_MAP[styleToken]
          const pureName = nameToken.slice('fa-'.length)
          if (styleShort && pureName) {
            return { prefix: 'fa', name: `${styleShort}$${pureName}` }
          }
        }
      }
      return null
    }

    if (cleanStr.includes(' ')) return null

    for (const { prefix, separator } of PREFIX_MAP) {
      if (prefix === 'fa') continue

      const prefixWithSep = `${prefix}${separator}`
      if (cleanStr.startsWith(prefixWithSep)) {
        const name = cleanStr.slice(prefixWithSep.length)
        if (!name) return null

        return { prefix, name }
      }
    }
  
    const isMatStylized = ['o_', 's_', 'r_'].includes(cleanStr.slice(0, 2))
    const p = isMatStylized ? `_${cleanStr.slice(0, 1)}` : ''
    const name = cleanStr.slice(p.length)

    return name ? { prefix: `mat${p}`, name } : null
  }

  const BASE_ICONS_SET = new Set(baseIconPack?.baseIconsName || [])
  const rawCandidates = new Set()

  function processRawString(str) {
    const candidate = extractCandidate(str)
    if (!candidate) return

    if (candidate.prefix === baseIconPack?.prefix && BASE_ICONS_SET.has(candidate.name)) {
      return
    }

    rawCandidates.add(`${candidate.prefix}:${candidate.name}`)
  }

  const processTemplate = (htmlContent) => {
    const parser = new htmlparser2.Parser({
      onopentag(tagName, attribs) {
        if (tagName === 'q-icon') {
          const targetValue = attribs.name || attribs[':name'] || attribs['v-bind:name']
          if (targetValue) processRawString(targetValue)
          return
        }

        Object.keys(attribs).forEach(attr => {
          const lowerAttr = attr.toLowerCase()
          if (lowerAttr.includes('icon')) {
            processRawString(attribs[attr])
          }
        })
      }
    }, { xmlMode: true })
    parser.write(htmlContent)
    parser.end()
  }

  const processScriptContent = (scriptCode) => {
    if (!scriptCode || !scriptCode.trim()) return

    const objMatches = scriptCode.matchAll(/(?:icon|name)\s*:\s*['"`]([^'"`]+)['"`]/g)
    for (const match of objMatches) {
      if (match[1]) processRawString(match[1])
    }

    const carpetMatches = scriptCode.matchAll(/['"`]([a-zA-Z0-9_\-\$]+)['"`]/g)
    for (const match of carpetMatches) {
      if (match[1]) processRawString(match[1])
    }
  }

  const scanDirectory = (dir) => {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const fullPath = path.join(dir, file)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        if (!['node_modules', '.git', '.quasar', 'dist', 'out'].includes(file)) {
          scanDirectory(fullPath)
        }
      } else if (stat.isFile() && /\.(vue|js|ts)$/i.test(file)) {
        const fileContent = fs.readFileSync(fullPath, 'utf8')

        if (file.endsWith('.vue')) {
          try {
            const { descriptor } = parse(fileContent)

            if (descriptor.template?.content) {
              processTemplate(descriptor.template.content)
            }

            const scriptJs = [
              descriptor.script?.content || '',
              descriptor.scriptSetup?.content || ''
            ].join('\n')

            processScriptContent(scriptJs)
          } catch (e) {
            console.error(`Error parsing SFC ${file}:`, e)
          }
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
          processScriptContent(fileContent)
        }
      }
    }
  }

  scanDirectory(srcPath)

  const foundIcons = []
  for (const candidateKey of rawCandidates) {
    const [prefix, name] = candidateKey.split(':')
    const packInfo = PREFIX_MAP.find(p => p.prefix === prefix)
    const separator = packInfo?.separator ?? '_'
    
    const fullName = utils.getIconFullName(prefix, separator, name)
    const icon = iconCache.get(fullName) || iconCache.get(candidateKey)
    
    if (icon) foundIcons.push(icon)
  }

  return {
    icons: foundIcons.sort((a, b) => {
      if (a.prefix !== b.prefix) return a.prefix.localeCompare(b.prefix)
      return a.name.localeCompare(b.name)
    })
  }
}