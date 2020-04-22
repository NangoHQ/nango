import express, { Express, RequestHandler, Request, ErrorRequestHandler, Response } from 'express'
import supertest from 'supertest'

const expressSession = jest.requireActual('express-session')

export function baseApp(stageVariables = {}) {
  const testApp = express()
  // replicates serverless express stuff
  testApp.use((req: any, _res, next) => {
    req.headers['x-amzn-trace-id'] = 'Root=aws-trace-id'
    req.stageVariables = {
      stage: 'test',
      developerPortalToken: 'a-developer-token',
      scopedUserDataTableId: 'tableName',
      masterKey: 'yZ23GR954QN4/QpvJ+OI78Iz/YrAeylM',
      webhookBaseURL: 'https://webhookBaseURL.bearer.sh',
      integrationConfigTableId: 'integration-config-table-id',
      servicesTableId: 'services-table-name',
      ...stageVariables
    }
    next()
  })

  return testApp
}

export const session = () => expressSession({ resave: false, secret: 'secret', saveUninitialized: false })

interface IMiddlewareTestHarnessParams<T, U> {
  configureRequest?: (req: T, res: Response) => void
  setupMiddlewares?: RequestHandler[]
  testMiddleware: U
  pathParams?: string[]
}

abstract class MiddlewareTestHarnessBase<T extends Request, U> {
  private agent: supertest.SuperTest<supertest.Test>
  private _req?: T
  private _err?: any
  private _view?: { name: string; options: any }

  constructor(protected params: IMiddlewareTestHarnessParams<T, U>) {
    this.agent = supertest.agent(this.setupApp())
  }

  private setupApp() {
    const { configureRequest, setupMiddlewares } = this.params

    const app = baseApp()

    if (setupMiddlewares) {
      app.use(setupMiddlewares)
    }

    app.use((req: T, res, next) => {
      this._req = req

      res.render = (name: string, options: any) => {
        this._view = { name, options }
        res.send()
      }

      if (configureRequest) {
        configureRequest(req, res)
      }

      next()
    })

    this.configureTestMiddleware(app)

    app.use((err, _req, _res, next) => {
      this._err = err
      next(err)
    })

    return app
  }

  protected abstract configureTestMiddleware(app: Express)

  protected pathSuffix() {
    const { pathParams } = this.params
    if (!pathParams) {
      return ''
    }

    return pathParams.map(name => `:${name}`).join('/')
  }

  get(path = '') {
    this._req = undefined
    this._err = undefined
    this._view = undefined
    return this.agent.get(`/get/${path}`)
  }

  get req() {
    if (!this._req) {
      throw new Error('No request. Please call `get` first')
    }

    return this._req
  }

  get err() {
    return this._err
  }

  get view() {
    return this._view
  }
}

export class MiddlewareTestHarness<T extends Request> extends MiddlewareTestHarnessBase<T, RequestHandler> {
  protected configureTestMiddleware(app) {
    app.get(`/get/${this.pathSuffix()}`, this.params.testMiddleware, (_req, res) => {
      res.status(200).end()
    })
  }
}

export class ErrorMiddlewareTestHarness<T extends Request> extends MiddlewareTestHarnessBase<T, ErrorRequestHandler> {
  private errorToThrow?: any

  protected configureTestMiddleware(app) {
    app.get(`/get/${this.pathSuffix()}`, (_req, _res, next) => {
      next(this.errorToThrow)
    })

    app.use(this.params.testMiddleware)
  }

  get(err: any, path = '') {
    this.errorToThrow = err
    return super.get(path)
  }
}
