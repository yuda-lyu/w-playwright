import { EventEmitter } from 'events'


//fakeSpawn, 安裝子行程之替身(unit-ensureChromium、unit-installBudget共用): 記錄參數, 依plan結束(code)、發error、或不結束(hang)
//回{ sp, calls, cps }: calls記錄每次spawn之{ file, args, opt }與taskkill/kill之結果, cps為各子行程替身(hang者可由測試自行emit('close', code)收尾)
function fakeSpawn(plans) {
    let calls = []
    let cps = []
    let sp = (file, args, opt) => {
        let cp = new EventEmitter()
        cp.pid = 4321
        cp.stdout = new EventEmitter()
        cp.stderr = new EventEmitter()
        cp.kill = (sig) => {
            calls.push({ kill: sig })
        }
        calls.push({ file, args, opt })
        if (file.toLowerCase().endsWith('taskkill.exe') || file === 'taskkill') {
            //taskkill之結束延後(記錄其時點), 以驗證逾時之reject在其結束之後
            setTimeout(() => {
                calls.push({ taskkillClosed: true })
                cp.emit('close', 0)
            }, 30)
            return cp
        }
        cps.push(cp)
        let plan = plans.shift() || { code: 0 }
        setImmediate(() => {
            if (plan.out) {
                cp.stdout.emit('data', Buffer.from(plan.out))
            }
            if (plan.error) {
                cp.emit('error', new Error('spawn ENOENT'))
            }
            else if (!plan.hang) {
                cp.emit('close', plan.code)
            }
        })
        return cp
    }
    return { sp, calls, cps }
}


export {
    fakeSpawn
}
