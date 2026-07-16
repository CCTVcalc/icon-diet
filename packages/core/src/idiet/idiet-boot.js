import { boot } from 'quasar/wrappers'
import './idiet.css'
import idietIconMapFn from './idietIconMapFn.js'

export default boot(({ app }) => {
  app.config.globalProperties.$q.iconMapFn = idietIconMapFn
})
