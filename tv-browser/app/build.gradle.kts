plugins {
    id("com.android.application")
}

android {
    namespace = "com.visujju.tvbrowser"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.visujju.tvbrowser"
        minSdk = 26
        // Keep the classic window inset behavior on Android 15 for this TV-first UI.
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
