// function from Quasar - configurate path
export function parseQuasarIcon (rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return []

  const paths = rawStr.split('&&')
  const resultPaths = []

  for (let path of paths) {
    path = path.trim()
    if (!path) continue

    if (path.includes('|')) {
      path = path.split('|')[0].trim()
    }

    if (path.includes(':')) {
      const colonIndex = path.indexOf(':')
      path = path.slice(colonIndex + 1).trim()
    }

    path = path
      .replace(/fill\s*:\s*none\s*;?/gi, '')
      .replace(/fill\s*:\s*currentColor\s*;?/gi, '')
      .trim()

    if (/^[mM]/.test(path)) {
      resultPaths.push(path)
    }
  }

  return resultPaths
}

export function getInfo (pack, packInfo, packMetaJSON) {
  const title = pack.title || pack.prefix
  let version = null

  if (packInfo) {
    try {
      const pkg = JSON.parse(packInfo)
      const deps = pkg.devDependencies || {}
      const cleanDir = pack.dir.replace(/-v\d+/, '').toLowerCase()

      const matchedKey = Object.keys(deps).find(key => {
        const cleanKey = key.replace('@', '').replace('/', '-')
        return cleanKey.includes(cleanDir) || cleanDir.includes(cleanKey)
      })

      if (matchedKey) version = deps[matchedKey].replace(/[\^~]/, '')

    } catch {}

    if (!version && pack.dir) {
      const versionMatch = pack.dir.match(/-v(\d+)/)
      if (versionMatch) version = versionMatch[1]
    }
  }

  let license = undefined
  if (packMetaJSON) {
    try {
      const metadata = JSON.parse(packMetaJSON)
      if (metadata.license) {
        license = {
          title: metadata.license.title || metadata.license,
          url: metadata.license.url || ''
        }
      }
    } catch {}
  }

  return { title, version: version || undefined, license }
}

export function normIconName (name, separator, cutPrefix) {
  let result = ''
  const nameNoPrefix = name.slice((Array.isArray(cutPrefix)
    ? cutPrefix.find(el => name.startsWith(el))
    : cutPrefix)
  ?.length ?? 0)

  for (let i = 0; i < nameNoPrefix.length; i++) {
    const char = nameNoPrefix[i]
    
    if (i > 0) {
      const prevChar = nameNoPrefix[i - 1]
      const isUpper = /[A-Z]/.test(char)
      const isDigit = /[0-9]/.test(char)
      const prevIsLetter = /[a-zA-Z]/.test(prevChar)

      if (isUpper) result += separator
      else if (isDigit && prevIsLetter) result += separator
    }

    result += char
  }

  return result.toLowerCase()
}

export function getIcons (pack, packModule, packMetaJSON) {
  const result = {}
  if (!packModule) return result

  let iconifyData = null
  if (packMetaJSON) {
    try {
      iconifyData = JSON.parse(packMetaJSON)
    } catch {}
  }

  const s = pack.separator

  for (const [rawIconName, rawBody] of Object.entries(packModule)) {
    if (rawIconName === 'default') continue

    const iconName = normIconName(rawIconName, s, pack.cutPrefix)
    
    const paths = parseQuasarIcon(rawBody)
    if (paths.length === 0) continue

    const body = paths
      .map(d => `<path d="${d}" fill="currentColor" />`)
      .join('')

    let search = [iconName]
    if (iconifyData && iconifyData.categories) {
      const lookupName = s === '_' ? iconName.replace(/_/g, '-') : iconName
      
      for (const [category, list] of Object.entries(iconifyData.categories)) {
        if (list.includes(lookupName)) {
          search.push(category.toLowerCase())
        }
      }
      search = [...new Set(search)]
    }

    result[iconName] = {
      body,
      search
    }
  }

  return result
}