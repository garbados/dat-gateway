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
const hexTo32 = require('hex-to-32')

const testGateway = 'dat.localhost:5917'
const testDnsKey = 'garbados.hashbase.io'
const testKey = 'c33bc8d7c32a6e905905efdbf21efea9ff23b00d1c3ee9aea80092eaba6c4957'
const testEncKey = hexTo32.encode(testKey)

const DatGateway = require('.')

const NOCK_DIR = '.nock'
const RECORD_TESTS = !!process.env.RECORD_TESTS

const dir = '.NOCK_DIR'
const ttl = 4000
const period = 1000

const recordOrLoadNocks = function () {
  const titles = []
  let test = this.currentTest
  while (test.parent) {
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
      nock.load(path.join(dir, encodeURIComponent(name)))
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
    const fixturePath = path.join(dir, encodeURIComponent(name))
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

beforeEach(function () {
  recordOrLoadNocks.call(this)
})

afterEach(async function () {
  concludeNocks.call(this)
})

describe('dat-gateway', function () {
  this.timeout(60 * 1000) // 1 minute

  before(async function () {
    this.gateway = new DatGateway({ dir, ttl, period })
    await this.gateway.load()
    return this.gateway.listen(5917)
  })

  after(async function () {
    await this.gateway.close()
    rimraf.sync(dir)
  })

  it('cache directory should exist', function () {
    assert.strictEqual(this.gateway.dir, dir)
  })

  it('index portal should exist', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${testGateway}/`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect index portal listening on loopback to normalized index portal host', function () {
    return new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:5917/', resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${testGateway}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for :gateway/:invalid_key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${testGateway}/whoop-whoop-test/`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 404)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for gateway/:dead_key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${testGateway}/af75142d92dd1e456cf2a7e58a37f891fe42a1e49ce2a5a7859de938e38f4642/`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
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
    const url = `ws://${testGateway}/${testKey}`

    let socket = null

    return new Promise((resolve, reject) => {
      const archive = hyperdrive(ram, Buffer.from(testKey, 'hex'))
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

describe('dat-gateway --redirect false', function () {
  this.timeout(0)

  before(function () {
    this.gateway = new DatGateway({ dir, ttl, period, redirect: false })
    return this.gateway.load().then(() => {
      return this.gateway.listen(5917)
    })
  })

  after(function () {
    return this.gateway.close().then(() => {
      rimraf.sync(dir)
    })
  })

  it('should handle requests for :gateway/:dns_key/:path', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${testGateway}/${testDnsKey}/icons/favicon.ico`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for :gateway/:key/:path', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${testGateway}/${testKey}/icons/favicon.ico`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect requests for :gateway/:dns_key to :gateway/:dns_key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${testGateway}/${testDnsKey}`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `/${testDnsKey}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect requests for :gateway/:key to :gateway/:key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${testGateway}/${testKey}`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `/${testKey}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should not redirect loop requests for :gateway/:key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${testGateway}/${testKey}/`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })
})

describe('dat-gateway --redirect true', function () {
  this.timeout(0)

  before(function () {
    this.gateway = new DatGateway({ dir, ttl, period, redirect: true })
    return this.gateway.load().then(() => {
      return this.gateway.listen(5917)
    })
  })

  after(async function () {
    await this.gateway.close()
    rimraf.sync(dir)
  })

  it('should redirect requests for :gateway/:dns_key/:path to :dns_key.:gateway/:path/', function () {
    return new Promise((resolve) => {
      http.get(`http://${testGateway}/${testDnsKey}/index.html`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${testDnsKey}.${testGateway}/index.html`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect from :b32_key.localhost to :b32_key.:gateway', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${testEncKey}.localhost:5917/`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${testEncKey}.${testGateway}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect from :dns_key.localhost to :dns_key.:gateway', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${testDnsKey}.localhost:5917/`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${testDnsKey}.${testGateway}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should not redirect requests for :dns_key.:gateway/:path to :dns_key.:gateway/:path/', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${testDnsKey}.${testGateway}/index.html`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect requests for :gateway/:key/:path to :b32_key.:gateway/:path/', function () {
    return new Promise((resolve) => {
      http.get(`http://${testGateway}/${testKey}/test/long/path`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${testEncKey}.${testGateway}/test/long/path`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for :dns_key.:gateway/:path', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${testDnsKey}.${testGateway}/icons/favicon.ico`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for :b32_key.:gateway/:path', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${testEncKey}.${testGateway}/icons/favicon.ico`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for :invalid_key.:gateway/', function () {
    return new Promise((resolve) => {
      http.get(`http://whoop-whoop-test.${testGateway}/`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })
})
