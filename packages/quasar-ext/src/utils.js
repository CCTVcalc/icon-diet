import http from 'http'
import { fork } from 'node:child_process'
import { createRequire } from 'module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GUARD_INT = 5000
const require = createRequire(import.meta.url)

export async function executeBackendCommand (env) {
  const binPath = require.resolve('icon-diet-core/bin/index.js')
  const MAX_RETRIES = 3

  console.log(`\n🚀 [icon-diet] Starting background service...`)

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const port = Math.floor(Math.random() * (10000 - 8000) + 8000)

    const backendProcess = fork(binPath, [], {
      env: { ...env, PORT: port },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    })

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          backendProcess.kill()
          reject(new Error('TIMEOUT'))
        }, GUARD_INT)

        backendProcess.on('message', function listener(msg) {
          if (msg && msg.status === 'ready') {
            clearTimeout(timer)
            backendProcess.off('message', listener)
            resolve()
          }
        })
        
        backendProcess.once('exit', () => {
          clearTimeout(timer)
          reject(new Error('EXIT'))
        })
      })

      return {
        port,
        kill: () => { backendProcess.kill() }
      }

    } catch (err) {
      backendProcess.kill()

      if (attempt === MAX_RETRIES) {
        if (err.message === 'TIMEOUT') throw new Error('Background service failed to start (timeout).')
        else throw new Error('Background service crashed unexpectedly on startup.')
      }
    }
  }
}

export function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      res.setEncoding('utf8')
      
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Request failed with status ${res.statusCode}: ${body}`))
        }
        
        try {
          resolve(body ? JSON.parse(body) : {})
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}. Raw body: ${body}`))
        }
      })
    })

    req.on('error', reject)

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData))
    }
    req.end()
  })
}

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
