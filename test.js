/* global describe it before after */

const assert = require('assert')
const http = require('http')
const DatGateway = require('.')
const rimraf = require('rimraf')

const dir = 'fixtures'

describe('dat-gateway', function () {
  this.timeout(0)

  before(function () {
    this.gateway = new DatGateway({ dir })
    return this.gateway.load().then(() => {
      return this.gateway.listen(5917)
    })
  })

  after(function () {
    return this.gateway.close().then(() => {
      rimraf.sync(dir)
    })
  })

  it('should exist', function () {
    assert.equal(this.gateway.dir, dir)
  })

  it('should handle requests', function () {
    return new Promise((resolve) => {
      const req = http.get('http://localhost:5917/garbados.hashbase.io/icons/favicon.ico', resolve)
      req.on('error', console.log)
    }).then((res) => {
      // should display empty index, s.t. an attacker cannot determine
      assert.equal(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })

  it('should handle requests for dead addresses', function () {
    return new Promise((resolve) => {
      http.get('http://localhost:5917/af75142d92dd1e456cf2a7e58a37f891fe42a1e49ce2a5a7859de938e38f4642', resolve)
    }).then((res) => {
      // show blank index
      assert.equal(res.statusCode, 200)
    }).catch((e) => {
      console.error(e)
      throw e
    })
  })
})
