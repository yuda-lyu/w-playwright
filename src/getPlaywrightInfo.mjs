import pwDefaults from './pwDefaults.mjs'
import { pwState, isTableMatch } from './_pw.mjs'
import { findChromeCore, readVersionDir } from './_findChrome.mjs'


/**
 * 深凍結
 */
function deepFreeze(o) {
    for (let k of Object.keys(o)) {
        let v = o[k]
        if (v !== null && typeof v === 'object') {
            deepFreeze(v)
        }
    }
    return Object.freeze(o)
}


/**
 * 取得診斷資訊(深凍結之防禦性複本, 與合併器之內部表不共用); 不啟動瀏覽器; 永不拋錯
 *
 * @returns {Object} 回傳{ coreVersion, tableVersion, tableMatch, guardFeatures, defaultDisableFeatures, defaultEnableFeatures, systemChrome: { path, version } }; coreVersion為實裝playwright-core版本, tableVersion為內附表版本, systemChrome之version取chrome.exe旁之版本資料夾名(無則'')
 * @example
 *
 * import wpw from 'w-playwright'
 *
 * let info = wpw.getPlaywrightInfo()
 * console.log(info.tableMatch, info.systemChrome.version)
 * // => true '157.0.8103.78'
 *
 */
function getPlaywrightInfo() {
    let sysPath = ''
    let sysVer = ''
    try {
        sysPath = findChromeCore({ channel: 'chrome', executablePath: undefined })
        sysVer = readVersionDir(sysPath)
    }
    catch (err) {}
    return deepFreeze({
        coreVersion: pwState.coreVersion,
        tableVersion: pwDefaults.version,
        tableMatch: isTableMatch(),
        guardFeatures: [...pwDefaults.guardFeatures],
        defaultDisableFeatures: [...pwDefaults.disableFeatures],
        defaultEnableFeatures: [...pwDefaults.enableFeatures],
        systemChrome: {
            path: sysPath,
            version: sysVer,
        },
    })
}


export default getPlaywrightInfo
