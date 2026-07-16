export default function (api) {
  api.onExitLog(`
======================================================================
  🎉 Quasar App Extension Icon Diet successfully installed!
======================================================================
  📂 First initialization will happen automatically on the first run, 
  and the extension will create the "src/idiet/" folder.

  ⚠️ CRITICAL STEP REQUIRED:
  Please open "quasar.config.js/.ts" and remove or comment out 
  standard icon packages from the "extras" section 
  (e.g., 'material-icons', 'mdi-v7', etc.) to apply optimization.

  💡 HOW TO USE:
  quasar run icon-diet [start | add-icon <name...> | scan | help | ...]
======================================================================`
  )
}