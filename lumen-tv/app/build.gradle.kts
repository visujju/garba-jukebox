plugins {
    id("com.android.application")
}

android {
    namespace = "com.visujju.lumentv"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.visujju.lumentv"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0-demo"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/lumen-assets"))
}

// Package the same local interface used by the browser preview.
val syncLumenAssets by tasks.registering(Sync::class) {
    from(rootProject.file("web"))
    into(layout.buildDirectory.dir("generated/lumen-assets/web"))
}
tasks.named("preBuild") { dependsOn(syncLumenAssets) }
