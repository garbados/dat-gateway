#!/usr/bin/env node

'use strict'

const program = require('commander')
const DatGateway = require('../lib')
const pkg = require('../package.json')

const defaults = {
  port: 3000,
  ttl: 120,
  dir: false
}

program
  .version(pkg.version)
  .option('-p, --port [port]', 'port for the gateway to listen on.', defaults.port)
  .option('-t, --ttl [seconds]', 'number of seconds that archives stay in the cache.', defaults.ttl)
  .option('-d, --dir [path]', 'directory to use as a persistent cache. Disables in-memory storage.', defaults.dir)
  .parse(process.argv)

const server = DatGateway.server(program.ttl, program.dir)
server.listen(program.port, () => {
  console.log(`Ready! ${pkg.name} now listening happily on ${program.port}.`)
})
