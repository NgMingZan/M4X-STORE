plugins {
    id("com.android.application")
}

android {
    namespace = "com.m4x.store"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.m4x.store"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
