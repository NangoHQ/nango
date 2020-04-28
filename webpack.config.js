const HtmlWebpackPlugin = require('html-webpack-plugin')
const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin')
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
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
    mode: mode,
    entry: { 'callback-script': './views/auth/src/callback-script.ts' },
    output: { path: __dirname + '/views/auth' },
    plugins: [
      new HtmlWebpackPlugin({
        template: './views/auth/src/callback.html',
        filename: 'callback.ejs',
        inlineSource: '.js$'
      }),
      new HtmlWebpackInlineSourcePlugin()
    ],
    module: moduleConf
  },
  {
    resolve: resolve,
    mode: mode,
    entry: { 'init-script': './views/auth/src/init-script.ts' },
    output: { path: __dirname + '/views/auth' },
    plugins: [
      new HtmlWebpackPlugin({
        template: './views/auth/src/init.html',
        filename: 'init.ejs',
        inlineSource: '.js$'
      }),
      new HtmlWebpackInlineSourcePlugin()
    ],
    module: moduleConf
  }
]
