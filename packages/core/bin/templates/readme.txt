[icon-diet] Integration guide for Quasar

1. Copy 'idiet' folder (incl. 'idiet.css', 'idiet-boot.js', and 'idietIconMapFn.js')
into your project's 'src' directory.

2. In your quasar.config.js/.ts:
2.1. Add or update the "boot" section:
{
  boot: [
    ...
    '../idiet/idiet-boot'
    ...
  ],
  ...
}

2.2. RECOMMENDED: Remove standard icon packs from 'extras' section to avoid layout conflicts:
material-icons, material-symbols, mdi-v7, fontawesome-v7.

3. If "Loading the font 'data:font/woff2...'" error appears in console:
Go to index.html (project root), find <meta http-equiv="Content-Security-Policy" tag,
and add "font-src 'self' data:;" inside its content attribute.

4. Do not remap $q.iconMapFn in your project.

5. WARNING! When using Quasar component icons (iconSet), only the following sets are supported:
   - Material Icons (Quasar default)
   - Material Symbols
   - MDI v7
   - Font Awesome v7

6. Restart the dev server in CLI:
   quasar dev