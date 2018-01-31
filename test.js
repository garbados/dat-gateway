/* global describe it before after afterEach */

const assert = require('assert')
const http = require('http')
const DatGateway = require('.')

const dir = './fixtures'

describe('dat-gateway', function () {
  before(function () {
    this.gateway = new DatGateway({ dir })
    return this.gateway.setup()
  })

  afterEach(function () {
    return this.gateway.close()
  })

  after(function () {
    // FIXME dat doesn't close nicely
    process.exit(0)
  })

  it('should exist', function () {
    assert.equal(this.gateway.dir, './fixtures')
  })

  it('should handle requests', function () {
    this.timeout(0)
    return this.gateway.listen(5917).then(() => {
      return new Promise((resolve) => {
        const req = http.get('http://localhost:5917/garbados.hashbase.io/icons/favicon.ico', resolve)
        req.on('error', console.log)
      })
    }).then((res) => {
      // should display empty index, s.t. an attacker cannot determine
      assert.equal(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for dead addresses', function () {
    this.timeout(0)
    return this.gateway.listen(5917).then(() => {
      return new Promise((resolve) => {
        http.get('http://localhost:5917/af75142d92dd1e456cf2a7e58a37f891fe42a1e49ce2a5a7859de938e38f4642', resolve)
      })
    }).then((res) => {
      // show blank index
      assert.equal(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })
})
