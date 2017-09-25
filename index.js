const _ = require('underscore')
const http = require('http')
const Dat = require('dat-node')
const hyperdriveHttp = require('hyperdrive-http')
const pkg = require('./package.json')

// default settings
// =

const DEFAULT_SETTINGS = {
  port: process.env.DAT_GATEWAY_PORT || 3000,
  homepage: pkg.homepage
}

// main class
// =

class DatGateway {
  constructor (settings) {
    this.settings = _.extend({}, DEFAULT_SETTINGS, settings)
  }

  start () {
    // create server app
    var server = http.createServer(getAsset)
    server.listen(this.settings.port)
    console.log('Listening on port ' + this.settings.port)
  }
}

/*
BELOWE HERE BE YE OLDE CODE
WRITTEN LONGWISE AGO BY UNDERCOVER SKELETONS
SERVING IN THE SKELETON WAR
*/

// constants
// =

const DAT_REGEX = /^([0-9a-f]{64})/i

// globals
// =

var dats = {}

// main
// =

function getAsset (req, res) {
  // validate params
  var urlParts = req.url.split('/')
  var key = getDatKey(urlParts[1])
  var path = urlParts.slice(2).join('/')
  if (!key) {
    res.writeHead(404)
    return res.end('Invalid dat key. Must be provided /{dat-key}/{path...}')
  }

  // fetch dat
  getDat(key, (err, dat) => {
    if (err) {
      res.writeHead(500)
      return res.end('' + err)
    }

    req.url = '/' + path
    dat.onrequest(req, res)
  })
}

function getDatKey (key) {
  return DAT_REGEX.test(key) ? key : false
}

function getDat (key, cb) {
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

module.exports = DatGateway
