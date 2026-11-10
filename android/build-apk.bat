@echo off
rem Build the WatchAlong Android debug APK.
rem Requires JDK 17+ and the Android SDK (see local.properties / ANDROID_HOME).

set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"

call "%~dp0gradlew.bat" assembleDebug --no-daemon
if errorlevel 1 exit /b 1

echo.
echo APK built: %~dp0app\build\outputs\apk\debug\app-debug.apk
