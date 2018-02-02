'use strict'

const DatLibrarian = require('dat-librarian')
const fs = require('fs')
const http = require('http')
const hyperdriveHttp = require('hyperdrive-http')
const path = require('path')

function log () {
  let msg = arguments[0]
  arguments[0] = '[dat-gateway] ' + msg
  if (process.env.DEBUG || process.env.LOG) {
    console.log.apply(console, arguments)
  }
}

module.exports =
class DatGateway extends DatLibrarian {
  constructor ({ dir, dat, max, net, ttl }) {
    super({ dir, dat, net })
    this.max = max
    this.ttl = ttl
  }

  load () {
    log('Setting up...')
    return this.getHandler().then((handler) => {
      log('Setting up server...')
      this.server = http.createServer(handler)
    }).then(() => {
      log('Loading pre-existing archives...')
      // load pre-existing archives
      return super.load()
    })
  }

  /**
   * Promisification of server.listen()
   * @param  {Number} port Port to listen on.
   * @return {Promise}     Promise that resolves once the server has started listening.
   */
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
      return super.close()
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
        // return index
        if (!address && !path) {
          res.writeHead(200)
          res.end(welcome)
          return Promise.resolve()
        }
        // return the archive
        return this.add(address).then((dat) => {
          // handle it!!
          const end = Date.now()
          log('[%s] %s %s | OK [%i ms]', address, req.method, path, end - start)
          req.url = `/${path}`
          dat.onrequest(req, res)
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

  add () {
    return super.add.apply(this, arguments).then((dat) => {
      log('Adding HTTP handler to archive...')
      dat.onrequest = hyperdriveHttp(dat.archive, { live: true, exposeHeaders: true })
      return new Promise((resolve) => {
        dat.archive.metadata.update(1, () => {
          resolve(dat)
        })
      })
    })
  }
}
