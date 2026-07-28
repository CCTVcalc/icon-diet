import * as quasarDefault from './quasarDefault.js'
import svgpath from 'svgpath'

export function getIcons (pack, packModule, packMetaJSON) {
  if (!packModule) return {}

  const size = pack.size
  const result = {}

  for (const [originalName, rawBody] of Object.entries(packModule)) {
    if (originalName === 'default' || typeof rawBody !== 'string') continue

    const iconName = originalName.replace(
      /^(fas|fab|far)(\w)(\w*)$/,
      (m, p1, p2, p3) => `${p1}$${p2.toLowerCase()}${p3}`
    )

    // 2. Достаем пути
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

    let parts = pathsString.includes('&&')
      ? pathsString.split('&&').map(p => p.trim())
      : [pathsString]

    if (isTransformationNeeded) {
      parts = parts.map(p => {
        let processedPath = svgpath(p).translate(-origX, -origY)

        if (isRect) {
          processedPath = processedPath.transform(`translate(${padX}, ${padY})`)
        }

        if (scale !== 1) {
          processedPath = processedPath.scale(scale)
        }

        return processedPath.abs().round(3).toString()
      })
    }

    const body = parts
      .filter(Boolean)
      .map(d => `<path d="${d}" fill="currentColor" />`)
      .join('')

    if (!body) continue

    result[iconName] = {
      body,
      search: [iconName]
    }
  }

  return result
}