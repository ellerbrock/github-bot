'use strict'

const tap = require('tap')
const fs = require('fs')
const path = require('path')
const url = require('url')
const nock = require('nock')
const supertest = require('supertest')
const proxyquire = require('proxyquire')

const testStubs = {
  './github-secret': {
    isValid: () => true,

    // necessary to make makes proxyquire return this stub
    // whenever *any* module tries to require('./github-secret')
    '@global': true
  }
}

tap.test('Sends POST request to https://api.github.com/repos/nodejs/node/issues/<PR-NUMBER>/labels', (t) => {
  const app = proxyquire('../../app', testStubs)

  const expectedLabels = ['timers']
  const webhookPayload = readFixture('pull-request-opened.json')

  const filesScope = nock('https://api.github.com')
                      .filteringPath(ignoreQueryParams)
                      .get('/repos/nodejs/node/pulls/19/files')
                      .reply(200, readFixture('pull-request-files.json'))

  const newLabelsScope = nock('https://api.github.com')
                        .filteringPath(ignoreQueryParams)
                        .post('/repos/nodejs/node/issues/19/labels', expectedLabels)
                        .reply(200)

  t.plan(1)
  t.tearDown(() => filesScope.done() && newLabelsScope.done())

  nock.emitter.on('no match', (req) => {
    // requests against the app is expected and we shouldn't need to tell nock about it
    if (req.hostname === '127.0.0.1') return

    const reqUrl = `${req._headers.host}${req.path}`
    t.bailout(`Unexpected request was sent to ${reqUrl}`)
  })

  supertest(app)
    .post('/hooks/github')
    .set('x-github-event', 'pull_request')
    .send(webhookPayload)
    .expect(200)
    .end((err, res) => {
      t.equal(err, null)
    })
})

function ignoreQueryParams (pathAndQuery) {
  return url.parse(pathAndQuery, true).pathname
}

function readFixture (fixtureName) {
  const content = fs.readFileSync(path.join(__dirname, '..', '_fixtures', fixtureName)).toString()
  return JSON.parse(content)
}
