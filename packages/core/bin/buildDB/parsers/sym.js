import * as quasarDefault from './quasarDefault.js'
import svgpath from 'svgpath'

export function getIcons (pack, packModule, packMetaJSON) {
  if (!packModule) return {}

  const transformedModule = {}

  for (const [key, rawBody] of Object.entries(packModule)) {
    if (key === 'default' || typeof rawBody !== 'string') continue

    const paths = quasarDefault.parseQuasarIcon(rawBody)

    const transformedPaths = paths.map(p => {
      return svgpath(p)
        .translate(0, 960)
        .abs()
        .round(3)
        .toString()
    })

    transformedModule[key] = transformedPaths.join(' && ')
  }

  return quasarDefault.getIcons(pack, transformedModule, packMetaJSON)
}