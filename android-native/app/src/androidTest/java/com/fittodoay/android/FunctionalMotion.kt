package com.fittodoay.android

import androidx.compose.ui.MotionDurationScale

/** Standard Compose test context: functional tests do not wait for a continuously animated clock. */
val NoMotion = object : MotionDurationScale { override val scaleFactor = 0f }
