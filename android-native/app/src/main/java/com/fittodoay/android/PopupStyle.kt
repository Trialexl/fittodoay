package com.fittodoay.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

/** Slight translucency for modal surfaces; text and controls retain full opacity. */
@Composable fun popupSurfaceColor() = MaterialTheme.colorScheme.surface.copy(alpha = .96f)
