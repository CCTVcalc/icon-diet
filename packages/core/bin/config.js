const config = {
  port: 3322,
  PACKS: {
    quasar: {
      'material-icons': {
        title: "Material Icons by Google",
        size: 24,
        color: '#2196F3',
        dir: 'material-icons',
        separator: '_',
        prefix: 'mat',
        cutPrefix: 'mat',
        iconifyMap: 'ic',
        parser: 'mat.js'
      },
      'material-icons-outlined': {
        title: "Material Icons Outlined by Google",
        size: 24,
        color: '#1976D2',
        dir: 'material-icons-outlined',
        separator: '_',
        prefix: 'mat_o',
        cutPrefix: 'outlined',
        iconifyMap: 'ic'
      },
      'material-icons-round': {
        title: "Material Icons Rounded by Google",
        size: 24,
        color: '#0D47A1',
        dir: 'material-icons-round',
        separator: '_',
        prefix: 'mat_r',
        cutPrefix: 'round',
        iconifyMap: 'ic'
      },
      'material-icons-sharp': {
        title: "Material Icons Sharp by Google",
        size: 24,
        color: '#1565C0',
        dir: 'material-icons-sharp',
        separator: '_',
        prefix: 'mat_s',
        cutPrefix: 'sharp',
        iconifyMap: 'ic'
      },
      
      'material-symbols-outlined': {
        title: "Material Symbols Outlined by Google",
        size: 960,
        color: '#4285F4',
        dir: 'material-symbols-outlined',
        separator: '_',
        prefix: 'sym_o',
        cutPrefix: 'symOutlined',
        iconifyMap: 'material-symbols',
        parser: 'sym.js'
      },
      'material-symbols-rounded': {
        title: "Material Symbols Rounded by Google",
        size: 960,
        color: '#34A853',
        dir: 'material-symbols-rounded',
        separator: '_',
        prefix: 'sym_r',
        cutPrefix: 'symRounded',
        iconifyMap: 'material-symbols',
        parser: 'sym.js'
      },
      'material-symbols-sharp': {
        title: "Material Symbols Sharp by Google",
        size: 960,
        color: '#FBBC05',
        dir: 'material-symbols-sharp',
        separator: '_',
        prefix: 'sym_s',
        cutPrefix: 'symSharp',
        iconifyMap: 'material-symbols',
        parser: 'sym.js'
      },
      
      'mdi-v7': {
        title: "Material Design Icons (MDI) by Pictogrammers",
        size: 24,
        color: '#2196F3',
        dir: 'mdi-v7',
        separator: '-',
        prefix: 'mdi',
        cutPrefix: 'mdi',
        iconifyMap: 'mdi'
      },

      'fontawesome-v7': {
        title: "Font Awesome by Fonticons",
        size: 512,
        color: '#FF3D00',
        dir: 'fontawesome-v7',
        separator: '-',
        prefix: 'fa',
        cutPrefix: '',//['fas', 'fab', 'far'],
        iconifyMap: 'fa-solid',
        parser: 'fa.js'
      }
    },
    iconify: {
      'carbon': { title: 'Carbon Design System Icons by IBM', size: 32, color: '#0F62FE',  },
      'heroicons-solid': { title: 'Heroicons Solid by Tailwind Labs', size: 24, color: '#34D399' },
      'octicon': { title: 'Octicons by GitHub', size: 16, color: '#4ADE80', parser: 'octicon.js' }, // not include 12x12 and 24x24 icons
      'pixelarticons': { title: 'Pixelarticons by Gerrit Halfmann', size: 24, color: '#A7F3D0' },
      'ri': { title: 'Remix Icon by CoCo', size: 24, color: '#FF4A6B' }
    }
  },
  DYNAMIC_START_UNICODE: 0xe150,

  EXT_PACK: {
    prefix: 'ext',
    name: 'User extension icons',
    separator: '-', license: 'Local',
    version: '',
    color: '#0f9d58',
    size: 24
  },

  BASE_PACK: {
    // If app installed as extension in boot-file read iconSet params from quasar.config.js/.ts ignore BASE_PACK.iconSet.  
    iconSet: 'mdi-v7', // 'fontawesome-v7', // 'material-icons', // default value
    color: '#1976D2'
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { config }
}

export { config }
