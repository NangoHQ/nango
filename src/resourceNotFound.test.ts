import request from 'supertest'

import resourceNotFound from './resourceNotFound'
import { baseApp } from '../tests/utils'

describe('resourceNotFound middleware', () => {
  const app = baseApp()
  app.use(resourceNotFound)

  it('Returns 404 NOT_FOUND JSON response for non-HTML-accepting requests', async () => {
    const response = await request(app)
      .get('/qwerty')
      .set('Accept', 'application/json')
      .expect(404)
      .expect('Content-Type', /json/)

    expect(JSON.parse(response.text)).toMatchSnapshot()
  })

  it('Returns 404 NOT_FOUND HTML response for HTML-accepting requests', async () => {
    await request(app)
      .get('/qwerty')
      .set('Accept', 'text/html')
      .expect(404)
      .expect('Content-Type', /html/)
  })
})
