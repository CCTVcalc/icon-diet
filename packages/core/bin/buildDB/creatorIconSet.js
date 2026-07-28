import fs from 'node:fs'
import path from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_DIR = path.join(__dirname, '..', '..', 'data')
const DB_PATH = path.join(DB_DIR, 'quasar-icon-sets.json')

export async function buildIconSets (force = false) {
  if (fs.existsSync(DB_PATH) && !force) return
  
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }

  const result = {}
  const quasarPacks = config?.PACKS?.quasar

  if (!quasarPacks) return result

  for (const key in quasarPacks) {
    const dir = quasarPacks[key].dir
    const primaryUrl = `https://fastly.jsdelivr.net/npm/quasar@2/icon-set/${dir}.js/+esm`
    const fallbackUrl = `https://unpkg.com/quasar@2/icon-set/${dir}.js?module`

    let response = null

    try {
      response = await import(`data:text/javascript;base64,${Buffer.from(await (await fetch(primaryUrl)).text()).toString('base64')}`)
    } catch {
      try {
        response = await import(`data:text/javascript;base64,${Buffer.from(await (await fetch(fallbackUrl)).text()).toString('base64')}`)
      } catch {}
    }

    if (!response?.default) {
      console.error(`Failed to load icon-set/${dir}.js from CDN`)
      continue
    } else {
      console.log(`Download icon-set/${dir}.js success`)
    }

    const { name, ...iconsKey } = response.default
    const icons = [...new Set(
      Object.values(iconsKey)
        .flatMap(Object.values)
        .map(value => !(name.startsWith('material-icons') || name === 'fontawesome-v7') 
          ? value  
          : name === 'fontawesome-v7'
            ? 'fa-' + value.replace(' fa-', '$') 
            : 'mat_' + value
        )
    )]

    result[name] = icons
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(result, null, 2), 'utf8')
}