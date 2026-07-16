import * as quasarDefault from './quasarDefault.js'
import svgpath from 'svgpath'

const ORIGINAL_VIEWBOX = { x: 0, y: -960, width: 960, height: 960 }

export function getIcons (pack, packJSON, packMetaJSON) {
  if (!packJSON) return {}

  const modifiedJS = packJSON.replace(
    /export\s+const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g,
    (match, name, rawBody) => {
      if (!rawBody.includes('<') && /[MmLlHhVvCcSsQqTtAaZz]/.test(rawBody)) {
        const pathsString = rawBody.split('|')[0].trim()

        const parts = pathsString.includes('&&')
          ? pathsString.split('&&').map(p => p.trim())
          : [pathsString]

        const transformedParts = parts.map(p => {
          return svgpath(p)
            .translate(0, 960)
            .abs()
            .round(3)
            .toString()
        })

        return `export const ${name} = '${transformedParts.join(' && ')}'`
      }

      return match
    }
  )

  return quasarDefault.getIcons(pack, modifiedJS, packMetaJSON)
}