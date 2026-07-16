function getPrefixColor (prefix) {
  let hash = 0
  for (let i = 0; i < prefix.length; i++) {
    hash = prefix.charCodeAt(i) + ((hash << 5) - hash)
  }

  const goldenRatioConjugate = 0.618033988749895
  const hue = Math.floor((Math.abs(hash) * goldenRatioConjugate % 1) * 360)
  
  const saturation = 65
  const lightness = 45

  const l = lightness / 100
  const a = (saturation * Math.min(l, 1 - l)) / 100
  
  const f = (n) => {
    const k = (n + hue / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }

  return `#${f(0)}${f(8)}${f(4)}`
}

export {
  getPrefixColor
}
