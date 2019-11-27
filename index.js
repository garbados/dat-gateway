'use strict'

const DatLibrarian = require('dat-librarian')
const fs = require('fs')
const hexTo32 = require('hex-to-32')
const http = require('http')
const hyperdriveHttp = require('hyperdrive-http')
const path = require('path')
const Websocket = require('websocket-stream')
const { URL } = require('url')

const DAT_LOCALHOST_NAME = 'dat.localhost'
const IS_LOCALHOST_REGEX = /(localhost|\[?::1\]?|127(\.[0-9]{1,3}){3})$/
const BASE_32_KEY_LENGTH = 52
const ERR_404 = 'Not found'
const ERR_500 = 'Server error'

function log () {
  const msg = arguments[0]
  arguments[0] = '[dat-gateway] ' + msg
  if (process.env.DEBUG || process.env.LOG) {
    console.log.apply(console, arguments)
  }
}

module.exports =
class DatGateway extends DatLibrarian {
  constructor ({ dir, dat, loopback, max, net, period, ttl, redirect }) {
    dat = dat || {}
    if (typeof dat.sparse === 'undefined') {
      dat.sparse = dat.sparse || true // only download files requested by the user
    }
    if (typeof dat.temp === 'undefined') {
      dat.temp = dat.temp || true // store dats in memory only
    }
    log('Creating new gateway with options: %j', { dir, dat, max, net, period, ttl })
    super({ dir, dat, net })
    this.loopback = loopback || DAT_LOCALHOST_NAME
    this.max = max
    this.period = period
    this.redirect = redirect
    this.ttl = ttl
    this.lru = {}
    if (this.ttl && this.period) {
      this.cleaner = setInterval(() => {
        log('Checking for expired archives...')
        const tasks = Object.keys(this.dats).filter((key) => {
          const now = Date.now()
          const lastRead = this.lru[key]
          const isExpired = (lastRead && ((now - lastRead) > this.ttl))
          log('Archive %s expired? %s', key, isExpired)
          return isExpired
        }).map((key) => {
          log('Deleting expired archive %s', key)
          delete this.lru[key]
          return this.remove(key)
        })
        return Promise.all(tasks)
      }, this.period)
    }
  }

