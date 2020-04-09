const fs = require('fs')
const path = require('path')
nock = require('nock')

nock.disableNetConnect()
nock.enableNetConnect(/127.0.0.1:.*/)

const env = fs.readFileSync(path.join(__dirname, 'config', 'config.test.json'), {
  encoding: 'utf8'
})

process.env = {
  ...process.env,
  STAGE: 'test',
  COOKIE_SECRET: 'secret',
  ...JSON.parse(env)
}
