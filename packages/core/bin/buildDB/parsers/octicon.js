import * as iconifyDefault from './iconifyDefault.js'

export function getIcons (pack, packJSON, packMetaJSON) {
  if (!packJSON) return {}

  try {
    const rawData = JSON.parse(packJSON)
    const modifiedData = {
      ...rawData,
      icons: {},
      aliases: {}
    }

    if (rawData.icons) {
      for (const [key, icon] of Object.entries(rawData.icons)) {
        if (key.endsWith('-16')) {
          const cleanKey = key.slice(0, -3)
          modifiedData.icons[cleanKey] = icon
        }
      }
    }

    if (rawData.aliases) {
      for (const [key, alias] of Object.entries(rawData.aliases)) {
        if (key.endsWith('-16')) {
          const cleanKey = key.slice(0, -3)
          const modifiedAlias = { ...alias }

          if (alias.parent && alias.parent.endsWith('-16')) {
            modifiedAlias.parent = alias.parent.slice(0, -3)
          }

          modifiedData.aliases[cleanKey] = modifiedAlias
        }
      }
    }

    const modifiedJSON = JSON.stringify(modifiedData)

    const icons = iconifyDefault.getIcons(pack, modifiedJSON, packMetaJSON)

    for (const icon of Object.values(icons)) {
      icon.search = icon.search
        .map(term => term.endsWith('-16') ? term.slice(0, -3) : term)
        .filter(term => term !== '16')
      
      icon.search = [...new Set(icon.search)]
    }

    return icons

  } catch (e) {
    console.error('Error preprocessing Octicons JSON:', e)
    return {}
  }
}