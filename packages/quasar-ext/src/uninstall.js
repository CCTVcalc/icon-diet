export default function (api) {
  api.onExitLog(`
======================================================================
  ❎ Quasar App Extension Icon Diet successfully uninstalled!
======================================================================
  🟡 IMPORTANT:
  1. The "src/idiet/" folder containing all generated fonts and icons 
     was NOT DELETED. You can manually delete it if it is no longer needed.
  2. To restore standard icons, remember to re-enable them in the 
     "extras" section of your "quasar.config.js/.ts" file.
======================================================================`)
}