# Oracle Cloud Always Free VPS 設定指南

## 📋 總覽

完成本指南後，你將擁有：
- 一台 24/7 運行的免費 VPS（4核 24GB RAM ARM 架構）
- TFD Bot 已部署並自動運行
- PM2 管理、開機自動重啟

**你需要的東西：**
- 信用卡（僅用於驗證身分，不扣費）
- Email 帳號
- 約 15-30 分鐘時間

---

## 步驟一：註冊 Oracle Cloud 帳號

### 1.1 進入註冊頁面
前往：https://www.oracle.com/cloud/free/

點擊「**Start for Free**」或「**免費開始**」

### 1.2 填寫基本資料
- **國家/地區**：選擇台灣（Taiwan）
- **姓名**：填真實姓名（與信用卡一致）
- **Email**：常用信箱
- **密碼**：設定帳號密碼

### 1.3 手機驗證
- 輸入手機號碼
- 收到簡訊驗證碼後填入

### 1.4 信用卡驗證
- 填寫信用卡資訊（Visa / Master / JCB 均可）
- **注意**：會預扣約 $1 USD 驗證，之後退還
- **不會產生後續費用**，只要只用免費配額

### 1.5 完成註冊
- 檢查 Email 確認帳號
- 登入 Oracle Cloud 控制台

---

## 步驟二：創建 VM 實例

### 2.1 進入計算 > 實例
登入後，在儀表板點擊：
```
菜單 → 計算 → 實例
```

### 2.2 點擊「創建實例」
點擊藍色的「**創建實例**」按鈕

### 2.3 填寫實例資訊

#### 名稱與存放位置
- **名稱**：`tfd-bot`（可自訂）
- **建立在 compartiment 中**：預設 root 即可

#### 放置
- 預設即可

#### 映像和形狀（重要！）
點擊「**編輯**」按鈕

**映像**：
- 選擇：**Ubuntu**
- 版本：**Ubuntu 22.04** 或 **24.04**（越新越好）
- 映像類型：標準

**形狀**：
- 點擊「**變更形狀**」
- 選擇：**Ampere**（ARM 架構）
- 虛擬機器形狀：**VM.Standard.A1.Flex**
- **OCPU 數**：4
- **記憶體（GB）**：24

> ⚠️ **重要**：如果你看到「Out of Capacity」或「目前無法提供」，表示該區域 ARM 資源已滿。請嘗試：
> - 更換區域（右上角可選區域）
> - 隔幾個小時再試
> - 或改用 **VM.Standard.E2.1.Micro**（AMD 1核1GB，資源較少但仍可用）

#### 網路
- 選擇 VCN：點擊「**建立新的虛擬雲端網路**」
- 子網路：預設即可
- 勾選：**將公用 IPv4 位址指派給此執行個體**（重要！）

#### 新增 SSH 金鑰（重要！）
- 選擇：**新增公用 SSH 金鑰**
- 點擊「**產生一組金鑰組**」
- 下載兩個檔案：
  - `ssh-key-2024-xx-xx.key`（私密金鑰，**自己保留**）
  - `ssh-key-2024-xx-xx.key.pub`（公開金鑰）
- **⚠️ 私密金鑰只下載一次，遺失無法恢復！**

#### 開機磁碟
- 預設 50GB 即可（免費配額含 200GB）

### 2.4 點擊「建立」
等待約 1-3 分鐘，實例狀態變為「**執行中**」即可。

---

## 步驟三：取得連線資訊

### 3.1 複製公用 IP 位址
在實例清單中，找到你的 VM，複製「**公用 IP 位址**」
格式類似：`123.45.67.89`

### 3.2 準備 SSH 金鑰
找到你剛下載的私密金鑰檔案（`.key`），記下路徑

**Windows 使用者：**
如果金鑰在「下載」資料夾：
```
C:\Users\你的用戶名\Downloads\ssh-key-2024-xx-xx.key
```

### 3.3 測試 SSH 連線（選做）
打開命令提示字元或 PowerShell：

