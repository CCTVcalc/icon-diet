const config = {
  port: 3322,
  PACKS: {
    quasar: {
      'material-icons': {
        title: 'Material Icons',
        author: 'Google',
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
        title: 'Material Icons Outlined',
        author: 'Google',
        size: 24,
        color: '#1976D2',
        dir: 'material-icons-outlined',
        separator: '_',
        prefix: 'mat_o',
        cutPrefix: 'outlined',
        iconifyMap: 'ic'
      },
      'material-icons-round': {
        title: 'Material Icons Rounded',
        author: 'Google',
        size: 24,
        color: '#0D47A1',
        dir: 'material-icons-round',
        separator: '_',
        prefix: 'mat_r',
        cutPrefix: 'round',
        iconifyMap: 'ic'
      },
      'material-icons-sharp': {
        title: 'Material Icons Sharp',
        author: 'Google',
        size: 24,
        color: '#1565C0',
        dir: 'material-icons-sharp',
        separator: '_',
        prefix: 'mat_s',
        cutPrefix: 'sharp',
        iconifyMap: 'ic'
      },
      
      'material-symbols-outlined': {
        title: 'Material Symbols Outlined',
        author: 'Google',
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
        title: 'Material Symbols Rounded',
        author: 'Google',
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
        title: 'Material Symbols Sharp',
        author: 'Google',
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
        title: 'Material Design Icons',
        author: 'Pictogrammers',
        size: 24,
        color: '#2196F3',
        dir: 'mdi-v7',
        separator: '-',
        prefix: 'mdi',
        cutPrefix: 'mdi',
        iconifyMap: 'mdi'
      },

      'fontawesome-v7': {
        title: 'Font Awesome',
        author: 'Fonticons',
        size: 512,
        color: '#FF3D00',
        dir: 'fontawesome-v7',
        separator: '-',
        prefix: 'fa',
        cutPrefix: '', // manual cut
        iconifyMap: 'fa-solid',
        parser: 'fa.js'
      }
    },
    iconify: {
      'carbon': {
        title: 'Carbon Design System Icons',
        author: 'IBM',
        size: 32,
        color: '#0F62FE',
        prefix: 'carbon'
      },
      'heroicons-solid': {
        title: 'Heroicons Solid',
        author: 'Tailwind Labs',
        size: 24,
        color: '#34D399',
        prefix: 'heroicons-solid'
      },
      'octicon': {
        title: 'Octicons',
        author: 'GitHub',
        size: 16, // not include 12x12 and 24x24 icons
        color: '#4ADE80',
        parser: 'octicon.js',
        prefix: 'octicon'
      }, 
      'pixelarticons': {
        title: 'Pixelarticons',
        author: 'Gerrit Halfmann',
        size: 24,
        color: '#A7F3D0',
        prefix: 'pixelarticons'
      },
      'ri': {
        title: 'Remix Icon',
        author: 'CoCo',
        size: 24,
        color: '#FF4A6B',
        prefix: 'ri'
      }
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
    iconSet: 'material-icons', // default value
    color: '#1976D2'
  },

  SUPPORT_ICON_SET: [
    'material-icons',
    'material-icons-outlined',
    'material-icons-round',
    'material-icons-sharp',
    'material-symbols-outlined',
    'material-symbols-rounded',
    'material-symbols-sharp',
    'mdi-v7',
    'fontawesome-v7'
  ]
}

if (typeof module !== 'undefined' && module.exports) module.exports = { config }

export { config }
