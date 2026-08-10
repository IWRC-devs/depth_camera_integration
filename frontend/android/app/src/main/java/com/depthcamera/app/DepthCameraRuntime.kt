package com.depthcamera.app

import com.intel.realsense.librealsense.RsContext
import com.intel.realsense.librealsense.Device
import com.intel.realsense.librealsense.Extension
import com.intel.realsense.librealsense.Option

object DepthCameraRuntime {
  val cameraLock = Object()

  @Volatile
  var autoExposureEnabled = true

  @Volatile
  var manualExposure = 550f

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

  fun updateExposureSettings(autoEnabled: Boolean, exposure: Float) {
    autoExposureEnabled = autoEnabled
    manualExposure = exposure.coerceIn(50f, 20000f)
  }

  fun applyColorExposure(device: Device) {
    device.querySensors().forEach { sensor ->
      try {
        if (!sensor.is(Extension.COLOR_SENSOR)) return@forEach
        if (sensor.supports(Option.ENABLE_AUTO_EXPOSURE)) {
          sensor.setValue(Option.ENABLE_AUTO_EXPOSURE, if (autoExposureEnabled) 1f else 0f)
        }
        if (!autoExposureEnabled && sensor.supports(Option.EXPOSURE)) {
          val exposure = manualExposure
            .coerceAtLeast(sensor.getMinRange(Option.EXPOSURE))
            .coerceAtMost(sensor.getMaxRange(Option.EXPOSURE))
          sensor.setValue(Option.EXPOSURE, exposure)
        }
      } catch (_: Throwable) {
        // Some RealSense sensors expose partial option support; ignore unsupported option writes.
      }
    }
  }
}
