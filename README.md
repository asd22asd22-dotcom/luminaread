# LuminaRead · 流光精读

一款采用 **流光液态玻璃（Iridescent Liquid Glass）** 视觉风格打造的跨平台考研英文分级精读软件（支持 **Windows 桌面端 + Android 离线端 + Web 端**），内置 90 篇从 CEFR A2 到考研真题难度的六段式精读课程、离线词库、SM-2 遗忘曲线复习系统与 MCP Server 联动能力。

---

## 核心特性

- **三阶段 90 篇分级精读库**：第一阶段（打底适应期 A2–B1）、第二阶段（过渡衔接期 B1–B2）、第三阶段（考研对标期 B2–C1），每篇包含正文、核心词汇、长难句分析、全文翻译、理解测验与交互点词释义。
- **即点即查词 & 自动建卡**：阅读时单击任意英文单词，直接在词下弹出极简中文气泡，并自动沉淀到生词本等待复习（支持全文词形还原与离线词典）。
- **划词高亮与自定义笔记库**：支持黄色/青色/玫红高亮标注短语与句子、自定义随手笔记，并与文章段落锚点联动。
- **SM-2 间隔重复复习中心**：翻转闪卡、发音朗读与记忆评级（Again / Hard / Good / Easy）。
- **AI Agent MCP Server**：内置 `@modelcontextprotocol/sdk` Stdio 服务（13 个工具 + 2 个资源），支持让 Claude / Cursor / Antigravity 等 AI 助手直接导入 Markdown 文章、批量精讲与整理笔记。
- **Windows + Android 跨端同步与在线自更新**：
  - Android 端内置 IndexedDB 离线引擎 + 61,033 词压缩词库 + 90 篇精读数据，无网可用；支持同一 Wi-Fi 下与桌面端一键双向同步。
  - 双端支持通过 **GitHub Releases** 或 **局域网 `/updates/latest.json`** 进行应用内检查更新、SHA-256 校验与一键升级。

---

## 快速开发与运行

### 1. 安装依赖

```bash
npm install
npm --prefix web install
```

### 2. 初始化本地文章与构建前端

```bash
npm run seed
npm run build:web
```

### 3. 运行桌面端 / Web 端 / MCP

```bash
# Web 服务模式 (默认端口 3456)
npm start

# Electron 桌面开发模式
npm run desktop:dev

# MCP Server (Stdio)
npm run mcp
```

### 4. 打包发布（Windows EXE + 热更新补丁 + Android APK）

> Android 打包需本地已配置 JDK 21、Android SDK，并在 `web/android/keystore.properties` 中填入签名密钥配置（`luminaread-release.jks` 与 `keystore.properties` 默认已加入 `.gitignore`，不会提交到公开仓库）。

```bash
npm run release:build
```

打包产物将输出至 `release/` 目录：
- `release/LuminaRead-win32-x64/LuminaRead.exe`
- `release/LuminaRead-v<version>.apk`
- `release/updates/luminaread-app-patch-<version>.zip`
- `release/updates/latest.json`

---

## 应用内自动更新配置

在软件 **「设置 -> 软件版本与在线自动更新」** 中填入更新源地址：

- **GitHub Releases 模式**：`https://github.com/asd22asd22-dotcom/luminaread`
- **局域网 / 自建服务模式**：`http://<电脑局域网IP>:3456/updates/latest.json`

---

## 测试

```bash
npm test
npm run test:mcp
node scripts/test-updater.js
```
