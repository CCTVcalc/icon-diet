export const api = {
  async searchIcons (packs = [], query = '', start = 0, limit = 100) {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ packs, query, start, limit })
    })
    return response.json()
  },

  async getIcon (prefixOrArray, name) {
    const isBatch = Array.isArray(prefixOrArray)
    const payload = isBatch 
      ? prefixOrArray 
      : (name ? { prefix: prefixOrArray, name } : prefixOrArray)

    const response = await fetch('/api/icon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    const result = await response.json()
    return isBatch ? result : result[0]
  },

  async uploadIcons (files) {
    const formData = new FormData()
    for (const file of files) {
      formData.append('icons', file)
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    })

    return response.json()
  },

  async getProjects () {
    const response = await fetch('/api/projects')
    return response.json()
  },

  async getProjectDetails (folderName) {
    const response = await fetch('/api/project-details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ folderName })
    })
    return response.json()
  },

  async getBaseIcons () {
    const response = await fetch('/api/base-icons')
    return response.json()
  },

  async getPacks () {
    const response = await fetch('/api/packs')
    return response.json()
  },

  async generateBundle (icons = []) {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ icons })
    })
    return response.json()
  },

  async getConfig () {
    const response = await fetch('/api/config')
    return response.json()
  },

  async getCurrentIcons () {
    const response = await fetch('/api/project-details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ })
    })
  
    return response.json()
  },

  async scanFiles (projectPath = '') {
    const response = await fetch('/api/scan-files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ projectPath })
    })
    return response.json()
  }
}