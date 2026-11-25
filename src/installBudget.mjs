import { KILL_WAIT_MAX } from './_install.mjs'


//installBudget, 受管瀏覽器安裝之預算與啟動鉤子之建議時限(常數; 主檔以WPlaywright.INSTALL_BUDGET_MS、WPlaywright.LAUNCH_HOOK_TIMEOUT_MS匯出)
//本模組之值才是autoInstall、ensureChromium實際採用者; 使用端改寫主檔上之同名屬性不影響實際上限


/**
 * 單次安裝(autoInstall之整體, 或ensureChromium一次呼叫)之預算毫秒: 15分鐘
 *
 * 範圍: 同一次呼叫內之各安裝子行程(受管瀏覽器、Linux之系統相依)共用此上限, 逾時即結束該子行程樹並reject E_INSTALL('browser installation timed out');
 * 預設用於autoInstall(opt.installTimeout可改, 0表不限)與ensureChromium(opt.timeout可改, 0表不限)
 *
 * 取值推導(下載時間不實測、不下載, 依本機已安裝目錄之大小與Playwright安裝行為估算):
 * - 體積(本機實測目錄大小, 2026-11-26, Windows): Playwright 1.65.1(revision 1255)之headless shell安裝後約288MiB(約302MB)、完整Chromium約452MiB(約474MB);
 *   下載之zip不大於安裝後之大小, 故以此為上界; 以0.6MB/s(約5Mbps, 偏慢之辦公室或VPN線路)下載最大者約790秒(13.2分鐘), 其餘約1.8分鐘供解壓、校驗與Linux系統相依 → 15分鐘
 * - 並行: 多個行程同時首次安裝時, 本套件無自己之跨行程鎖, 只有Playwright之安裝目錄鎖(registryDirectory/__dirlock);
 *   (讀碼)lock之retries 20次、factor 1.27579、首次等1秒, 退避總和約469.5秒＝7.8分鐘(實測: 持有中之鎖使後到者於470.0秒後以離開碼1結束), 鎖之stale預設10秒(讀碼; 實測只驗已過期1小時之鎖被立即接手);
 *   該鎖之等候發生於安裝子行程之內, 而本預算之計時涵蓋整個子行程, 故後到者「等先到者安裝之時間」已計入同一個15分鐘, 最壞仍為1倍(不乘2);
 *   **注意**: 並行時後到者之有效上限為「Playwright鎖之等候上限(約7.8分鐘)與本預算之較小者」, 先到者於7.8分鐘後仍在下載(慢線)時後到者以E_INSTALL失敗(不自動重試, 使用端可重跑)
 */
let INSTALL_BUDGET_MS = 15 * 60 * 1000


//LAUNCH_TIMEOUT_MS, Playwright之啟動逾時預設(DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT, 3分鐘; 呼叫端另給timeout者自行加上差額; 與Playwright一致由unit-installBudget之靜態抽取守住)
let LAUNCH_TIMEOUT_MS = 3 * 60 * 1000

//HOOK_MARGIN_MS, 鉤子執行、失敗時關閉瀏覽器與缺檔即敗之前置啟動(各數秒)之餘裕
let HOOK_MARGIN_MS = 60 * 1000


/**
 * 使用端於測試之before建議掛之時限毫秒(this.timeout(...)): 約19.2分鐘, 不沿用測試框架之全域逾時(如mocha之180秒)
 *
 * 推導(單一autoInstall之launchChromium／launchChromiumPersistent之最壞總時間, 不含使用端自己之其他步驟):
 * 安裝預算INSTALL_BUDGET_MS(15分鐘; 並行之等候已含於其內, 見該常數) ＋ 逾時後結束子行程樹之等待上限(10秒) ＋
 * 安裝後之啟動逾時(Playwright預設3分鐘; 讀碼: 缺檔〔Executable doesn't exist〕與缺系統相依〔Linux; 本機Windows未實測〕之前置啟動即敗而不計,
 * 只有最後一次啟動可能耗滿逾時, 因逾時錯誤不再重試) ＋ 餘裕1分鐘;
 * 呼叫端給了installTimeout或timeout者, 以其差額調整(installTimeout取代預算項、timeout取代啟動逾時項)
 */
let LAUNCH_HOOK_TIMEOUT_MS = INSTALL_BUDGET_MS + KILL_WAIT_MAX + LAUNCH_TIMEOUT_MS + HOOK_MARGIN_MS


export {
    INSTALL_BUDGET_MS,
    LAUNCH_TIMEOUT_MS,
    HOOK_MARGIN_MS,
    LAUNCH_HOOK_TIMEOUT_MS
}
