/* global describe it before after beforeEach afterEach */

const assert = require('assert')
const fs = require('fs')
const http = require('http')
const hyperdrive = require('hyperdrive')
const mkdirp = require('mkdirp')
const nock = require('nock')
const path = require('path')
const ram = require('random-access-memory')
const rimraf = require('rimraf')
const websocket = require('websocket-stream')

const DatGateway = require('.')

const NOCK_DIR = '.nock'
const RECORD_TESTS = !!process.env.RECORD_TESTS

const dir = '.NOCK_DIR'
const ttl = 4000
const period = 1000

const recordOrLoadNocks = function () {
  const titles = []
  let test = this.currentTest
  while (test.parent && test.title !== 'dat-gateway') {
    titles.unshift(test.title)
    if (test.parent) { test = test.parent }
  }
  const dir = path.join(NOCK_DIR, ...titles.slice(0, -1))
  const name = `${titles.slice(-1)[0]}.json`
  this._currentNock = { titles, dir, name }
  if (RECORD_TESTS) {
    nock.recorder.rec({
      output_objects: true,
      dont_print: true
    })
  } else {
    try {
      nock.load(path.join(dir, name))
    } catch (error) {
      if (error.code === 'ENOENT') {
        // no nock
      } else {
        throw error
      }
    }
  }
}

const concludeNocks = function () {
  if (RECORD_TESTS) {
    // save http requests for future nocking
    const { dir, name } = this._currentNock
    const fixturePath = path.join(dir, name)
    const nockCallObjects = nock.recorder.play()
    mkdirp.sync(dir)
    fs.writeFileSync(fixturePath, JSON.stringify(nockCallObjects), 'utf8')
    nock.restore()
    nock.recorder.clear()
  } else if (!nock.isDone()) {
    console.error(nock.pendingMocks())
    throw new Error(`${nock.pendingMocks().length} pending mocks`)
  }
}

describe('dat-gateway', function () {
  this.timeout(0)

  before(async function () {
    nock.disableNetConnect()
    nock.enableNetConnect('localhost:5917')
    this.gateway = new DatGateway({ dir, ttl, period })
    await this.gateway.load()
    return this.gateway.listen(5917)
  })

  after(async function () {
    await this.gateway.close()
    rimraf.sync(dir)
  })

  beforeEach(function () {
    recordOrLoadNocks.call(this)
  })

  afterEach(async function () {
    concludeNocks.call(this)
  })

  it('should exist', function () {
    assert.strictEqual(this.gateway.dir, dir)
  })

  it('should handle requests', function () {
    return new Promise((resolve) => {
      const req = http.get('http://localhost:5917/garbados.hashbase.io/icons/favicon.ico', resolve)
      req.on('error', console.log)
    }).then((res) => {
      // should display empty index, s.t. an attacker cannot determine
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for dead addresses', function () {
    return new Promise((resolve) => {
      http.get('http://localhost:5917/af75142d92dd1e456cf2a7e58a37f891fe42a1e49ce2a5a7859de938e38f4642/', resolve)
    }).then((res) => {
      // show blank index
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect requests without a trailing slash', function () {
    return new Promise((resolve) => {
      http.get('http://localhost:5917/af75142d92dd1e456cf2a7e58a37f891fe42a1e49ce2a5a7859de938e38f4642', resolve)
    }).then((res) => {
      // show blank index
      assert.strictEqual(res.statusCode, 302)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should proactively deleted expired archives', function () {
    return new Promise((resolve) => {
      const checker = setInterval(() => {
        // assert that they have been deleted
        if (this.gateway.keys.length === 0) {
          clearInterval(checker)
          return resolve()
        }
      }, ttl)
    })
  })

  it('should handle websockets for replication', function () {
    // Key for gardos.hashbase.io
    const key = 'c33bc8d7c32a6e905905efdbf21efea9ff23b00d1c3ee9aea80092eaba6c4957'

    const url = `ws://localhost:5917/${key}`

    let socket = null

    return new Promise((resolve, reject) => {
      const archive = hyperdrive(ram, Buffer.from(key, 'hex'))
      archive.once('error', reject)
      archive.once('ready', () => {
        socket = websocket(url)

        socket.pipe(archive.replicate({
          live: true
        })).pipe(socket)

        setTimeout(() => {
          archive.readFile('/icons/favicon.ico', (e, content) => {
            if (e) reject(e)
            else resolve(content)
          })
        }, 3000)
      })
    }).then((content) => {
      socket.end()
    }, (e) => {
      socket.end()
      console.error(e.message)
      throw e
    })
  })
})
