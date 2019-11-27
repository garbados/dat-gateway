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

const TEST_HOST = 'dat.localhost'
const TEST_PORT = '5917'
const TEST_GATEWAY = `${TEST_HOST}:${TEST_PORT}`
const TEST_DNS_KEY = 'garbados.hashbase.io'
const TEST_KEY = 'c33bc8d7c32a6e905905efdbf21efea9ff23b00d1c3ee9aea80092eaba6c4957'
const TEST_ENC_KEY = hexTo32.encode(TEST_KEY)

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
    this.gateway = new DatGateway({
      dir,
      loopback: TEST_HOST,
      period,
      ttl
    })
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
      const req = http.get(`http://${TEST_GATEWAY}/`, resolve)
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
      assert.strictEqual(res.headers.location, `http://${TEST_GATEWAY}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for :gateway/:invalid_key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${TEST_GATEWAY}/whoop-whoop-test/`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 404)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for gateway/:dead_key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${TEST_GATEWAY}/af75142d92dd1e456cf2a7e58a37f891fe42a1e49ce2a5a7859de938e38f4642/`, resolve)
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

  it('should handle websockets for replication', async function () {
    const archive = hyperdrive(ram, Buffer.from(TEST_KEY, 'hex'))
    const url = `ws://${TEST_GATEWAY}/${TEST_KEY}`
    const socket = websocket(url)

    await new Promise((resolve, reject) => {
      archive.once('error', reject)
      archive.once('ready', () => {
        socket.pipe(archive.replicate({
          live: true
        })).pipe(socket)
      })
      archive.on('update', () => {
        return resolve(socket)
      })
    })

    await await new Promise(resolve => setTimeout(resolve, 2000))

    // assert favicon exists
    await new Promise((resolve, reject) => {
      archive.access('/icons/favicon.ico', 'utf-8', (e, content) => {
        if (e) reject(e)
        else resolve(content)
      })
    })

    await new Promise(resolve => socket.end(resolve))
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
      const req = http.get(`http://${TEST_GATEWAY}/${TEST_DNS_KEY}/icons/favicon.ico`, resolve)
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
      const req = http.get(`http://${TEST_GATEWAY}/${TEST_KEY}/icons/favicon.ico`, resolve)
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
      http.get(`http://${TEST_GATEWAY}/${TEST_DNS_KEY}`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `/${TEST_DNS_KEY}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect requests for :gateway/:key to :gateway/:key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${TEST_GATEWAY}/${TEST_KEY}`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `/${TEST_KEY}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should not redirect loop requests for :gateway/:key/', function () {
    return new Promise((resolve) => {
      http.get(`http://${TEST_GATEWAY}/${TEST_KEY}/`, resolve)
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
    this.gateway = new DatGateway({
      dir,
      loopback: TEST_HOST,
      period,
      redirect: true,
      ttl
    })
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
      http.get(`http://${TEST_GATEWAY}/${TEST_DNS_KEY}/index.html`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${TEST_DNS_KEY}.${TEST_GATEWAY}/index.html`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect from :b32_key.localhost to :b32_key.:gateway', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${TEST_ENC_KEY}.localhost:5917/`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${TEST_ENC_KEY}.${TEST_GATEWAY}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should redirect from :dns_key.localhost to :dns_key.:gateway', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${TEST_DNS_KEY}.localhost:5917/`, resolve)
      req.on('error', console.log)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${TEST_DNS_KEY}.${TEST_GATEWAY}/`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should not redirect requests for :dns_key.:gateway/:path to :dns_key.:gateway/:path/', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${TEST_DNS_KEY}.${TEST_GATEWAY}/index.html`, resolve)
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
      http.get(`http://${TEST_GATEWAY}/${TEST_KEY}/test/long/path`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 302)
      assert.strictEqual(res.headers.location, `http://${TEST_ENC_KEY}.${TEST_GATEWAY}/test/long/path`)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for :dns_key.:gateway/:path', function () {
    return new Promise((resolve) => {
      const req = http.get(`http://${TEST_DNS_KEY}.${TEST_GATEWAY}/icons/favicon.ico`, resolve)
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
      const req = http.get(`http://${TEST_ENC_KEY}.${TEST_GATEWAY}/icons/favicon.ico`, resolve)
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
      http.get(`http://whoop-whoop-test.${TEST_GATEWAY}/`, resolve)
    }).then((res) => {
      assert.strictEqual(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })
})
