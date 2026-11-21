# 回饋

本檔記任務中發現之自有套件、全域技能、全域設定之調整與抽提提案(一條一列;只增不改,處置結果另記一列並寫明承接哪一列).回饋是紀錄與提案,實際修改走主控之通報管道.

| # | 日期 | 類別 | 對象 | 內容 | 依據 |
|---|---|---|---|---|---|
| 1 | 2026-11-13 | 自有套件 | w-package-tools-e2e | 其 `launchChromium` 之安裝子行程執行 `playwright install` 未加 `--no-remove`;Playwright 之 install 預設會移除本機未被連結之他版瀏覽器(他套件所用之 revision 可能被刪),且 spawn 未設 `windowsHide`.遷移輪 M1 移除該函數時一併消失;移除前若有發布,宜先補 | playwright-core 1.64.1 `lib/coreBundle.js:75875`(`--no-remove` 選項說明);該套件 `src/launchChromium.mjs:20`;本套件 `src/_install.mjs` 之作法 |
| 2 | 2026-11-13 | 全域技能 | role-coder-for-test-e2e、role-command-windows §5 | w-playwright 發布後,宜載明「Chromium 系之啟動一律經 `w-playwright`(`import wpw from 'w-playwright'`);測試環境清除 `PWDEBUG`、`SELENIUM_REMOTE_URL`;啟動真 Chrome／Edge／完整 Chromium 之測試前後讀錯誤密碼次數(`w-playwright/test/tools/readBadPassword.mjs`)」 | 本套件 README〈Core〉〈Testing〉;設計 §3.3 F14、F15 |
| 3 | 2026-11-13 | 全域設定 | §8.3 | 觸發句「以 node 調用 chrome/chromium……(playwright、puppeteer、w-html2png 系)」後加一句指向 w-playwright(Playwright 啟動之守門參數與登入守門) | 同上 |
| 5 | 2026-11-13 | 全域技能 | role-coder-for-test | 變異證據之判讀:植入變異而測試未轉紅時,先查該處是否為與他規則重複之冗餘碼(刪冗餘、改驗被依賴之規則),而非一律補測試.本輪「頭尾 NEL 檢查」與「C1 控制字元規則」重複,變異未轉紅即為此例 | 本套件 `sgud/exp/experience.md` 二之 3;實作輪報告〈變異證據〉 |
| 6 | 2026-11-21 | 全域技能 | role-command-windows | 新增一條:Git Bash 下 `cmd /c "set X=1&& node …"` 因 MSYS 路徑轉換把 `/c` 變成 `C:/`,開出互動式 cmd 並以離開碼 0 結束(目標腳本未執行),易誤判為成功;需帶環境變數者改以 `.mjs` 包裝(內設 `process.env` 後動態 import) | 本套件 `sgud/exp/experience.md` 一之二之 8;2026-11-21 實測:該指令之輸出僅有 cmd 橫幅 |
| 7 | 2026-11-21 | 全域技能 | role-coder-for-test | 升版型測試(外部依賴之內附表／漂移測試)之補充:①測試內以具體名稱當「外部預設之例」者(如某預設 disable 功能名)須在測試內斷言該名稱仍屬表內,否則表一動即靜默失效;②表之鍵須含「條件式項目」(隨環境變數省略何項),只比對清單不夠——本次由隔離行程之真命令列測試抓到 | 本套件 `test/unit-mergeFeatures.test.mjs`(MediaRouter 前提斷言)、`test/api-pwDrift.test.mjs` legacy 案;`sgud/exp/experience.md` 一之二之 2、3 |
| 8 | 2026-11-21 | 全域技能 | role-coder-for-test | 新增一條:被測函數新增「依主機環境(語系、時區、平台、環境變數)而定之預設值」時,既有斷言整體輸出(陣列完整內容、長度)之測試會隨主機而紅;處置為在該些測試之 `before` 固定環境(取代 `Intl.DateTimeFormat` 等),斷言不動,另以專檔驗新預設之各分支(含取不到)——不得改寫既有斷言去容納新預設;並在帳本註明「新增斷言完整輸出之測試須先固定環境」.本次 3 檔 17 案隨主機語系而紅 | 本套件 `sgud/rule/rulebook.md` R-PW-LANG「既有測試之處置」;`test/tools/sysLang.mjs`;`sgud/exp/experience.md` 一之三之 4 |
| 9 | 2026-11-21 | 全域技能 | role-coder-for-test-e2e | 補充 §8.4／§7.11(旗標組加 `--lang`):瀏覽器之應用程式語系是否繼承主機,隨 Chromium 修訂而變(156 繼承、159 不繼承);升版驗收除標準圖外,宜在測試之前提中斷言「`navigator.language` 與 CDP `CSS.getPlatformFontsForNode` 之 sans-serif 字型」,並以 `lang:false` 對照證明預設有鑑別力.本套件 2026-11-21 起預設已補 `--lang=<主機系統語系>`,e2e 套件可不另自帶 | 本套件 README〈Core〉啟動語系;`test/api-lang.test.mjs`;第 440 項調查報告之回饋 2 |
| 4 | 2026-11-13 | 全域技能 | role-coder-for-test-e2e | 新知:Playwright 1.64.1 之持久啟動(`launchPersistentContext`)取命令列時,`logger` 選項收不到 `<launching>`、CDP `Browser.getBrowserCommandLine` 因無 `--enable-automation` 被拒;可行作法為子行程設 `DEBUG=pw:browser` 並攔截 stderr.需驗證啟動參數之測試(如截圖確定性旗標)可用 | 本套件 `test/tools/pwDriftProbe.mjs`;`sgud/exp/experience.md` 一之 1 |
