'use strict'

const http = require('http')
const Dat = require('dat-node')
const hyperdriveHttp = require('hyperdrive-http')
// const Cache = require('node-cache')

const DAT_REGEX = /^([0-9a-f]{64})/i

class DatGateway {
  constructor (ttl = 120, dir = false) {
    this.ttl = ttl
    this.dir = dir
    this.dats = {} // FIXME replace with cache
    // this.cache = new Cache({
    //   // TODO ttl, etc
    // })
  }

  handler (req, res) {
    // validate params
    var urlParts = req.url.split('/')
    var key = this.getDatKey(urlParts[1])
    var path = urlParts.slice(2).join('/')
    if (!key) {
      res.writeHead(404)
      return res.end('Invalid Dat key. Must be provided /{datKey}/{path...}')
    }

    // fetch dat
    this.getDat(key, (err, dat) => {
      if (err) {
        res.writeHead(500)
        return res.end('' + err)
      }

      req.url = '/' + path
      dat.onRequest(req, res)
    })
  }

  getDatKey (key) {
    return DAT_REGEX.test(key) ? key : false
  }

  getDat (key, cb) {
    if (Array.isArray(typeof this.dats[key])) {
      // list of callbacks
      return this.dats[key].push(cb)
    } else if (this.dats[key]) {
      return cb(null, this.dats[key])
    }

    // create callback list
    this.dats[key] = [cb]

    // create the dat
    Dat(this.dir || './.tmp', {
      key,
      temp: !this.dir
    }, (err, dat) => {
      const done = (err) => {
        // run CBs
        var cbs = this.dats[key]
        this.dats[key] = dat
        cbs.forEach(cb => cb(err, dat))
      }

      if (dat) {
        // Join Dat's p2p network to download the site
        dat.joinNetwork()

        // create http server
        dat.onRequest = hyperdriveHttp(dat.archive, {
          live: true,
          exposeHeaders: true
        })

        // download metadata
        dat.archive.metadata.update(done)
      } else {
        done(err)
      }
    })
  }

  static get DAT_REGEX () {
    return DAT_REGEX
  }

  static server (ttl, dir) {
    const gateway = new DatGateway(ttl, dir)
    var server = http.createServer(gateway.handler.bind(gateway))
    server.gateway = gateway
    return server
  }
}

module.exports = DatGateway
