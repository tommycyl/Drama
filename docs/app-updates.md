# GitHub Release 应用更新

在“我的 → 关于Drama相机”点击“检查更新”，应用读取 `https://api.github.com/repos/tommycyl/Drama/releases/latest`。仅检查正式 Release；支持 `1.2`、`v1.2.0` 等数字版本，按各段数值比较，忽略构建元数据，不比较发布时间。网络失败、GitHub 限流和缺少 Release 会分别提示，不会误报已是最新版。

发现新版后显示版本号、发布说明、APK 名称和体积。Android 安装版下载到应用缓存的 `updates/` 目录，显示下载进度，检查文件大小、GitHub 提供的 SHA-256、APK 包名及 Android 构建版本。通过后打开系统安装器；首次需要允许此应用安装更新，授权返回后自动继续。安装完成与否由 Android 管理，弹窗不会提前宣称安装成功。关闭弹窗会取消未完成的检查或下载，未通过校验的临时文件会清理。

Web、iOS 和 Expo Go 可以检查版本及查看 GitHub 发布页面，无法执行 Android APK 自动安装。

## 发布 APK

1. 同步更新 `app.json` 的 `expo.version` 和 `package.json` 的 `version`，并递增 `expo.android.versionCode`。
2. 使用相同的 Android 包名和签名密钥构建升级包。自动安装模块是新增原生代码，需要重新构建，不能仅刷新 JavaScript。
3. 执行 `npx eas-cli build --platform android --profile github` 生成 APK。`production` 仍用于商店 AAB；AAB 不能直接下载安装。
4. 在 `tommycyl/Drama` 创建正式 GitHub Release，tag 与应用版本一致（例如 `v1.3.0`），上传 APK 并完成发布。推荐单个通用 APK；分架构 APK 文件名需包含 `arm64-v8a`、`armeabi-v7a`、`x86_64` 或 `x86`，应用按设备架构选择。
5. 用旧版真机检查：发现新版 → 下载 → 首次安装来源授权 → 返回后打开安装器 → 用户确认安装 → 新版再次检查提示已最新。另验收断网、限流、取消、下载不完整、校验失败、拒绝授权、后台下载和取消系统安装。

原生安装代码位于 `modules/app-installer/`，FileProvider 只共享更新缓存目录。安装包校验在后台执行，启动安装器在主线程执行。
