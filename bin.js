#!/usr/bin/env node

'use strict'

const DatGateway = require('.')
const os = require('os')
const mkdirp = require('mkdirp')
const pkg = require('./package.json')

require('yargs')
  .version(pkg.version)
  .command({
    command: '$0',
    aliases: ['start'],
    builder: function (yargs) {
      yargs.options({
        port: {
          alias: 'p',
          description: 'Port for the gateway to listen on.',
          default: 3000
        },
        dir: {
          alias: 'd',
          description: 'Directory to use as a cache.',
          coerce: function (value) {
            return value.replace('~', os.homedir())
          },
          default: '~/.dat-gateway',
          normalize: true
        },
        ttl: {
          alias: 't',
          description: 'Number of milliseconds before archives are removed from the cache.',
          default: 10 * 60 * 1000 // ten minutes
        },
        persist: {
          alias: 'P',
          description: 'Persist archives to disk, rather than storing them in memory.',
          default: false
        }
      })
    },
    handler: function (argv) {
      const { port, dir, ttl, persist } = argv
      const dat = { temp: !persist }
      mkdirp.sync(dir) // make sure it exists
      const gateway = new DatGateway({ dir, dat, ttl })
      gateway
        .setup()
        .then(() => {
          return gateway.listen(port)
        })
        .then(function () {
          console.log('[dat-gateway] Now listening on port ' + port)
        })
        .catch(console.error)
    }
  })
  .alias('h', 'help')
  .config()
  .parse()
