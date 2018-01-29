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
          description: 'port for the gateway to listen on.',
          default: 3000
        },
        ttl: {
          alias: 't',
          description: 'number of seconds that archives stay in the cache.',
          default: 120
        },
        dir: {
          alias: 'd',
          description: 'directory to use as a persistent cache. Disables in-memory storage.',
          coerce: function (value) {
            return value.replace('~', os.homedir())
          },
          default: '~/.dat-gateway',
          normalize: true
        }
      })
    },
    handler: function (argv) {
      const { port, ttl, dir } = argv
      const gateway = new DatGateway({ ttl, dir })
      gateway
        .listen(port)
        .then(function () {
          console.log('DatGateway now listening on port ' + port)
        })
        .catch(console.error)
    }
  })
  .alias('h', 'help')
  .config()
  .parse()
