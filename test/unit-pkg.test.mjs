import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { createRequire } from 'module'
import wpw from '../src/WPlaywright.mjs'
import pwDefaults from '../src/pwDefaults.mjs'


//unit-pkg: 依賴與版本所有權(設計§4)、主檔匯出(§2.1)、不依wsemi(主控裁示1)


let require = createRequire(import.meta.url)
let pkg = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf8'))

function listFiles(fd) {
    let r = []
    for (let d of fs.readdirSync(fd, { withFileTypes: true })) {
        let fp = path.join(fd, d.name)
        if (d.isDirectory()) {
            if (d.name === '_tmp') {
                continue
            }
            r.push(...listFiles(fp))
        }
        else if (/\.(mjs|js)$/.test(d.name)) {
            r.push(fp)
        }
    }
    return r
}


describe('unit-pkg', function() {

    it('dependencies只有精確版之playwright-core(1.64.1), devDependencies只有w-package-tools', function() {
        assert.strict.deepStrictEqual(pkg.dependencies, { 'playwright-core': '1.64.1' })
        assert.strict.deepStrictEqual(Object.keys(pkg.devDependencies), ['w-package-tools'])
        assert.strict.deepStrictEqual(pkg.dependencies['playwright-core'], pwDefaults.version)
    })

    it('實裝之playwright-core等於內附表之版本; getPlaywrightInfo().tableMatch為true', function() {
        assert.strict.deepStrictEqual(require('playwright-core/package.json').version, pwDefaults.version)
        let info = wpw.getPlaywrightInfo()
        assert.strict.deepStrictEqual(info.tableMatch, true)
        assert.strict.deepStrictEqual(info.coreVersion, pwDefaults.version)
        assert.strict.deepStrictEqual(info.tableVersion, pwDefaults.version)
    })

    it('test script為限定之mocha指令', function() {
        assert.strict.deepStrictEqual(pkg.scripts.test, 'mocha --parallel "test/*.test.mjs" --timeout 180000')
    })

    it('主檔default匯出7個函數', function() {
        assert.strict.deepStrictEqual(Object.keys(wpw), ['launchChromium', 'launchChromiumPersistent', 'getChromiumLaunchOptions', 'ensureChromium', 'findSystemChrome', 'getPlaywrightInfo', 'setBrowserTypeForTest'])
        for (let k of Object.keys(wpw)) {
            assert.strict.deepStrictEqual(typeof wpw[k], 'function', k)
        }
    })

    it('src、test、toolg不引用wsemi(含dev; 主控裁示1), 不引用playwright(只用playwright-core)', function() {
        let files = [...listFiles(path.resolve('./src')), ...listFiles(path.resolve('./test')), ...listFiles(path.resolve('./toolg'))]
        assert.ok(files.length >= 10, String(files.length))
        let hits = []
        for (let fp of files) {
            let s = fs.readFileSync(fp, 'utf8')
            if (/(from\s+|import\(\s*|require\(\s*)['"`]wsemi['"`/]/.test(s)) {
                hits.push(fp)
            }
            if (/(from\s+|import\(\s*|require\(\s*)['"`]playwright['"`/]/.test(s)) {
                hits.push(fp)
            }
        }
        assert.strict.deepStrictEqual(hits, [])
        assert.strict.deepStrictEqual(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((k) => k === 'wsemi' || k === 'playwright'), [])
    })

    it('src內所有child_process之呼叫皆設windowsHide:true(全域§8.3)', function() {
        let files = listFiles(path.resolve('./src'))
        let sites = 0
        let bad = []
        for (let fp of files) {
            //去註解後, 找child_process全家與其本地別名(sp、ef)之呼叫, 取到對應之右括號為止(括號平衡)
            let s = fs.readFileSync(fp, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
            let re = /(?<![.\w])(sp|ef|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\(/g
            let m
            while ((m = re.exec(s)) !== null) {
                let i = m.index + m[0].length
                let depth = 1
                while (i < s.length && depth > 0) {
                    if (s[i] === '(') {
                        depth++
                    }
                    else if (s[i] === ')') {
                        depth--
                    }
                    i++
                }
                let call = s.slice(m.index, i)
                sites++
                if (!/windowsHide:\s*true/.test(call)) {
                    bad.push(`${path.basename(fp)}: ${call.slice(0, 80)}`)
                }
            }
        }
        //防空集合: 盤到0處即盤點式壞掉(_install.mjs之spawn與taskkill、_logonGuard.mjs之execFile)
        assert.ok(sites >= 3, String(sites))
        assert.strict.deepStrictEqual(bad, [])
    })

})
