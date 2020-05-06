import request from 'supertest'

import { baseApp } from '../../../tests/utils'
import { intentStatusCode, proxyResponse } from './statusCodes'
import { TBackendRequestV4 } from '../../types'

const res = {
  status: jest.fn(() => res),
  end: jest.fn(() => res),
  send: jest.fn(() => res),
  json: jest.fn(() => res)
}

const defaultStatusCode = 200
const defaultPayload = JSON.stringify({ data: { foo: 'bar' } })

function setup(
  // tslint:disable-next-line:variable-name
  Payload = defaultPayload,
  // tslint:disable-next-line:variable-name
  StatusCode = defaultStatusCode
) {
  const next = jest.fn()
  const req = {
    bearerResponse: {
      StatusCode,
      Payload
    }
  } as Partial<TBackendRequestV4>

  return {
    res,
    req,
    next
  }
}

describe('StatusCode', () => {
  it('exports a function', () => {
    expect(intentStatusCode).toBeInstanceOf(Function)
  })

  it('returns the statusCode returned by the lambda', () => {
    const payload = JSON.stringify({ statusCode: 404, data: { foo: 'foo' } })
    const { req, res } = setup(payload)
    intentStatusCode(req as TBackendRequestV4, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.send).toHaveBeenCalledWith({ data: { foo: 'foo' } })
  })

  it('returns the statusCode by default', () => {
    const { req, res } = setup()
    intentStatusCode(req as TBackendRequestV4, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith({ data: { foo: 'bar' } })
  })

  it('returns the statusCode returned by AWS', () => {
    const payload = JSON.stringify({ data: { foo: 'foo' } })
    const statusCode = 403

    const { req, res } = setup(payload, statusCode)
    intentStatusCode(req as TBackendRequestV4, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.send).toHaveBeenCalledWith({ data: { foo: 'foo' } })
  })
})

describe('proxyResponse', () => {
  // tslint:disable-next-line:variable-name
  function setupApp(Payload: string) {
    const app = baseApp()
    app.use(
      '/',
      (req: any, _res, next) => {
        req.bearerResponse = { Payload }
        next()
      },
      proxyResponse
    )
    return app
  }

  it('set headers with correct content type (JSON)', async () => {
    const app = setupApp(
      JSON.stringify({
        data: {
          headers: {
            'custom-header': 'custom-value'
          },
          data: { jsonData: 'ok' },
          status: 201
        }
      })
    )

    await request(app)
      .get('/')
      .expect(201, '{"jsonData":"ok"}')
      .expect('custom-header', 'custom-value')
      .expect('content-type', /application\/json/)
  })

  it('set headers with correct content type (other)', async () => {
    const app = setupApp(
      JSON.stringify({
        data: {
          headers: {
            spongebob: 'rocks',
            'content-type': 'text/html'
          },
          data: 'something from virtual function',
          status: 201
        }
      })
    )

    await request(app)
      .get('/')
      .set('Accept', 'text/html')
      .expect(201, 'something from virtual function')
      .expect('content-type', /text\/html/)
  })

  it('filters out blacklisted headers', async () => {
    const app = setupApp(
      JSON.stringify({
        data: {
          headers: {
            'Content-Type': 'application/json',
            Upgrade: 'h2'
          },
          data: '{ "response": "data" }',
          status: 200
        }
      })
    )

    await request(app)
      .get('/')
      .expect('Content-Type', /application\/json/)
      .expect(res => {
        expect(res.get('Upgrade')).toBeUndefined()
      })

    expect.assertions(1)
  })

  describe('when the proxy lambda returns an error', () => {
    const error = { code: 'OOPS', message: 'something bad happened' }

    it('returns the error in the response', async () => {
      const app = setupApp(JSON.stringify({ error, statusCode: 401 }))

      await request(app)
        .get('/')
        .expect(401, { error })
    })

    describe('when no status code is returned', () => {
      it('returns a 422 code', async () => {
        const app = setupApp(JSON.stringify({ error }))

        await request(app)
          .get('/')
          .expect(422, { error })
      })
    })
  })
})
