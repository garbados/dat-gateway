#!/usr/bin/env node

'use strict'

const DatGateway = require('.')
const os = require('os')
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
          description: 'Maximum number of archives to serve at a time.',
          default: 20
        },
        maxAge: {
          alias: 'M',
          description: 'Number of milliseconds before archives are removed from the cache.',
          default: 10 * 60 * 1000 // ten minutes
        }
      })
    },
    handler: function (argv) {
      const { host, port, dir, max, maxAge } = argv
      const gateway = new DatGateway({ dir, max, maxAge })
      gateway
        .listen(port, host)
        .then(function () {
          console.log('[dat-gateway] Now listening on ' + host + ':' + port)
        })
        .catch(console.error)
    }
  })
  .alias('h', 'help')
  .config()
  .parse()
