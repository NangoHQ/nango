import { UserError } from '../errors'

export class InvalidApiConfig extends UserError {
  constructor(label: string, subAttribute: string | undefined, variableName: string) {
    const subText = subAttribute ? ` '${subAttribute}'` : ''
    super(
      `The API's ${label}${subText} has been configured with an invalid variable \${${variableName}}.`,
      422,
      'INVALID_API_CONFIG'
    )
  }
}

export class MissingApiConfigHeader extends UserError {
  constructor(label: string, subAttribute: string | undefined, variableName: string) {
    const subText = subAttribute ? ` '${subAttribute}'` : ''
    const header = variableName.split('.')[1]
    super(
      `The API's ${label}${subText} configuration requires the '${header}' header to be passed with each request.`,
      400,
      'MISSING_API_CONFIG_HEADER'
    )
  }
}

export class MissingApiConfigConnectParam extends UserError {
  constructor(label: string, subAttribute: string | undefined, variableName: string) {
    const subText = subAttribute ? ` '${subAttribute}'` : ''
    const param = variableName.split('.')[1]
    super(
      // tslint:disable-next-line:max-line-length
      `The API's ${label}${subText} configuration requires the '${param}' query parameter to be passed when connecting.`,
      400,
      'MISSING_API_CONFIG_HEADER'
    )
  }
}
