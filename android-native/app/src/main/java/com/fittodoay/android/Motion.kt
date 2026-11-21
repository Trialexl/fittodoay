package com.fittodoay.android

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Foundation owns layout/visibility animation and respects the system animator scale. */
@Composable fun MotionDisclosure(visible: Boolean, content: @Composable ColumnScope.() -> Unit) {
    AnimatedVisibility(visible, enter = expandVertically(tween(220)) + fadeIn(tween(150)),
        exit = shrinkVertically(tween(180)) + fadeOut(tween(100))) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}
