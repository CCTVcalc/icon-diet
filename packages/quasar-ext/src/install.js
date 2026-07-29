import fs from 'node:fs'

export default function (api) {
  const indexPath = api.resolve.app('index.html')

  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf-8')

    if (html.includes('Content-Security-Policy')) {
      if (/font-src/i.test(html)) {
        html = html.replace(/(font-src\s+[^"';]+)/i, (match) => {
          return match.includes('data:') ? match : `${match} data:`
        })
      } else {
        html = html.replace(
          /(http-equiv="Content-Security-Policy"[^>]*content="[^"]*)/i,
          "$1; font-src 'self' data:"
        )
      }
      
      fs.writeFileSync(indexPath, html, 'utf-8')
    }
  }

  api.onExitLog(`
======================================================================
  🎉 Quasar App Extension Icon Diet successfully installed!
======================================================================
  📂 First initialization will happen automatically on the first run, 
  and the extension will create the "src/idiet/" folder.

  🟡 CRITICAL STEP REQUIRED:
  Please open "quasar.config.js/.ts" and remove or comment out 
  standard icon packages from the "extras" section 
  (e.g., 'material-icons', 'mdi-v7', etc.) to apply optimization.

  💡 HOW TO USE:
  quasar run icon-diet [start | add-icon <name...> | scan | help | ...]
======================================================================`
  )
}