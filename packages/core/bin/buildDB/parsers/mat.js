import * as quasarDefault from './quasarDefault.js'

export function getIcons (pack, packJSON, packMetaJSON) {
  const result = quasarDefault.getIcons(pack, packJSON, packMetaJSON)

  const s = pack.separator
  const alignKey = `format${s}align${s}left`
  const backKey = `arrow${s}back`

  if (result[alignKey]) result['alignment'] = { ...result[alignKey], search: ['alignment'] }
  if (result[backKey]) result['backward'] = { ...result[backKey], search: ['backward'] }

  return result
}