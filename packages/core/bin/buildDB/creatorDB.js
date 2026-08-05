import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from '../config.js'

const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CORE_DIR = path.join(__dirname, '..', '..')
const DB_DIR = path.join(CORE_DIR, 'data')
const DB_PATH = path.join(DB_DIR, 'quasar-icons-db.json')

const quasarRoot = path.dirname(require.resolve('@quasar/extras/package.json'))
const exportsPath = path.join(quasarRoot, 'exports')
const QUASAR_EXTRAS_DIR = fs.existsSync(exportsPath) ? exportsPath : quasarRoot

const ICONIFY_DIR = require.resolve.paths('./')
  .map(p => path.join(p, '@iconify-json'))
  .find(fs.existsSync)

let quasarPkg = null
const quasarPkgPath = path.join(quasarRoot, 'package.json')
if (fs.existsSync(quasarPkgPath)) quasarPkg = fs.readFileSync(quasarPkgPath, 'utf8')

let plainConfig = {}

for (const key of Object.keys(config.PACKS.iconify))
  plainConfig[key] = { source: 'iconify', separator: '-', ...config.PACKS.iconify[key] }

for (const key of Object.keys(config.PACKS.quasar))
  plainConfig[key] = { source: '@quasar/extras', ...config.PACKS.quasar[key] }

export async function buildDatabase (force = false) {
  if (fs.existsSync(DB_PATH) && !force) return

  console.log('Database build started...')

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

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

      if (ICONIFY_DIR && pack.iconifyMap) {
        const metaPath = path.join(ICONIFY_DIR, pack.iconifyMap, 'icons.json')
        if (fs.existsSync(metaPath)) packMetaJSON = fs.readFileSync(metaPath, 'utf8')
      }
      
      packInfo = quasarPkg
    } else if (ICONIFY_DIR) {
      const filePath = path.join(ICONIFY_DIR, pack.prefix, 'icons.json')
      if (fs.existsSync(filePath)) packJSON = fs.readFileSync(filePath, 'utf8')

      const metaPath = path.join(ICONIFY_DIR, pack.prefix, 'metadata.json')
      if (fs.existsSync(metaPath)) packMetaJSON = fs.readFileSync(metaPath, 'utf8')

      const infoPath = path.join(ICONIFY_DIR, pack.prefix, 'info.json')
      if (fs.existsSync(infoPath)) packInfo = fs.readFileSync(infoPath, 'utf8')  
    } else {
      packJSON = null
      packMetaJSON = null
      packInfo = null
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
