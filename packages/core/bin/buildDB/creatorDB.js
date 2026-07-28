import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from '../config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CORE_DIR = path.join(__dirname, '..', '..')
const DB_DIR = path.join(CORE_DIR, 'data')
const DB_PATH = path.join(DB_DIR, 'quasar-icons-db.json')

const NODE_MODULES = path.join(CORE_DIR, '..', '..', 'node_modules')
const ICONIFY_DIR = path.join(NODE_MODULES, '@iconify-json')
const QUASAR_EXTRAS_DIR = path.join(NODE_MODULES, '@quasar', 'extras', 'exports')

let quasarPkg = null
const quasarPkgPath = path.join(NODE_MODULES, '@quasar', 'extras', 'package.json')
if (fs.existsSync(quasarPkgPath)) quasarPkg = fs.readFileSync(quasarPkgPath, 'utf8')

let plainConfig = {}

for (const key of Object.keys(config.PACKS.iconify)) {
  plainConfig[key] = { source: 'iconify', separator: '-', ...config.PACKS.iconify[key] }
}

for (const key of Object.keys(config.PACKS.quasar)) {
  plainConfig[key] = { source: '@quasar/extras', ...config.PACKS.quasar[key] }
}

export async function buildDatabase (force = false) {
  if (fs.existsSync(DB_PATH) && !force) return

  console.log('Database build started...')

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }

  const db = {}
  let quasarDefaultParser = {}
  let iconifyDefaultParser = {}

  try {
    quasarDefaultParser = await import('./parsers/quasarDefault.js')
    iconifyDefaultParser = await import('./parsers/iconifyDefault.js')
  } catch (e) {
    console.error('Critical: Default parsers not found', e)
    return
  }
  
  for (const key of Object.keys(plainConfig)) {
    const pack = plainConfig[key]

    let packParser = {}
    try {
      if (pack.parser) packParser = await import(`./parsers/${pack.parser}`)
    } catch { }

    const defaultParser = pack.source === 'iconify' ? iconifyDefaultParser : quasarDefaultParser
    const parser = {
      getInfo: packParser.getInfo || defaultParser.getInfo,
      getIcons: packParser.getIcons || defaultParser.getIcons
    }

    let packJSON = null
    let packMetaJSON = null
    let packInfo = null

    if (pack.source === '@quasar/extras') {
      const filePath = path.join(QUASAR_EXTRAS_DIR, pack.dir, 'index.js')
      if (fs.existsSync(filePath)) {
        const fileUrl = pathToFileURL(filePath).href
        packJSON = await import(fileUrl)
      }

      const metaPath = path.join(ICONIFY_DIR, pack.iconifyMap, 'icons.json')
      if (fs.existsSync(metaPath)) packMetaJSON = fs.readFileSync(metaPath, 'utf8')
      
      packInfo = quasarPkg
    } else {
      const filePath = path.join(ICONIFY_DIR, pack.prefix, 'icons.json')
      if (fs.existsSync(filePath)) packJSON = fs.readFileSync(filePath, 'utf8')

      const metaPath = path.join(NODE_MODULES, '@iconify-json', pack.prefix, 'metadata.json')
      if (fs.existsSync(metaPath)) packMetaJSON = fs.readFileSync(metaPath, 'utf8')

      const infoPath = path.join(ICONIFY_DIR, pack.prefix, 'info.json')
      if (fs.existsSync(infoPath)) packInfo = fs.readFileSync(infoPath, 'utf8')  
    }

    const info = parser.getInfo(pack, packInfo)
    const icons = parser.getIcons(pack, packJSON, packMetaJSON)

    db[pack.prefix] = {
      key,
      title: info.title,
      author: pack.author,
      version: info.version,
      source: pack.source,
      license: info.license,
      color: pack.color,
      size: pack.size,
      separator: pack.separator,
      icons: icons,
      count: Object.keys(icons).length
    }
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
  console.log('Database build completed successfully!')
}
