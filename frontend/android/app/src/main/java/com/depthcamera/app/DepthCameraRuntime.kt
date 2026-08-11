package com.depthcamera.app

import com.intel.realsense.librealsense.RsContext
import com.intel.realsense.librealsense.Device
import com.intel.realsense.librealsense.Extension
import com.intel.realsense.librealsense.Option

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

  fun applyColorExposure(device: Device) {
    device.querySensors().forEach { sensor ->
      try {
        if (!sensor.`is`(Extension.COLOR_SENSOR)) return@forEach
        if (sensor.supports(Option.ENABLE_AUTO_EXPOSURE)) {
          sensor.setValue(Option.ENABLE_AUTO_EXPOSURE, 1f)
        }
      } catch (_: Throwable) {
        // Some RealSense sensors expose partial option support; ignore unsupported option writes.
      }
    }
  }
}
