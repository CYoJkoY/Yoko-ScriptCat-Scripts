# Yoko-ScriptCat-Scripts

My current collection of ScriptCat scripts is solely for quick searching and development.

## 脚本

| 脚本 | 版本 | 安装入口 |
| --- | --- | --- |
| Gemini Quota Capsule | 0.6.1 | [安装](https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/gemini-quota-capsule.js) |
| AI Chat Turbo Engine | 0.13.9 | [安装](https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/ai-chat-turbo-engine.js) |

安装入口用代理地址（响应 `Content-Type: text/plain`），脚本管理器才会弹出安装页；jsDelivr 对 `.js` 返回 `application/javascript` + `nosniff`，直接用它的链接安装可能只会显示源码。

## 更新通道

`raw.githubusercontent.com` 在部分网络下不可达，因此脚本头部显式声明两条通道：

- `@updateURL` → `https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/scripts/<script>.js`（检查更新）
- `@downloadURL` → `https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/<script>.js`（下载新版本）

推送 `main` 后，[`purge-jsdelivr.yml`](.github/workflows/purge-jsdelivr.yml) 会主动 purge jsDelivr 边缘缓存并校验 CDN 上的 `@version` 与仓库一致，避免 `@main` 分支最长 12 小时的缓存挡住新版本。

## 从旧版本升级

旧版脚本头部没有 `@updateURL` / `@downloadURL`，脚本管理器记录的是安装时的地址（`raw.githubusercontent.com`）。该地址在当前网络下超时，所以检查更新只会得到「无更新」——这个失效地址无法被远端改写。

需要**手动重装一次**：点开上面的安装入口，ScriptCat 会提示覆盖同 `@name` 脚本，确认后即可。此后更新走 `@updateURL`，自动检测恢复正常。

## 备用地址

更新通道整体不可达时，可按顺序换用：

1. `https://ghfast.top/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/<script>.js`
2. `https://gh-proxy.com/https://raw.githubusercontent.com/CYoJkoY/Yoko-ScriptCat-Scripts/main/scripts/<script>.js`
3. `https://cdn.jsdelivr.net/gh/CYoJkoY/Yoko-ScriptCat-Scripts@main/scripts/<script>.js`
