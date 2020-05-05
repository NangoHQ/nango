const check = jest.fn()
const PAYLOAD = '{"data":{"myData":"ok","status":"200","data":{"data":{"myData":"ok"}}}}'
const handler = jest.fn((req, res, next) => {
  check({ ...req })
  req.bearerResponse = {
    Payload: PAYLOAD,
    StatusCode: 200
  }
  next()
})

const fetchAuthDetails = (req, _res, next) => {
  req.auth = {
    accessToken: 'test-access-token'
  }

  next()
}

jest.mock('../auth/v3/strategy', () => ({
  fetchAuthDetails,
  fetchAuthDetailsForFunctions: fetchAuthDetails
}))

import request from 'supertest'

import { baseApp } from '../../../tests/utils'
import router, { proxyFunction } from './router'

const app = baseApp()
app.use('/whatever', router())
app.use('/proxy', proxyFunction())

describe('proxyFunction', () => {
  beforeEach(async () => {
    check.mockClear()
    handler.mockClear()
  })

  describe('authenticate with api key and authId', () => {
    const setup = async () => {
      await request(app)
        .get('/proxy/github/user/repos')
        .set('Authorization', 'sk_my-api-key')
        .set('Bearer-Auth-Id', 'auth id')
        .expect(200, { data: { myData: 'ok' } })
    }

    it('sets req with expected variables', async () => {
      await setup()
      expect(handler).toHaveBeenCalledTimes(1)
      const req = check.mock.calls[0][0]
      expect(req.isBackend).toBe(true)
      expect(req.headers.authorization).toBe('sk_my-api-key')
      expect(req.headers['bearer-auth-id']).toBe('auth id')
    })
  })

  describe('authenticate with bearer-publishable-key', () => {
    const userCorrelationId = 'test-corr-id'
    const setup = async () => {
      await request(app)
        .get('/proxy/github/user/repos')
        .set('Bearer-Publishable-Key', 'pk_my-api-key')
        .set('Bearer-Auth-Id', 'auth id')
        .set('Bearer-Correlation-Id', userCorrelationId)
        .expect(200, { data: { myData: 'ok' } })
    }
    it('sets req with expected variables', async () => {
      await setup()
      expect(handler).toHaveBeenCalledTimes(1)
      const req = check.mock.calls[0][0]
      expect(req.isBackend).toBe(false)
      expect(req.headers.authorization).toBeUndefined()
      expect(req.headers['bearer-publishable-key']).toBe('pk_my-api-key')
      expect(req.headers['bearer-auth-id']).toBe('auth id')
    })
  })
})
