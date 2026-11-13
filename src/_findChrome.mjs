import fs from 'fs'
import path from 'path'


//_findChrome, 以檔案存在判定系統Chrome/Edge(內部; 路徑表同playwright-core 1.64.1之registry: 後綴chrome/msedge通道、Windows前綴LOCALAPPDATA、PROGRAMFILES、PROGRAMFILES(X86)、HOMEDRIVE之Program Files兩處)
//只判存在, 不啟動瀏覽器, 不代表可啟動(Linux無DISPLAY、權限、相依不在判斷內)


//SUFFIX, 各通道之執行檔位置
let SUFFIX = {
    'chrome': {
        'linux': '/opt/google/chrome/chrome',
        'darwin': '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'win32': '\\Google\\Chrome\\Application\\chrome.exe',
    },
    'msedge': {
        'linux': '/opt/microsoft/msedge/msedge',
        'darwin': '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        'win32': '\\Microsoft\\Edge\\Application\\msedge.exe',
    },
}

//reVer, 版本資料夾名
let reVer = /^\d+\.\d+\.\d+\.\d+$/


/**
 * 是否為存在之檔案; 永不拋錯
 */
function isFile(fp) {
    try {
        return fs.statSync(fp).isFile()
    }
    catch (err) {
        return false
    }
}


/**
 * Windows之前綴(依Playwright之順序); HOMEDRIVE未設時略過其兩處(Playwright會組出相對路徑'undefined\\Program Files')
 */
function getPrefixes(env) {
    let r = [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)']]
    if (env.HOMEDRIVE) {
        r.push(env.HOMEDRIVE + '\\Program Files', env.HOMEDRIVE + '\\Program Files (x86)')
    }
    return r.filter((v) => typeof v === 'string' && v !== '')
}


/**
 * 找系統Chrome/Edge之執行檔
 *
 * @param {Object} o 輸入{ channel: 'chrome'|'msedge', executablePath: 字串或undefined }
 * @param {Object} [ctx] 輸入{ env, platform }(預設process.env、process.platform)
 * @returns {String} 回傳絕對路徑或''
 */
function findChromeCore(o, ctx = {}) {
    let env = ctx.env || process.env
    let platform = ctx.platform || process.platform

    //executablePath, 給了即只認它: 存在回絕對路徑, 不存在回''(不改找他處)
    if (o.executablePath !== undefined) {
        let fp = path.resolve(o.executablePath)
        return isFile(fp) ? fp : ''
    }

    let sfx = SUFFIX[o.channel] && SUFFIX[o.channel][platform]
    if (!sfx) {
        return ''
    }
    if (platform !== 'win32') {
        return isFile(sfx) ? sfx : ''
    }
    //Windows之前綴與後綴以Windows之路徑語意組合(path.win32; 於他平台模擬時亦然)
    for (let pre of getPrefixes(env)) {
        let fp = path.win32.join(pre, sfx)
        if (isFile(fp)) {
            return process.platform === 'win32' ? path.resolve(fp) : fp
        }
    }
    return ''
}


/**
 * 讀執行檔旁之版本資料夾名(取最大者), 無則回''; 不啟動瀏覽器, 永不拋錯
 */
function readVersionDir(fpExe) {
    if (!fpExe) {
        return ''
    }
    let names = []
    try {
        names = fs.readdirSync(path.dirname(fpExe), { withFileTypes: true })
            .filter((d) => d.isDirectory() && reVer.test(d.name))
            .map((d) => d.name)
    }
    catch (err) {
        return ''
    }
    if (names.length === 0) {
        return ''
    }
    names.sort((a, b) => {
        let pa = a.split('.').map(Number)
        let pb = b.split('.').map(Number)
        for (let i = 0; i < 4; i++) {
            if (pa[i] !== pb[i]) {
                return pa[i] - pb[i]
            }
        }
        return 0
    })
    return names[names.length - 1]
}


export {
    SUFFIX,
    getPrefixes,
    findChromeCore,
    readVersionDir
}
