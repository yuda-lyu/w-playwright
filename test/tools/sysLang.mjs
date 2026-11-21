//sysLang, 測試用: 取代Intl.DateTimeFormat以控制「主機系統語系」之取得結果(本套件於每次合併時才讀Intl.DateTimeFormat().resolvedOptions().locale, 不快取)
//回傳還原函數; 還原須於finally或after執行(Intl為行程內全域, 同一行程之其他測試檔依序執行, 不得殘留)


/**
 * 令主機系統語系之取得結果為value(原樣由resolvedOptions().locale回傳, 可為非字串或不合語法之值)
 */
function setSysLang(value) {
    let orig = Intl.DateTimeFormat
    Intl.DateTimeFormat = function DateTimeFormat() {
        return {
            resolvedOptions() {
                return { locale: value }
            },
        }
    }
    return () => {
        Intl.DateTimeFormat = orig
    }
}


/**
 * 令取得主機系統語系時拋錯: where為'ctor'(建構式拋錯)或'resolved'(resolvedOptions拋錯)
 */
function setSysLangThrow(where = 'ctor') {
    let orig = Intl.DateTimeFormat
    Intl.DateTimeFormat = function DateTimeFormat() {
        if (where === 'ctor') {
            throw new Error('no Intl')
        }
        return {
            resolvedOptions() {
                throw new Error('no resolvedOptions')
            },
        }
    }
    return () => {
        Intl.DateTimeFormat = orig
    }
}


/**
 * 令全域Intl不存在(未含ICU之建置)
 */
function setNoIntl() {
    let orig = globalThis.Intl
    globalThis.Intl = undefined
    return () => {
        globalThis.Intl = orig
    }
}


/**
 * 令主機系統語系「取不到」(既有測試以此固定環境, 使其斷言不隨主機語系而變; 新增之語系預設由unit-lang驗證)
 */
function muteSysLang() {
    return setSysLang('')
}


export {
    setSysLang,
    setSysLangThrow,
    setNoIntl,
    muteSysLang
}
