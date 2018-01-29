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
        }
      })
    },
    handler: function (argv) {
      const { port, dir } = argv
      const gateway = new DatGateway({ dir })
      gateway
        .listen(port)
        .then(function () {
          console.log('[dat-gateway] Now listening on port ' + port)
        })
        .catch(console.error)
    }
  })
  .alias('h', 'help')
  .config()
  .parse()
