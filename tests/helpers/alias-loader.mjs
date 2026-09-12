/**
 * Resolves the app's own import specifiers when its modules are imported by
 * bare Node, which is how the tests run them.
 *
 * Two things a bundler does and Node does not: Nuxt's `~/` and `~~/` aliases,
 * and extensionless imports of neighbouring TypeScript files. Both only
 * started mattering when `shared/pdf-core.ts` became a runtime import shared
 * by the site and the bot; before that the app modules crossed file
 * boundaries only in type positions, which Node strips before resolving.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../../', import.meta.url)

export function resolve(specifier, context, next) {
  const aliased = specifier.startsWith('~~/')
    ? new URL(specifier.slice(3), ROOT).href
    : specifier.startsWith('~/')
      ? new URL(`app/${specifier.slice(2)}`, ROOT).href
      : null

  let target = aliased ?? specifier

  // Extensionless and relative (or just aliased): try the TypeScript file.
  const relative = target.startsWith('./') || target.startsWith('../')
  if ((aliased || relative) && !/\.[a-z]+$/i.test(target)) {
    const base = aliased ? target : new URL(target, context.parentURL).href
    if (existsSync(fileURLToPath(`${base}.ts`))) target = `${base}.ts`
  }

  return next(target, context)
}
