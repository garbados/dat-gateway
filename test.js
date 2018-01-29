/* global describe it before after */

const assert = require('assert')
const http = require('http')
const DatGateway = require('.')

const dir = './fixtures'

describe('dat-gateway', function () {
  before(function () {
    this.gateway = new DatGateway({ dir })
  })

  after(function () {
    return this.gateway.close().then(() => {
      process.exit(0)
    })
  })

  it('should exist', function () {
    assert.equal(this.gateway.dir, './fixtures')
  })

  it('should handle requests', function () {
    const gateway = new DatGateway({ dir: './fixtures' })
    return gateway.listen(5917).then(() => {
      return new Promise((resolve) => {
        http.get('http://localhost:5917/garbados.hashbase.io/', resolve)
      })
    }).then((res) => {
      assert.equal(res.statusCode, 200)
    })
  })
})
