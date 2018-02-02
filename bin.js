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
        max: {
          alias: 'm',
          description: 'Maximum number of archives allowed in the cache.',
          default: 20
        },
        period: {
          description: 'Number of milliseconds between cleaning the cache of expired archives.',
          default: 10 * 1000 // every ten seconds
        },
        persist: {
          alias: 'P',
          description: 'Persist archives to disk, rather than storing them in memory.',
          default: false
        },
        ttl: {
          alias: 't',
          description: 'Number of milliseconds before archives expire.',
          default: 10 * 60 * 1000 // ten minutes
        }
      })
    },
    handler: function (argv) {
      const { port, dir, max, persist, ttl } = argv
      const dat = { temp: !persist }
      mkdirp.sync(dir) // make sure it exists
      const gateway = new DatGateway({ dir, dat, max, ttl })
      gateway
        .load()
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
