'use strict'

const Dat = require('dat-node')
const fs = require('fs')
const http = require('http')
const hyperdriveHttp = require('hyperdrive-http')
const path = require('path')
const NodeCache = require('node-cache')
const resolveDat = require('dat-link-resolve')
const rimraf = require('rimraf')

function log () {
  let msg = arguments[0]
  arguments[0] = '[dat-gateway] ' + msg
  if (process.env.DEBUG || process.env.LOG) {
    console.log.apply(console, arguments)
  }
}

module.exports =
class DatGateway {
  constructor ({ dir, dat, ttl }) {
    this.dir = dir
    this.datOptions = Object.assign({}, { temp: true }, dat || {})
    log('Starting gateway at %s with options %j', this.dir, { dat, ttl })
    this.cache = new NodeCache({
      useClones: false,
      stdTTL: ttl
    })
    this.cache.on('delete', (key, dat) => {
      const start = Date.now()
      log('Disposing of archive %s', key)
      dat.close(() => {
        const end = Date.now()
        rimraf.sync(path.join(this.dir, key))
        log('Disposed of archive %s in %i ms', key, end - start)
      })
    })
  }

  setup () {
    log('Setting up...')
    return this.getHandler().then((handler) => {
      log('Setting up server...')
      this.server = http.createServer(handler)
    }).then(() => {
      // check for existing archives if non-temp
      if (this.datOptions.temp) return null
      return new Promise((resolve, reject) => {
        // look for existing archives...
        log('Looking for existing archives...')
        fs.readdir(this.dir, (err, keys) => {
          if (err) return reject(err)
          else resolve(keys)
        })
      }).then((keys) => {
        const tasks = keys.map((key) => {
          // setup each existing archive...
          log('[%s] Setting up existing archive...', key)
          return this.getDat(key)
        })
        return Promise.all(tasks).then(() => {
          log('Existing archives set up.')
        })
      })
    })
  }

  listen (port) {
    return new Promise((resolve, reject) => {
      this.server.listen(port, (err) => {
        if (err) return reject(err)
        else return resolve()
      })
    })
  }

  close () {
    return new Promise((resolve) => {
      if (this.server) this.server.close(resolve)
      else resolve()
    }).then(() => {
      this.cache.flushAll()
    })
  }

  getIndexHtml () {
    return new Promise((resolve, reject) => {
      let filePath = path.join(__dirname, 'index.html')
      fs.readFile(filePath, 'utf-8', (err, html) => {
        if (err) return reject(err)
        else return resolve(html)
      })
    })
  }

  getHandler () {
    return this.getIndexHtml().then((welcome) => {
      return (req, res) => {
        const start = Date.now()
        // TODO redirect /:key to /:key/
        let urlParts = req.url.split('/')
        let address = urlParts[1]
        let path = urlParts.slice(2).join('/')
        log('[%s] %s %s', address, req.method, path)
        if (!address && !path) {
          res.writeHead(200)
          res.end(welcome)
          return Promise.resolve()
        }
        return this.resolveDat(address).then((key) => {
          return this.getDat(key).then((dat) => {
            // handle it!!
            const end = Date.now()
            log('[%s] %s %s | OK [%i ms]', address, req.method, path, end - start)
            req.url = `/${path}`
            dat.onrequest(req, res)
          })
        }).catch((e) => {
          const end = Date.now()
          log('[%s] %s %s | ERROR %s [%i ms]', address, req.method, path, e.message, end - start)
          if (e.message.indexOf('not found') > -1) {
            res.writeHead(404)
            res.end('Not found')
          } else {
            res.writeHead(500)
            res.end(JSON.stringify(e))
          }
        })
      }
    })
  }

  getDat (key) {
    return new Promise((resolve, reject) => {
      log('[%s] Retrieving archive...', key)
      // check local cache
      let dat = this.cache.get(key)
      if (dat) {
        log('[%s] Archive found in cache', key)
        return resolve(dat)
      }
      // retrieve from the web
      log('[%s] Not in cache. Retrieving from the web...', key)
      const opts = Object.assign({}, this.datOptions, { key })
      const dir = path.join(this.dir, key)
      Dat(dir, opts, (err, dat) => {
        if (err) {
          return reject(err)
        } else {
          dat.onrequest = hyperdriveHttp(dat.archive, { live: false, exposeHeaders: true })
          this.cache.set(key, dat)
          dat.joinNetwork()
          let isDone = false
          const done = () => {
            if (!isDone) {
              isDone = true
              if (dat.network.connections.length === 0) {
                log('[%s] No peers found. Using local.', key)
                return resolve(dat)
              } else {
                log('[%s] Archive retrieved.', key)
                return resolve(dat)
              }
            }
          }
          dat.archive.metadata.update(1, done)
          setTimeout(done, 3000)
        }
      })
    })
  }

  resolveDat (address) {
    return new Promise((resolve, reject) => {
      resolveDat(address, (err, key) => {
        if (err) {
          return reject(err)
        } else {
          return resolve(key)
        }
      })
    })
  }
}
