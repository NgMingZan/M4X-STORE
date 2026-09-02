plugins {
    id("com.android.application")
}

val ksPath = System.getenv("M4X_KEYSTORE_PATH")
val ksPass = System.getenv("M4X_KEYSTORE_PASSWORD")
val keyAliasEnv = System.getenv("M4X_KEY_ALIAS")
val keyPass = System.getenv("M4X_KEY_PASSWORD")

android {
    namespace = "com.m4x.store"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.m4x.store"
        minSdk = 24
        targetSdk = 35
        versionCode = (System.getenv("M4X_VERSION_CODE") ?: "200").toInt()
        versionName = System.getenv("M4X_VERSION_NAME") ?: "2.0.0"
    }

    signingConfigs {
        if (!ksPath.isNullOrBlank()) {
            create("release") {
                storeFile = file(ksPath)
                storePassword = ksPass
                keyAlias = keyAliasEnv
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }
}
