function idietIconMapFn (iconName) {
      const purePrefixes = ["mat_","ext-"]
      const faStyles = ['fa-solid', 'fa-regular', 'fa-brands']
      
      const parts = iconName.trim().split(/\s+/)
      const [first, second] = parts

      if (!first || parts.length > 2) return

      if (second) {
        if (faStyles.includes(first) && second.startsWith('fa-')) {
          return { cls: iconName.trim() }
        }
        return
      }

      if (purePrefixes.some(p => first.startsWith(p))) {
        return { cls: first }
      }
      
      return { cls: 'mat_' + first }
    }
      
    if (typeof module !== 'undefined' && module.exports) module.exports = {idietIconMapFn}

    export { idietIconMapFn }  
    