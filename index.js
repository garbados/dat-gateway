'use strict'

const Dat = require('dat-node')
const http = require('http')
const hyperdriveHttp = require('hyperdrive-http')
const resolveDat = require('dat-link-resolve')

module.exports =
class DatGateway {
  constructor ({ dir, dat }) {
    this.dir = dir
    this.datOptions = Object.assign({}, dat || { temp: true })
    this.dats = {}

    const handler = this.handler()
    this.server = http.createServer(handler)
  }

  handler () {
    return (req, res) => {
      let urlParts = req.url.split('/')
      let address = urlParts[1]
      let path = urlParts.slice(2).join('/')
      return this.resolveDat(address).then((key) => {
        return this.getDat(key)
      }).then((dat) => {
        // handle it!!
        req.url = `/${path}`
        dat.onrequest(req, res)
      }).catch((e) => {
        if (e.message === 'DNS record not found') {
          res.writeHead(404)
          res.end('Not found')
        } else {
          res.writeHead(500)
          res.end(JSON.stringify(e))
        }
      })
    }
  }

  listen (port) {
    return new Promise((resolve, reject) => {
      this.server.listen(port, (err) => {
        if (err) return reject(err)
        else return resolve()
      })
    })
  }

  getDat (key) {
    // check local cache
    if (key in this.dats) return Promise.resolve(this.dats[key])
    // retrieve from the web
    return new Promise((resolve, reject) => {
      const opts = Object.assign({}, this.datOptions, { key })
      Dat(this.dir, opts, (err, dat) => {
        if (err) {
          return reject(err)
        } else {
          this.dats[key] = dat
          dat.joinNetwork()
          dat.onrequest = hyperdriveHttp(dat.archive, { live: true, exposeHeaders: true })
          dat.archive.metadata.update(() => {
            resolve(dat)
          })
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
