[icon-diet] Integration guide for Quasar

1. Copy 'idiet' folder (incl. 'idiet.css', 'idiet-boot.js', and 'idietIconMapFn.js') into your project's 'src' directory.

2. Add or update the following sections in your configuration file quasar.config.js/ts:

{
  boot: [
    ...
    '~src/idiet/idiet-boot'
    ...
  ],
  ...
}

3. Please REMOVE STANDARD ICON PACKS from 'extras' section in your configuration file quasar.config.js/ts to avoid layout conflicts: 
material-icons, material-symbols, mdi-v7, fontawesome-v7, ionicons-v8, eva-icons, bootstrap-icons.

4. Do not remap $q.iconMapFn in your project.

5. Restart the dev server in CLI: quasar dev.