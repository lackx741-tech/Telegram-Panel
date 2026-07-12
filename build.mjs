import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/index.tsx'],
  bundle: true,
  outfile: 'public/bundle.js',
  sourcemap: true,
  minify: !watch,
  format: 'iife',
  target: ['es2020'],
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
    // API base URL is injected at build time; defaults to same-origin /api.
    'process.env.API_BASE_URL': JSON.stringify(process.env.API_BASE_URL || '/api'),
  },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('esbuild watching for changes…');
} else {
  await esbuild.build(options);
  console.log('esbuild build complete → public/bundle.js');
}
