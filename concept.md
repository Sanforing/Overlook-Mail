開發筆記：Project "StealthBox" (偽裝版 Outlook 遊戲平台)

核心概念 (The Concept):
打造一個外觀 100% 擬真 Microsoft Outlook 網頁版的遊戲/閱讀平台。主打「辦公室摸魚專用 (NSFW: Not Safe For Work... but looks safe)」。玩家可以在主管或同事走來走去的情況下，光明正大地在螢幕上「看 Email」，但實際上是在玩遊戲或看小說。

右側的「信件列表」實際上是「應用程式選單」，點擊後，右側的「信件內容區」就會載入該內容。為了維持偽裝的完美，系統會用極度逼真的商業信件外殼來包裝真實的娛樂內容。

1. 系統架構與技術選型 (Architecture & Tech Stack)

為了確保極致的載入速度和絕對的 UI 掌控權，建議不使用過度肥大的框架，而是以輕量化為主。

前端核心: Vanilla JavaScript (原生 JS) + HTML5。

CSS 樣式: Tailwind CSS (快速刻出 Outlook 的工具列和排版) 或純 CSS (以精確複製 Outlook 的陰影、邊框、藍灰色調)。

版面分割 (Split Panes): 使用開源庫 Split.js。這能完美模擬 Outlook 左中右欄（側邊欄、信件列表、信件內容）的「拖曳縮放 (Drag to resize)」功能，這細節對擬真度至關重要。

模組化隔離 (Isolation): 每個模組必須使用 Iframe 或 Shadow DOM 來載入。這不僅能確保樣式不互相污染，也方便直接嵌入外部來源的內容。

2. UI/UX 偽裝設計 (The Camouflage UI)

整個畫面必須一比一復刻 Outlook Web 版。

Top Navbar (頂部導航列): 藍色底，帶有一個搜尋框），右上角有帳號頭像和設定齒輪。

Left Sidebar (左側資料夾):

收件匣 (Inbox) -> 熱門/推薦遊戲與內容

寄件備份 (Sent) -> 你玩過/看過的歷史紀錄

草稿 (Drafts) -> 暫停/存檔的遊戲、書籤進度

垃圾郵件 (Junk) -> 玩家評分較低的糞作

Middle Column (信件/內容列表):

寄件者 (Sender): 開發者名稱、作者名或偽裝部門 (e.g., IT Support, HR Department)

主旨 (Subject): 遊戲/小說名稱 (e.g., ASCII Tetris: Q3 Financial Report, The Lord of the Rings: Weekly Sync)

預覽文字 (Preview): 簡介或進度 (e.g., Your current high score is... / Page 12 of 300)

日期 (Date): 偽裝成收信時間 (e.g., 10:30 AM)

Right Column (信件內容/遊玩閱讀區): 這是本平台最核心的偽裝技術所在。

逼真信件頂部: 顯示寄件者、收件者、時間等假資訊。

「向下捲動」機制 (Scroll-to-Play): 點開信件時，最上方會是一大段非常逼真的商業信件內文（例如：會議紀錄、專案進度報告）。玩家必須將信件往下捲動 (Scroll down)，才會在信件的最底部（偽裝成附件預覽區）看到真正的遊戲 Iframe。

無縫 Iframe 整合: Iframe 支援載入本地端遊戲腳本，也能直接載入外部連結（例如 itch.io 的網頁遊戲、外部小遊戲網站），賦予平台無限擴充性。

3. 模組化標準與外部支援 (Module Standard & External Links)

為了讓這個平台可以無限擴充，我們支援多種載入模式：

模式 A：本地端腳本 (GameAPI)

class StealthAppBase {
    constructor(containerElement) {
        this.container = containerElement; 
    }
    init() { /* 初始化 */ }
    pause() { /* 觸發老闆鍵時暫停 */ }
    resume() { /* 恢復 */ }
    destroy() { /* 銷毀防流失 */ }
}


模式 B：外部 Iframe 嵌入
在設定檔中直接填寫外部 URL，系統會自動將其生成為一封「信件」，點開後於信件底部的 Iframe 載入該網址。

4. 核心應用點子 (Launch Titles & Apps)

《小說閱讀器 (The "Long Email" Novel Reader)》

機制: 支援載入 TXT 或 EPUB 檔案。

完美偽裝: 小說內文會被動態注入到一封假信件之中。開頭會有 Dear [Name],，結尾會有 Yours sincerely, [Manager Name]。

翻頁系統: 玩家點擊「Next Page」按鈕（或按鍵盤右鍵）時，只有中間的小說內文會替換到下一頁，前後的問候語與信件結構完全保持不變。在旁人看來，你就像是在全神貫注地閱讀一封極其冗長、不斷更新的工作報告。

《Excel 迷宮 (Spreadsheet Crawler)》

玩法: 傳統的 Rogue-like 地下城遊戲。但是地圖的牆壁是表格的邊框，你的主角是一個 @ 符號，怪物是 # 和 &。

偽裝: 藏在真實信件最底部的假「Excel 附件預覽區」中。

《打字防衛戰 (Typing Defender)》

玩法: 螢幕上方不斷掉下單字，玩家必須快速敲擊鍵盤打出對應字母來消滅它們。

偽裝: 單字全部使用「商業用語」（如 Synergy, Quarterly, ROI, Revenue）。你就像是在極速敲打回覆一封充滿專業術語的長信。

5. 終極保命機制 (The "Boss is Coming" Features)

除了外觀像 Outlook，還需要具備極致的防禦機制：

瞬間靜音 (Auto Mute): 平台預設全域靜音，若有遊戲音效，必須按住特定鍵才會發聲。

真正的老闆鍵 (Panic Mode): 按下 Esc 鍵兩次，右側的遊戲/小說 Iframe 會瞬間隱藏，只留下最上面那段逼真的無聊商業信件內文。

假載入 (Fake Loading): 點開外部遊戲時，可以顯示一個假的 Outlook 藍色圈圈 "Downloading Attachments (下載附件中...)" 幾秒鐘，讓切換與載入過程看起來無懈可擊。