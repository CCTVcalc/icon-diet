export function getInfo (pack, packInfo) {
  let version = null
  let license = undefined
  let title = pack.title

  if (packInfo) {
    try {
      const info = JSON.parse(packInfo)
      title = pack.title || info.name || pack.prefix
      version = info.version || null
      
      if (info.license) {
        license = {
          title: info.license?.title,
          url: info.license.url || ''
        }
      }
    } catch { }
  }

  return { title, version, license }
}

function resolveIconifyBody (pack, name) {
  if (pack.icons?.[name]?.body) return pack.icons[name].body
  if (pack.aliases?.[name]) {
    const aliasData = pack.aliases[name]
    if (aliasData.body) return aliasData.body
    if (aliasData.parent) return resolveIconifyBody(pack, aliasData.parent)
  }
  return null
}

export function getIcons (pack, packJSON, packMetaJSON) {
  const result = {}
  if (!packJSON) return result

  try {
    const packData = JSON.parse(packJSON)
    let metadata = {}
    
    if (packMetaJSON) {
      try {
        metadata = JSON.parse(packMetaJSON)
      } catch { }
    }

    const allNames = new Set([
      ...Object.keys(packData.icons || {}),
      ...Object.keys(packData.aliases || {})
    ])

    for (const name of allNames) {
      const isHidden = packData.icons?.[name]?.hidden || packData.aliases?.[name]?.hidden
      if (isHidden) continue

      const body = resolveIconifyBody(packData, name)
      if (!body) continue

      const searchTerms = new Set([name.toLowerCase()])

      if (packData.aliases?.[name]?.parent) {
        searchTerms.add(packData.aliases[name].parent.toLowerCase())
      }

      if (metadata.categories) {
        for (const [category, list] of Object.entries(metadata.categories)) {
          if (list.includes(name)) {
            searchTerms.add(category.toLowerCase())
          }
        }
      }

      result[name] = {
        body,
        search: Array.from(searchTerms)
      }
    }

  } catch (e) {
    console.error(`Error parsing Iconify data for prefix: ${pack.prefix}`, e)
  }

  return result
}