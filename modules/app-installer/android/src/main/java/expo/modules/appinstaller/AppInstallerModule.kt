package expo.modules.appinstaller

import android.content.Intent
import android.content.pm.PackageInfo
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class AppInstallerModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "应用上下文不可用。" }

  @Suppress("DEPRECATION")
  private fun installedInfo() = context.packageManager.getPackageInfo(context.packageName, 0)

  @Suppress("DEPRECATION")
  private fun versionCode(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()

  private fun updateFile(uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "安装包路径无效。" }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    val directory = File(context.cacheDir, "updates").canonicalFile
    require(file.parentFile == directory && file.extension == "apk" && file.isFile) { "找不到下载的安装包，请重新下载。" }
    return file
  }

  private fun installationAllowed() = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

  override fun definition() = ModuleDefinition {
    Name("AppInstaller")

    Function("getAppInfo") {
      val info = installedInfo()
      mapOf("version" to (info.versionName ?: "0.0.0"), "versionCode" to versionCode(info), "supportedAbis" to Build.SUPPORTED_ABIS.toList())
    }
    Function("canInstallPackages") { installationAllowed() }

    AsyncFunction("verifyPackage") { uri: String, expectedSha256: String? ->
      val file = updateFile(uri)
      if (expectedSha256 != null) {
        require(expectedSha256.matches(Regex("[a-fA-F0-9]{64}"))) { "安装包校验信息无效。" }
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            digest.update(buffer, 0, count)
          }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        require(actual.equals(expectedSha256, ignoreCase = true)) { "安装包校验失败，请重新下载。" }
      }
      @Suppress("DEPRECATION")
      val archive = context.packageManager.getPackageArchiveInfo(file.path, 0)
      requireNotNull(archive) { "安装包无效或已损坏。" }
      require(archive.packageName == context.packageName) { "安装包不属于 Drama 相机。" }
      require(versionCode(archive) > versionCode(installedInfo())) { "安装包版本不高于当前应用，无法升级。" }
    }

    AsyncFunction("openInstaller") { uri: String ->
      val file = updateFile(uri)
      if (!installationAllowed()) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        "permission"
      } else {
        val content = FileProvider.getUriForFile(context, "${context.packageName}.drama.updates", file)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(content, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
        "opened"
      }
    }.runOnQueue(Queues.MAIN)
  }
}
