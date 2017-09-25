const _ = require('underscore')
const Dat = require('dat-node')
const express = require('express')
const fs = require('fs')
const hyperdriveHttp = require('hyperdrive-http')
const pkg = require('./package.json')

// constants
// =

const DAT_REGEX = /^([0-9a-f]{64})/i
const INDEX_HTML = fs.readFileSync('./public/index.html')

// default settings
// =

const DEFAULT_SETTINGS = {
  port: process.env.DAT_GATEWAY_PORT || 3000
}

// globals
// =

var dats = {} // FIXME globals are bad

// main class
// =

class DatGateway {
  constructor (settings) {
    this.settings = _.extend({}, DEFAULT_SETTINGS, settings)
    this.app = express()

    this.app.get('/', (req, res) => {
      return res.end(INDEX_HTML)
    })

    this.app.get('/:key/*', (req, res) => {
      return this.getAsset(req, res)
    })
  }

  start () {
    this.app.listen(this.settings.port)
    console.log('Listening on port ' + this.settings.port)
  }

  getAsset (req, res) {
    // validate params
    var key = DAT_REGEX.test(req.params.key) ? req.params.key : undefined
    var path = req.params[0] || ''
    if (!key) {
      res.writeHead(404)
      res.end('Not found')
    } else {
      // fetch dat
      this.getDat(key, (err, dat) => {
        if (err) {
          res.writeHead(500)
          return res.end('' + err)
        } else {
          req.url = '/' + path
          dat.onrequest(req, res) 
        }
      }) 
    }
  }

  getDat (key, cb) {
    if (Array.isArray(typeof dats[key])) {
      // list of callbacks
      dats[key].push(cb)
      return
    } else if (dats[key]) {
      return cb(null, dats[key])
    }

    // create callback list
    dats[key] = [cb]

    // create the dat
    Dat('./cache', {key, temp: true}, function (err, dat) {
      if (dat) {
        // Join Dat's p2p network to download the site
        dat.joinNetwork()

        // create http server
        dat.onrequest = hyperdriveHttp(dat.archive, {live: false, exposeHeaders: true})

        // download metadata
        dat.archive.metadata.update(done)
      } else {
        done(err)
      }

      function done (err) {
        // run CBs
        var cbs = dats[key]
        dats[key] = dat
        cbs.forEach(cb => cb(err, dat))
      }
    })
  }
}

module.exports = DatGateway
