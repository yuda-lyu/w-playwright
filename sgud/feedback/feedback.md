# 回饋

本檔記任務中發現之自有套件、全域技能、全域設定之調整與抽提提案(一條一列;只增不改,處置結果另記一列並寫明承接哪一列).回饋是紀錄與提案,實際修改走主控之通報管道.

| # | 日期 | 類別 | 對象 | 內容 | 依據 |
|---|---|---|---|---|---|
| 1 | 2026-11-13 | 自有套件 | w-package-tools-e2e | 其 `launchChromium` 之安裝子行程執行 `playwright install` 未加 `--no-remove`;Playwright 之 install 預設會移除本機未被連結之他版瀏覽器(他套件所用之 revision 可能被刪),且 spawn 未設 `windowsHide`.遷移輪 M1 移除該函數時一併消失;移除前若有發布,宜先補 | playwright-core 1.64.1 `lib/coreBundle.js:75875`(`--no-remove` 選項說明);該套件 `src/launchChromium.mjs:20`;本套件 `src/_install.mjs` 之作法 |
| 2 | 2026-11-13 | 全域技能 | role-coder-for-test-e2e、role-command-windows §5 | w-playwright 發布後,宜載明「Chromium 系之啟動一律經 `w-playwright`(`import wpw from 'w-playwright'`);測試環境清除 `PWDEBUG`、`SELENIUM_REMOTE_URL`;啟動真 Chrome／Edge／完整 Chromium 之測試前後讀錯誤密碼次數(`w-playwright/test/tools/readBadPassword.mjs`)」 | 本套件 README〈Core〉〈Testing〉;設計 §3.3 F14、F15 |
| 3 | 2026-11-13 | 全域設定 | §8.3 | 觸發句「以 node 調用 chrome/chromium……(playwright、puppeteer、w-html2png 系)」後加一句指向 w-playwright(Playwright 啟動之守門參數與登入守門) | 同上 |
| 5 | 2026-11-13 | 全域技能 | role-coder-for-test | 變異證據之判讀:植入變異而測試未轉紅時,先查該處是否為與他規則重複之冗餘碼(刪冗餘、改驗被依賴之規則),而非一律補測試.本輪「頭尾 NEL 檢查」與「C1 控制字元規則」重複,變異未轉紅即為此例 | 本套件 `sgud/exp/experience.md` 二之 3;實作輪報告〈變異證據〉 |
| 4 | 2026-11-13 | 全域技能 | role-coder-for-test-e2e | 新知:Playwright 1.64.1 之持久啟動(`launchPersistentContext`)取命令列時,`logger` 選項收不到 `<launching>`、CDP `Browser.getBrowserCommandLine` 因無 `--enable-automation` 被拒;可行作法為子行程設 `DEBUG=pw:browser` 並攔截 stderr.需驗證啟動參數之測試(如截圖確定性旗標)可用 | 本套件 `test/tools/pwDriftProbe.mjs`;`sgud/exp/experience.md` 一之 1 |
