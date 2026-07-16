import fs from 'node:fs'
import path from 'node:path'
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
    const primaryUrl = `https://fastly.jsdelivr.net/npm/quasar@2/icon-set/${dir}.js`
    const fallbackUrl = `https://unpkg.com/quasar@2/icon-set/${dir}.js`

    let response = null

    try {
      response = await fetch(primaryUrl)
      if (!response.ok) response = await fetch(fallbackUrl)
    } catch {
      try {
        response = await fetch(fallbackUrl)
      } catch {}
    }

    if (!response || !response.ok) {
      console.error(`Failed to download icon-set/${dir}.js from all CDN sources`)
      continue
    }

    try {
      const text = await response.text()
      const matches = text
        .replace(/name\s*:\s*['"`][a-zA-Z0-9_\s-]+['"`]/, '')
        .matchAll(/(?<=:\s*['"`])[a-zA-Z0-9_\s-]+(?=['"`])/g)
      
      const prefix = quasarPacks[key].prefix
      const s = quasarPacks[key].separator || '_'

      const names = new Set()
      
      const isFontAwesome = /^fa[srbld]?$/.test(prefix.trim())

      for (const match of matches) {
        let val = match[0].trim()

        if (isFontAwesome) {
          names.add(val.replace(/\s+fa-/, '$'))
        } else {
          if (prefix !== 'mat' && prefix.startsWith('mat')) val = 'mat' + '_' + val
          if (val.startsWith(prefix + s)) val = val.slice((prefix + s).length)

          names.add(val)
        }
      }

      if (names.size > 0) {
        result[dir] = Array.from(names)
        console.log(`Download icon-set/${dir}.js success`)
      } else {
        console.warn(`No icons found in icon-set/${dir}.js`)
      }
    } catch (error) {
      console.error(`Error parsing icon-set/${dir}.js:`, error)
    }
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(result, null, 2), 'utf8')
}