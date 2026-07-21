import { rm } from 'node:fs/promises'
import { build, spawn } from 'bun'

const entrypoints = ['src/index.ts']

await rm('dist', { force: true, recursive: true })

const builds = await Promise.all([
  build({
    entrypoints,
    outdir: 'dist',
    format: 'esm',
    target: 'browser',
    sourcemap: 'external'
  }),
  build({
    entrypoints,
    outdir: 'dist',
    format: 'cjs',
    target: 'node',
    naming: '[dir]/[name].cjs',
    sourcemap: 'external'
  })
])

for (const build of builds) {
  if (!build.success) {
    for (const log of build.logs) {
      console.error(log)
    }
    process.exit(1)
  }
}

const declarations = spawn(['bunx', 'tsc', '-p', 'tsconfig.build.json'], {
  stdout: 'inherit',
  stderr: 'inherit'
})

process.exit(await declarations.exited)
