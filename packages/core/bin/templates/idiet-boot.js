import { defineBoot } from '#q-app'
import './idiet.css'
import idietIconMapFn from './idietIconMapFn.js'

export default defineBoot(({ app }) => {
  app.config.globalProperties.$q.iconMapFn = idietIconMapFn
})
