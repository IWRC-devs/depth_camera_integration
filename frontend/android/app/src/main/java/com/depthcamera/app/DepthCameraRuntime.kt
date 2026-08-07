package com.depthcamera.app

import com.intel.realsense.librealsense.RsContext

object DepthCameraRuntime {
  val cameraLock = Object()

  @Volatile
  private var initialized = false

  fun ensureInitialized() {
    if (!initialized) {
      synchronized(this) {
        if (!initialized) {
          RsContext.init(MainApplication.instance)
          initialized = true
        }
      }
    }
  }
}
