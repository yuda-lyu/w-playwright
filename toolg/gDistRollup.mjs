import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'

rollupFiles({ //rollupFiles預設會clean folder
    fns: 'WPlaywright.mjs',
    fdSrc,
    fdTar,
    nameDistType: 'kebabCase',
    runin: 'nodejs',
    globals: {
        'playwright-core': 'playwright-core',
        'playwright-core/lib/coreBundle': 'playwright-core/lib/coreBundle',
        'fs': 'fs',
        'path': 'path',
        'os': 'os',
        'url': 'url',
        'module': 'module',
        'child_process': 'child_process',
    },
    external: [ //playwright-core(精確釘版之唯一依賴, 執行期由使用端之node_modules解析)與Node內建模組
        'playwright-core',
        'playwright-core/lib/coreBundle',
        'fs',
        'path',
        'os',
        'url',
        'module',
        'child_process',
    ],
})
