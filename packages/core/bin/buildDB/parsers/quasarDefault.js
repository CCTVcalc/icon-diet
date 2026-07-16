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

export function getIcons (pack, packJSON, packMetaJSON) {
  const result = {}
  if (!packJSON) return result

  let iconifyData = null
  if (packMetaJSON) {
    try {
      iconifyData = JSON.parse(packMetaJSON)
    } catch {}
  }

  const s = pack.separator
  const size = pack.size

  const exportRegex = /export\s+const\s+([\w$]+)\s*=\s*['"]([^'"]+)['"]/g
  let match

  while ((match = exportRegex.exec(packJSON)) !== null) {
    const rawIconName = match[1].trim()
    const rawBody = match[2]
    
    const iconName = normIconName(rawIconName, s, pack.cutPrefix)
    let body = rawBody

    if (typeof rawBody === 'string' && !rawBody.includes('<') && /[MmLlHhVvCcSsQqTtAaZz]/.test(rawBody)) {
      let pathsString = rawBody
        .replace(/fill\s*:\s*none\s*;?/gi, '')
        .replace(/fill\s*:\s*currentColor\s*;?/gi, '')
        .trim()

      if (pathsString.includes('|')) {
        pathsString = pathsString.split('|')[0].trim()
      }

      const parts = pathsString.includes('&&') 
        ? pathsString.split('&&').map(p => p.trim()) 
        : [pathsString]

      let combinedBody = ''
      for (const p of parts) {
        const numbers = p.match(/-?[\d.]+/g)
        if (!numbers) {
          combinedBody += `<path d="${p}" fill="currentColor" />`
        } else {
          const uniqueNumbers = [...new Set(numbers.map(Number))]
          const isOnlyBounds = uniqueNumbers.every(n => n === 0 || n === size || n === -size)
          
          if (isOnlyBounds && !p.toLowerCase().includes('c') && !p.toLowerCase().includes('s')) {
            combinedBody += `<path d="${p}" fill="none" style="display:none !important;" />`
          } else {
            combinedBody += `<path d="${p}" fill="currentColor" />`
          }
        }
      }

      body = combinedBody
    }

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
      separator: s,
      search
    }
  }

  return result
}