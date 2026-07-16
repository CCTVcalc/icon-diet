import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import * as htmlparser2 from 'htmlparser2'

export function scanProjectFiles({ projectPath, isExt, rootDir, dbPath, iconCache, config }) {
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

  if (!fs.existsSync(srcPath)) {
    throw new Error('The "src" directory was not found.')
  }

  let db = {}
  if (fs.existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
    } catch (e) {
      console.error(e)
    }
  }

  const userPrefix = config.EXT_PACK.prefix
  const userSeparator = config.EXT_PACK.separator
  const basePrefix = config.BASE_PACK.prefix

  const prefixMap = {}
  Object.keys(db).forEach(p => {
    if (p !== 'fa') {
      prefixMap[p] = db[p].separator || '-'
    }
  })
  prefixMap[userPrefix] = userSeparator

  const allPrefixes = Object.keys(prefixMap).sort((a, b) => b.length - a.length)

  const prefixPatterns = allPrefixes.map(p => {
    const sep = prefixMap[p]
    const escapedSep = sep.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const allowedChars = p === userPrefix ? 'a-zA-Z0-9_-' : (sep === '_' ? 'a-zA-Z0-9_' : 'a-zA-Z0-9-')
    return `${p}${escapedSep}[${allowedChars}]+`
  })
  
  const carpetBombPattern = new RegExp(`(?:['"\\x60])(${prefixPatterns.join('|')})`, 'gi')
  const objPattern = /\b([a-zA-Z0-9_-]*icon[a-zA-Z0-9_-]*)\s*:\s*(?:['"`])([^'"`]+)(?:['"`])/gi

  const foundCandidates = new Set()

  const validateCandidate = (str) => {
    const cleanStr = str.trim()
    if (!cleanStr) return

    if (cleanStr.startsWith('fa-') || cleanStr.includes(' fa-') || cleanStr.includes('\tfa-')) {
      const tokens = cleanStr.split(/\s+/)
      if (tokens.length === 2) {
        const allowedStyles = ['fa-solid', 'fa-regular', 'fa-brands']
        const styleToken = tokens.find(t => allowedStyles.includes(t))
        const nameToken = tokens.find(t => t.startsWith('fa-') && !allowedStyles.includes(t))

        if (styleToken && nameToken) {
          const newStyle = styleToken.replace(/^fa-([a-z])[a-z]+$/, 'fa$1')
          const pureName = nameToken.slice('fa-'.length)
          if (pureName && !pureName.includes('_') && /^[a-zA-Z0-9-]+$/.test(pureName)) {
            foundCandidates.add(`fa:${newStyle}$${pureName}`)
          }
        }
      }
      return
    }

    if (cleanStr.includes(' ')) return

    for (const p of allPrefixes) {
      const sep = prefixMap[p]
      const prefixWithSep = `${p}${sep}`
      if (cleanStr.startsWith(prefixWithSep)) {
        const name = cleanStr.slice(prefixWithSep.length)
        if (!name) return
        
        if (p === userPrefix) {
          if (!/^[a-zA-Z0-9_-]+$/.test(name)) return
        } else {
          if (sep === '_') {
            if (name.includes('-') || !/^[a-zA-Z0-9_]+$/.test(name)) return
          } else if (sep === '-') {
            if (name.includes('_') || !/^[a-zA-Z0-9-]+$/.test(name)) return
          }
        }
        foundCandidates.add(`${p}:${name}`)
        return
      }
    }

    const basePackIcons = db[basePrefix]?.icons || config.BASE_PACK.icons || {}
    if (Object.prototype.hasOwnProperty.call(basePackIcons, cleanStr)) {
      foundCandidates.add(`${basePrefix}:${cleanStr}`)
    }
  }

  const processTemplate = (htmlContent) => {
    const parser = new htmlparser2.Parser({
      onopentag(tagName, attribs) {
        if (tagName === 'q-icon') {
          const targetValue = attribs.name || attribs[':name'] || attribs['v-bind:name']
          if (targetValue) validateCandidate(targetValue)
          return
        }

        Object.keys(attribs).forEach(attr => {
          const lowerAttr = attr.toLowerCase()
          if (lowerAttr.includes('icon')) {
            validateCandidate(attribs[attr])
          }
        })
      }
    }, { xmlMode: true })
    parser.write(htmlContent)
    parser.end()
  }

  const processScript = (jsContent) => {
    const matches = [...jsContent.matchAll(objPattern)]
    for (const match of matches) {
      validateCandidate(match[2])
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
            
            const combinedText = [
              descriptor.template?.content || '',
              descriptor.script?.content || '',
              descriptor.scriptSetup?.content || ''
            ].join('\n')

            let carpetMatch
            while ((carpetMatch = carpetBombPattern.exec(combinedText)) !== null) {
              validateCandidate(carpetMatch[1])
            }

            if (descriptor.template?.content) {
              processTemplate(descriptor.template.content)
            }

            const scriptJs = [
              descriptor.script?.content || '',
              descriptor.scriptSetup?.content || ''
            ].join('\n')

            if (scriptJs.trim()) {
              processScript(scriptJs)
            }
          } catch (e) {
            console.error(e)
          }
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
          let carpetMatch
          while ((carpetMatch = carpetBombPattern.exec(fileContent)) !== null) {
            validateCandidate(carpetMatch[1])
          }
          processScript(fileContent)
        }
      }
    }
  }

  scanDirectory(srcPath)

  const results = []
  for (const candidate of Array.from(foundCandidates)) {
    const [prefix, name] = candidate.split(':')
    const matchInCache = iconCache.find(icon => icon.prefix === prefix && icon.name === name)

    if (matchInCache) {
      const packMeta = prefix === userPrefix ? config.EXT_PACK : db[prefix]

      results.push({
        width: packMeta?.size || 24,
        height: packMeta?.size || 24,
        color: packMeta?.color || '#FFFFFF',
        ...matchInCache
      })
    }
  }

  return results.sort((a, b) => {
    if (a.prefix !== b.prefix) return a.prefix.localeCompare(b.prefix)
    return a.name.localeCompare(b.name)
  })
}