  load () {
    log('Setting up...')
    return this.getHandler().then((handler) => {
      log('Setting up server...')
      this.server = http.createServer(handler)
      const websocketHandler = this.getWebsocketHandler()
      this.websocketServer = Websocket.createServer({
        perMessageDeflate: false,
        server: this.server
      }, websocketHandler)
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
  listen (port, host) {
    return new Promise((resolve, reject) => {
      this.server.listen(port, host, (err) => {
        if (err) return reject(err)
        else return resolve()
      })
    })
  }

  async close () {
    if (this.cleaner) {
      log('Halting cleaner...')
      clearInterval(this.cleaner)
    }
    if (this.server) {
      await new Promise(resolve => this.server.close(resolve))
    }
    return super.close()
  }

  getIndexHtml () {
    return new Promise((resolve, reject) => {
      const filePath = path.join(__dirname, 'index.html')
      fs.readFile(filePath, 'utf-8', (err, html) => {
        if (err) return reject(err)
        else return resolve(html)
      })
    })
  }

  getWebsocketHandler () {
    return (stream, req) => {
      stream.on('error', function (e) {
        log('getWebsocketHandler has error: ' + e)
      })
      const urlParts = req.url.split('/')
      const address = urlParts[1]
      if (!address) {
        stream.end('Must provide archive key')
        return Promise.resolve()
      }
      return this.addIfNew(address).then((dat) => {
        const archive = dat.archive
        const replication = archive.replicate({
          live: true
        })

        // Relay error events
        replication.on('error', function (e) {
          stream.emit('error', e)
        })
        stream.pipe(replication).pipe(stream)
      }).catch((e) => {
        stream.end(e.message)
      })
    }
  }

  getHandler () {
    return this.getIndexHtml().then((welcome) => {
      return (req, res) => {
        const start = Date.now()
        const requestURL = `http://${req.headers.host}${req.url}`
        const urlParts = new URL(requestURL)
        const pathParts = urlParts.pathname.split('/').slice(1)

        let hostname = urlParts.hostname
        const hostIsOnLoopback = RegExp(IS_LOCALHOST_REGEX).test(hostname)

        // normalize loopback interface hostnames
        if (hostIsOnLoopback && !hostname.endsWith(this.loopback)) {
          hostname = hostname.replace(IS_LOCALHOST_REGEX, DAT_LOCALHOST_NAME)

          // redirect to normalized hostname
          res.writeHead(302, {
            'Access-Control-Allow-Origin': '*',
            Location: `http://${hostname}:${urlParts.port}${req.url}`
          })
          return res.end()
        }

        // normalized subdomain
        const hostParts = hostname.split('.')
        let subdomain = null
        if (hostIsOnLoopback && hostParts.length >= 3) {
          subdomain = hostParts.slice(0, -2).join('.')
        }

        // TODO: handle non-loopback subdomains, for now please put a reverse proxy mapping the domains in front of dat-gateway

        // get Dat archive key from subdomain or path
        let datKey = null
        if (subdomain) {
          if (subdomain.includes('.')) {
            datKey = subdomain
          } else if (subdomain.length === BASE_32_KEY_LENGTH) {
            datKey = hexTo32.decode(subdomain)
          }
        } else if (pathParts.length >= 1) {
          datKey = pathParts[0]
        }

        const isRedirected = Boolean(subdomain && datKey)
        const isRedirecting = Boolean(this.redirect && !subdomain && datKey)

        let path = '/'
        if (pathParts) {
          if (subdomain && isRedirected) {
            path = pathParts.join('/')
          } else if ((isRedirected || isRedirecting) && pathParts.length >= 2) {
            path = pathParts.slice(1).join('/')
          }
        }

        // return index
        if (path === '/' && !datKey && !isRedirected && !isRedirecting) {
          res.writeHead(200)
          return res.end(welcome)
        }

        // redirect /:key to /:key/
        if (!isRedirected && pathParts.length === 1 && !pathParts[0].endsWith('/') && pathParts[0] !== 'favicon.ico') {
          res.writeHead(302, {
            'Access-Control-Allow-Origin': '*',
            Location: `${req.url}/`
          })
          return res.end()
        } else {
          res.setHeader('Access-Control-Allow-Origin', '*')
        }

        const logError = (err, end) => log('[%s] %s %s | ERROR %s [%i ms]', datKey, req.method, path, err.message, end - start)
        log('[%s] %s %s', datKey, req.method, path)

        // redirect to subdomain
        if (isRedirecting) {
          return DatLibrarian.resolve(datKey).then((resolvedKey) => {
            const encodedDatKey = datKey.includes('.') ? datKey : hexTo32.encode(resolvedKey)
            const redirectURL = `http://${encodedDatKey}.${hostname}:${urlParts.port}/${path}${urlParts.search || ''}`
            log('Redirecting %s to %s', datKey, redirectURL)
            res.setHeader('Location', redirectURL)
            res.writeHead(302)
            res.end()
          }).catch((e) => {
            const end = Date.now()
            logError(e, end)
            res.writeHead(500)
            res.end(ERR_500)
          })
        }

        // Return a Dat DNS entry without fetching it from the archive
        if (path === '.well-known/dat') {
          return DatLibrarian.resolve(datKey).then((resolvedAddress) => {
            log('Resolving address %s to %s', datKey, resolvedAddress)

            res.writeHead(200)
            res.end(`dat://${resolvedAddress}\nttl=3600`)
          }).catch((e) => {
            const end = Date.now()
            logError(e, end)
            res.writeHead(500)
            res.end(ERR_500)
          })
        }

        // return the archive
        return this.addIfNew(datKey).then((dat) => {
          // handle it!!
          const end = Date.now()
          log('[%s] %s %s | OK [%i ms]', datKey, req.method, path, end - start)
          req.url = `/${path}${urlParts.search || ''}`
          dat.onrequest(req, res)
        }).catch((e) => {
          const end = Date.now()
          logError(e, end)
          if (e.message.indexOf('not found') > -1) {
            res.writeHead(404)
            res.end(ERR_404)
          } else {
            res.writeHead(500)
            res.end(ERR_500)
          }
        })
      }
    })
  }

  addIfNew (address) {
    return DatLibrarian.resolve(address).then((key) => {
      if (this.keys.indexOf(key) === -1) {
        return this.add(address)
      } else {
        this.lru[key] = Date.now()
        return this.get(key)
      }
    })
  }

  clearOldest () {
    const sortOldestFirst = Object.keys(this.lru).sort((a, b) => {
      return this.lru[a] - this.lru[b]
    })
    const oldest = sortOldestFirst[0]
    return this.remove(oldest)
  }

  add () {
    if (this.keys.length >= this.max) {
      // Delete the oldest item when we reach capacity and try again
      return this.clearOldest().then(() => this.add.apply(this, arguments))
    }
    return super.add.apply(this, arguments).then((dat) => {
      log('Adding HTTP handler to archive...')
      if (!dat.onrequest) dat.onrequest = hyperdriveHttp(dat.archive, { live: true, exposeHeaders: true })
      return new Promise((resolve) => {
        /*
        Wait for the archive to populate OR for 3s to pass,
        so that addresses for archives which don't exist
        don't hold us up all night.
         */
        let isDone = false
        const done = () => {
          if (isDone) return null
          isDone = true
          const key = dat.archive.key.toString('hex')
          this.lru[key] = Date.now()
          return resolve(dat)
        }
        dat.archive.metadata.update(1, done)
        setTimeout(done, 3000)
      })
    })
  }
}
