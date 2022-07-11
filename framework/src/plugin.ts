import bodyParser from 'body-parser'
import { Plugin } from 'vite'
import { getGraphQLParameters, processRequest, renderGraphiQL, shouldRenderGraphiQL, sendResult, Request } from 'graphql-helix'

import { renderPage } from 'vite-plugin-ssr'

import DataLayer from './lib/index'
import utils from './lib/utils'

// Types
import { IncomingMessage } from 'node:http'

export async function Wind (_options = {}): Promise<Plugin> {
  utils.reporter.info('Starting Wind with options:', JSON.stringify(_options, null, 2))

  utils.reporter.log('Starting build step in `buildStart`')

  const datalayer = new DataLayer()
  global.__SSG_DATALAYER = datalayer

  await datalayer.start()

  return {
    name: 'wind-ssg',
    enforce: 'pre',
    async transform (src, id) {
      if (!/vue&type=page-query/.test(id)) return

      utils.reporter.log('Transforming:', id)
      const data = { query: src }
      return `export default Comp => {
        Comp.pageQuery = ${JSON.stringify(data)}
      }`
    },
    configureServer (server) {
      return () => {
        utils.reporter.info('Configuring Vite server')

        let graphqlEndpoint = ''
        server.httpServer?.once('listening', () => {
          const host = !server.config.server?.host || typeof server.config.server.host === 'boolean' ? 'localhost' : server.config.server.host
          graphqlEndpoint = `http://${host || 'localhost'}:${server.config.server.port || 3000}/graphql`

          utils.reporter.success(`Created GraphQL endpoint at ${graphqlEndpoint}`)

          setTimeout(() => {
            console.log(`  > GraphQL Explorer: ${graphqlEndpoint}`)
          }, 0)
        })

        server.middlewares.use(bodyParser.json())

        server.middlewares.use(async (req, res, next) => {
          if (datalayer?.graphql.schema) {
            if (req.originalUrl === '/graphql') {
              const request: Request = {
                body: (req as IncomingMessage & { body: any }).body,
                headers: req.headers,
                method: req.method || 'POST',
                query: {}
              }

              if (shouldRenderGraphiQL(request)) return res.end(renderGraphiQL({ endpoint: graphqlEndpoint }))

              const { operationName, query, variables } = getGraphQLParameters(request)
              const result = await processRequest({
                operationName,
                query,
                variables,
                request,
                // TODO: We rebuild the schema each time here, so we may want to cache - either here, or in the actual method
                schema: datalayer.graphql.schema()
              })

              return sendResult(result, res)
            }
          }

          const pageContextInit = { url: req.originalUrl as string, datalayer }

          utils.reporter.log(`Starting render of ${pageContextInit.url}`)
          const pageContext = await renderPage(pageContextInit)

          if (pageContext.errorWhileRendering) {
            const error = pageContext.errorWhileRendering
            utils.reporter.error(`Failed to render page ${pageContextInit.url}`)
            utils.reporter.error(error)

            res.statusCode = 500
            res.end(typeof error === 'object' ? (error as Error).message : error)
          }

          if (!pageContext.httpResponse) return next()

          const { body, statusCode, contentType } = pageContext.httpResponse
          res.statusCode = statusCode
          res.setHeader('Content-Type', contentType).end(body)

          utils.reporter.success(`Successfully rendered page ${pageContextInit.url}`)
        })
      }
    }
  }
}
