import * as cheerio from 'cheerio'
import svgpath from 'svgpath'

function convertPrimitivesToPaths($) {
  $('rect').each((_, elem) => {
    const $el = $(elem)
    const x = parseFloat($el.attr('x') || 0)
    const y = parseFloat($el.attr('y') || 0)
    const w = parseFloat($el.attr('width') || 0)
    const h = parseFloat($el.attr('height') || 0)
    const rx = parseFloat($el.attr('rx') || 0)
    const ry = parseFloat($el.attr('ry') || 0)

    let d = ''
    if (rx > 0 || ry > 0) {
      const rX = rx || ry
      const rY = ry || rx
      d = `M ${x + rX} ${y} ` +
          `L ${x + w - rX} ${y} ` +
          `A ${rX} ${rY} 0 0 1 ${x + w} ${y + rY} ` +
          `L ${x + w} ${y + h - rY} ` +
          `A ${rX} ${rY} 0 0 1 ${x + w - rX} ${y + h} ` +
          `L ${x + rX} ${y + h} ` +
          `A ${rX} ${rY} 0 0 1 ${x} ${y + h - rY} ` +
          `L ${x} ${y + rY} ` +
          `A ${rX} ${rY} 0 0 1 ${x + rX} ${y} Z`
    } else {
      d = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`
    }

    $el.replaceWith($('<path>').attr($el.attr()).attr('d', d).removeAttr('x').removeAttr('y').removeAttr('width').removeAttr('height').removeAttr('rx').removeAttr('ry'))
  })

  $('circle').each((_, elem) => {
    const $el = $(elem)
    const cx = parseFloat($el.attr('cx') || 0)
    const cy = parseFloat($el.attr('cy') || 0)
    const r = parseFloat($el.attr('r') || 0)

    const d = `M ${cx - r} ${cy} ` +
              `A ${r} ${r} 0 1 0 ${cx + r} ${cy} ` +
              `A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`

    $el.replaceWith($('<path>').attr($el.attr()).attr('d', d).removeAttr('cx').removeAttr('cy').removeAttr('r'))
  })

  $('ellipse').each((_, elem) => {
    const $el = $(elem)
    const cx = parseFloat($el.attr('cx') || 0)
    const cy = parseFloat($el.attr('cy') || 0)
    const rx = parseFloat($el.attr('rx') || 0)
    const ry = parseFloat($el.attr('ry') || 0)

    const d = `M ${cx - rx} ${cy} ` +
              `A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} ` +
              `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`

    $el.replaceWith($('<path>').attr($el.attr()).attr('d', d).removeAttr('cx').removeAttr('cy').removeAttr('rx').removeAttr('ry'))
  })

  $('line').each((_, elem) => {
    const $el = $(elem)
    $el.replaceWith($('<path>').attr($el.attr()).removeAttr('x1').removeAttr('y1').removeAttr('x2').removeAttr('y2'))
  })

  $('polygon, polyline').each((_, elem) => {
    const $el = $(elem)
    const pointsStr = $el.attr('points') || ''
    const points = pointsStr.trim().split(/[\s,]+/)
    
    if (points.length >= 4) {
      let d = `M ${points[0]} ${points[1]}`
      for (let i = 2; i < points.length; i += 2) {
        if (points[i] && points[i + 1]) {
          d += ` L ${points[i]} ${points[i + 1]}`
        }
      }
      if (elem.name === 'polygon') d += ' Z'
      
      $el.replaceWith($('<path>').attr($el.attr()).attr('d', d).removeAttr('points'))
    }
  })
}

export function processSvgIcon(rawSvg) {
  const $ = cheerio.load(rawSvg, { xmlMode: true })

  $('metadata, defs, desc, title, style, script').remove()

  const svgElem = $('svg')
  const rawViewBox = svgElem.attr('viewBox')
  let origWidth = parseFloat(svgElem.attr('width') || 24)
  let origHeight = parseFloat(svgElem.attr('height') || 24)

  let origX = 0
  let origY = 0

  if (rawViewBox) {
    const parts = rawViewBox.trim().split(/[\s,]+/).map(parseFloat)
    if (parts.length === 4 && !parts.some(isNaN)) {
      origX = parts[0]
      origY = parts[1]
      origWidth = parts[2]
      origHeight = parts[3]
    }
  }

  const scaleX = 24 / origWidth
  const scaleY = 24 / origHeight

  convertPrimitivesToPaths($)

  const finalPaths = []

  $('path').each((_, elem) => {
    const $path = $(elem)
    
    const stroke = $path.attr('stroke')
    if (stroke && stroke !== 'none') {
      return
    }

    const d = $path.attr('d')
    if (!d || d.trim() === '') return

    const transformChain = []
    
    if (origX !== 0 || origY !== 0) {
      transformChain.push(`translate(${-origX}, ${-origY})`)
    }

    if (scaleX !== 1 || scaleY !== 1) {
      transformChain.push(`scale(${scaleX}, ${scaleY})`)
    }

    $path.parents('g').each((_, group) => {
      const gTransform = $(group).attr('transform')
      if (gTransform) transformChain.unshift(gTransform)
    })

    const pathTransform = $path.attr('transform')
    if (pathTransform) transformChain.push(pathTransform)

    let processedPath = svgpath(d)
    
    for (const transformStr of transformChain) {
      processedPath = processedPath.transform(transformStr)
    }

    const finalD = processedPath.abs().round(3).toString()
    
    if (finalD) {
      let pathFill = $path.attr('fill')
      if (!pathFill || pathFill === 'none') {
        pathFill = 'currentColor'
      }
      finalPaths.push(`<path d="${finalD}" fill="${pathFill}" />`)
    }
  })

  if (finalPaths.length === 0) {
    throw new Error('SVG does not contain any valid filled paths.')
  }

  return finalPaths.join('')
}
