plugins {
    id("com.android.application")
}

android {
    namespace = "org.steady.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.steady.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

// The website in ../docs is the single source of truth. Copy it into the app's assets before every build,
// so the Android app and the GitHub Pages site can never drift apart.
val syncWeb = tasks.register<Sync>("syncWeb") {
    from(rootProject.file("docs")) {
        include("index.html", "manifest.webmanifest", "sw.js", "css/**", "js/**", "icons/**")
    }
    into(layout.projectDirectory.dir("src/main/assets/www"))
}
tasks.named("preBuild") { dependsOn(syncWeb) }