```bash
# 設定金鑰權限（Windows 可能不需要這步）
icacls "C:\Users\你的用戶名\Downloads\ssh-key-xxxx-xx-xx.key" /inheritance:r /grant:r "%USERNAME%:R"

# SSH 連線測試（用戶名是 ubuntu，不是 root）
ssh -i "C:\Users\你的用戶名\Downloads\ssh-key-xxxx-xx-xx.key" ubuntu@你的IP
```

成功連線後你會看到類似：
```
Welcome to Ubuntu 22.04.x LTS
...
ubuntu@tfd-bot:~$
```

輸入 `exit` 離開即可。

---

## 步驟四：提供資訊給我

**請提供以下兩項資訊：**

### 4.1 伺服器 IP 位址
```
例如：123.45.67.89
```

### 4.2 SSH 金鑰
**選項 A：貼上金鑰內容（推薦）**
1. 用記事本打開 `.key` 檔案
2. 複製全部內容（從 `-----BEGIN...` 到 `...END-----`）
3. 貼上給我

**選項 B：提供檔案路徑**
如果金鑰在本地電腦，告訴我完整路徑即可

---

## 步驟五：等我部署完成

我會自動執行以下操作：

```bash
# 1. SSH 連線到伺服器
# 2. 更新系統
sudo apt update && sudo apt upgrade -y

# 3. 安裝 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 4. 安裝必要工具
sudo apt install -y git pm2

# 5. 部署 TFD 專案（Clone 或直接上傳）
# 6. 設定 .env
# 7. 安裝依賴
npm install

# 8. 部署命令
node deploy.js

# 9. 使用 PM2 啟動 Bot
pm2 start ecosystem.config.js --name transfordiscord
pm2 save
pm2 startup  # 開機自動運行

# 10. 確認 Bot 上線
pm2 status
```

---

## 步驟六：驗證部署

我會回報以下資訊給你：

```
✅ 伺服器 IP
✅ PM2 狀態
✅ Bot 是否正常上線
✅ 日誌位置
✅ 常用指令
```

---

## 🔧 後續管理指令（備查）

### 查看 Bot 狀態
```bash
pm2 status
```

### 查看即時日誌
```bash
pm2 logs transfordiscord
```

### 重新啟動 Bot
```bash
pm2 restart transfordiscord
```

### 查看記憶體/CPU 使用
```bash
pm2 monit
```

---

## ⚠️ 注意事項

### 免費配額限制
Oracle Cloud Always Free 含：
- **計算**：最多 4 核 OCPU + 24GB RAM（ARM）
- **儲存**：200GB
- **流量**：10TB/月出站
- **數量**：最多 2 台 ARM VM

只要不超過上述限制，**永久免費**。

### 避免額外費用
- 不要創建額外的付費資源
- 不要超出免費配額
- 可設定「**預算警示**」

### 實例被終止？
如果你長時間未登入，Oracle 可能回收閒置資源。
建議至少每 30 天登入一次控制台。

---

## 📞 遇到問題？

### Q: 創建實例時顯示「Out of Capacity」
**A**：該區域 ARM 資源已滿。嘗試：
1. 更換區域（右上角選單）
2. 隔 3-6 小時再試
3. 或改用 AMD 形狀（VM.Standard.E2.1.Micro）

### Q: SSH 連線被拒
**A**：確認：
1. 使用的是私密金鑰（`.key`），不是公開金鑰（`.pub`）
2. 用戶名是 `ubuntu`（不是 `root`）
3. IP 位址正確

### Q: 找不到公用 IP
**A**：創建實例時要勾選「將公用 IPv4 位址指派給此執行個體」

---

## 🎯 完成後

提供以下資訊給我，我立刻開始部署：

```
1. 伺服器 IP: xxx.xxx.xxx.xxx
2. SSH 私密金鑰內容:（貼上 .key 檔案內容）
```

**部署時間預估：5-10 分鐘**
