#!/usr/bin/env node

'use strict'

const DatGateway = require('.')
const os = require('os')
const path = require('path')
const cacheDir = require('xdg-basedir').cache
const mkdirp = require('mkdirp')
const pkg = require('./package.json')

require('yargs')
  .version(pkg.version)
  .command({
    command: '$0',
    aliases: ['start'],
    builder: function (yargs) {
      yargs.options({
        host: {
          alias: 'l',
          description: 'Host or ip for the gateway to listen on.',
          default: '0.0.0.0'
        },
        port: {
          alias: 'p',
          description: 'Port for the gateway to listen on.',
          default: 3000
        },
        'dat-port': {
          alias: 'P',
          description: 'Port for Dat to listen on. Defaults to Dat\'s internal defaults.',
          default: null
        },
        dir: {
          alias: 'd',
          description: 'Directory to use as a cache.',
          coerce: function (value) {
            return value.replace('~', os.homedir())
          },
          default: path.join(cacheDir, 'dat-gateway'),
          normalize: true
        },
        max: {
          alias: 'm',
          description: 'Maximum number of archives allowed in the cache.',
          default: 20
        },
        period: {
          description: 'Number of milliseconds between cleaning the cache of expired archives.',
          default: 60 * 1000 // every minute
        },
        ttl: {
          alias: 't',
          description: 'Number of milliseconds before archives expire.',
          default: 10 * 60 * 1000 // ten minutes
        },
        redirect: {
          alias: 'r',
          description: 'Whether to use subdomain redirects',
          default: false
        },
        loopback: {
          alias: 'L',
          description: 'What hostname to use when serving locally.',
          default: 'dat.localhost'
        }
      })
    },
    handler: function (argv) {
      const { host, port, dir, 'dat-port': datPort, ...gatewayOpts } = argv
      mkdirp.sync(dir) // make sure it exists
      if (datPort) {
        gatewayOpts.dat = { port: datPort }
      }
      const gateway = new DatGateway({ dir, ...gatewayOpts })
      gateway
        .load()
        .then(() => {
          return gateway.listen(port)
        })
        .then(function () {
          console.log('[dat-gateway] Now listening on ' + host + ':' + port)
        })
        .catch(console.error)
    }
  })
  .alias('h', 'help')
  .config()
  .parse()
