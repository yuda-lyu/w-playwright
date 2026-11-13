import { readBadPasswordAttempts } from '../../src/_logonGuard.mjs'


//readBadPassword, 讀取Windows本機帳號之錯誤密碼次數與鎖定狀態(唯讀; WinNT ADSI經cscript //nologo; 子行程windowsHide)
//與本套件執行期登入守門同一讀法(src/_logonGuard.mjs、src/readBadPassword.wsf); 隨npm包發布, 啟動真Chrome之使用端測試可深層引用作前後比對
//用法:
//  import readBadPassword from 'w-playwright/test/tools/readBadPassword.mjs'
//  let r = await readBadPassword() //{ ok, bad, locked }; 非Windows或讀不到時ok為false


/**
 * 讀取錯誤密碼次數
 *
 * @param {Object} [opt={}] 輸入設定物件
 * @param {String} [opt.username] 輸入帳號名, 預設為目前行程之使用者
 * @returns {Promise} 回傳Promise, resolve回傳{ ok, bad, locked }
 */
async function readBadPassword(opt = {}) {
    return readBadPasswordAttempts(opt)
}


export default readBadPassword
