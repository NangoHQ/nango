const HtmlWebpackPlugin = require('html-webpack-plugin')
const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin')

const resolve = { extensions: ['.ts', '.tsx', '.js'] }
const moduleConf = {
  rules: [
    {
      test: /\.html$/,
      loader: 'html-loader'
    },
    {
      test: /\.ts(x?)$/,
      use: [
        {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.views.build.json'
          }
        }
      ],
      exclude: /node_modules/
    }
  ]
}

module.exports = [
  {
    resolve: resolve,
    entry: { 'callback-script': './views/callback-script.ts' },
    output: { path: __dirname + '/dist/views' },
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'callback.html',
        template: './views/callback.html',
        inlineSource: '.js$'
      }),
      new HtmlWebpackInlineSourcePlugin()
    ],
    module: moduleConf
  },
  {
    resolve: resolve,
    entry: { 'iframe-script': './views/iframe-script.ts' },
    output: { path: __dirname + '/dist/views' },
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'callback.html',
        template: './views/iframe.html',
        inlineSource: '.js$'
      }),
      new HtmlWebpackInlineSourcePlugin()
    ],
    module: moduleConf
  },
  {
    entry: { 'error-script': './views/error-script.ts' },
    output: { path: __dirname + '/dist/views' },
    plugins: [
      new HtmlWebpackPlugin({
        template: './views/page-not-found-error.html',
        filename: 'page-not-found-error.html',
        inlineSource: '.js$'
      }),
      new HtmlWebpackPlugin({
        template: './views/callback-url-request-error.html',
        filename: 'callback-url-request-error.html',
        inlineSource: '.js$'
      }),
      new HtmlWebpackPlugin({
        template: './views/oauth-error.html',
        filename: 'oauth-error.html',
        inlineSource: '.js$'
      }),
      new HtmlWebpackInlineSourcePlugin()
    ],
    resolve: resolve,
    module: moduleConf
  }
]
