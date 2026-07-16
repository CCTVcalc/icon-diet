import * as quasarDefault from './quasarDefault.js'
import svgpath from 'svgpath'

export function getIcons (pack, packJSON, packMetaJSON) {
  if (!packJSON) return {}

  const size = pack.size
  const modifiedJS = packJSON
  .replace(
    /(export\s+const\s+)(fas|fab|far)(\w)(\w*)/g,
    (match, p1, p2, p3, p4) => `${p1}${p2}$${p3.toLowerCase()}${p4}`
  )
  .replace(
    /export\s+const\s+([\w$]+)\s*=\s*['"]([^'"]+)['"]/g,
    (match, originalName, rawBody) => {
      if (typeof rawBody === 'string' && !rawBody.includes('<') && /[MmLlHhVvCcSsQqTtAaZz]/.test(rawBody)) {
        let pathsString = rawBody
        let customViewBox = null

        if (rawBody.includes('|')) {
          const pipeParts = rawBody.split('|').map(p => p.trim())
          pathsString = pipeParts[0]
          customViewBox = pipeParts[1]
        }

        if (pathsString.includes('@@')) pathsString = pathsString.split('@@')[0].trim()

        const coords = customViewBox ? customViewBox.match(/-?[\d.]+/g)?.map(parseFloat) : null
        const [origX, origY, origW, origH] = coords || [0, 0, size, size]

        const isRect = origW !== origH
        const maxDim = Math.max(origW, origH)

        const padX = isRect ? (maxDim - origW) / 2 : 0
        const padY = isRect ? (maxDim - origH) / 2 : 0

        const scale = size / maxDim
        const isTransformationNeeded = origX !== 0 || origY !== 0 || isRect || scale !== 1

        if (isTransformationNeeded) {
          const parts = pathsString.includes('&&')
            ? pathsString.split('&&').map(p => p.trim())
            : [pathsString]

          const transformedParts = parts.map(p => {
            let processedPath = svgpath(p).translate(-origX, -origY)

            if (isRect) {
              processedPath = processedPath.transform(`translate(${padX}, ${padY})`)
            }

            if (scale !== 1) {
              processedPath = processedPath.scale(scale)
            }

            return processedPath.abs().round(3).toString()
          })

          const transformedPaths = transformedParts.join(' && ')
          return `export const ${originalName} = '${transformedPaths}'`
        }
      }
      return match
    }
  )

  const result = quasarDefault.getIcons(pack, modifiedJS, packMetaJSON)

  return result
}