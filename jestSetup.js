const nock = require('nock')

nock.disableNetConnect()
nock.enableNetConnect(/127.0.0.1:.*/)

process.env = {
  ...process.env,
  STAGE: 'test',
  COOKIE_SECRET: 'secret'
}
