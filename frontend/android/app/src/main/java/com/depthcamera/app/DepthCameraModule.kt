package com.depthcamera.app

import android.content.ContentValues
import android.graphics.Bitmap
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.intel.realsense.librealsense.Config
import com.intel.realsense.librealsense.DepthFrame
import com.intel.realsense.librealsense.DeviceList
import com.intel.realsense.librealsense.Extension
import com.intel.realsense.librealsense.Frame
import com.intel.realsense.librealsense.FrameSet
import com.intel.realsense.librealsense.Pipeline
import com.intel.realsense.librealsense.PipelineProfile
import com.intel.realsense.librealsense.StreamFormat
import com.intel.realsense.librealsense.StreamType
import com.intel.realsense.librealsense.VideoFrame
import java.io.File
import java.io.ByteArrayOutputStream
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class DepthCameraModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  @Volatile
  private var previewRunning = false
  private var previewThread: Thread? = null

  override fun getName(): String = "DepthCamera"

  @ReactMethod
  fun capture(collectionName: String?, promise: Promise) {
    Thread {
      try {
        DepthCameraRuntime.ensureInitialized()
        DepthCameraPreviewView.pauseAllForCapture()
        stopPreviewLoop()
        val result = captureFrame(collectionName)
        promise.resolve(result)
      } catch (error: Throwable) {
        promise.reject(
          "DEPTH_CAMERA_CAPTURE_FAILED",
          error.message ?: "Unable to capture from Intel RealSense camera.",
          error
        )
      }
    }.start()
  }

  @ReactMethod
  fun saveCollectionJson(collectionName: String?, json: String, promise: Promise) {
    Thread {
      try {
        val safeCollection = safeName(collectionName ?: "collection")
        val jsonFile = savePublicBytes(
          safeCollection,
          "$safeCollection.json",
          "application/json",
          json.toByteArray(Charsets.UTF_8)
        )

        promise.resolve(WritableNativeMap().apply {
          putBoolean("success", true)
          putString("uri", jsonFile.uri)
          putString("path", jsonFile.displayPath)
          putString("saveFolder", "Documents/depth_camera_images/$safeCollection")
        })
      } catch (error: Throwable) {
        promise.reject(
          "DEPTH_CAMERA_JSON_SAVE_FAILED",
          error.message ?: "Unable to save metadata JSON in Documents/depth_camera_images.",
          error
        )
      }
    }.start()
  }

  @ReactMethod
  fun setExposureSettings(autoExposure: Boolean, exposure: Double, promise: Promise) {
    Thread {
      DepthCameraRuntime.updateExposureSettings(autoExposure, exposure.toFloat())
      DepthCameraPreviewView.refreshAllExposure()
      promise.resolve(WritableNativeMap().apply {
        putBoolean("success", true)
        putBoolean("autoExposure", DepthCameraRuntime.autoExposureEnabled)
        putDouble("exposure", DepthCameraRuntime.manualExposure.toDouble())
      })
    }.start()
  }

  @ReactMethod
  fun startPreview(collectionName: String?, promise: Promise) {
    if (previewRunning) {
      promise.resolve(true)
      return
    }

    previewRunning = true
    previewThread = Thread {
      try {
        DepthCameraRuntime.ensureInitialized()
        streamPreviewFrames(collectionName)
      } catch (error: Throwable) {
        if (previewRunning) {
          emitPreviewError(error.message ?: "Unable to start Intel RealSense live view.")
        }
      } finally {
        previewRunning = false
      }
    }.apply {
      name = "DepthCameraPreview"
      start()
    }

    promise.resolve(true)
  }

  @ReactMethod
  fun stopPreview(promise: Promise) {
    stopPreviewLoop()
    promise.resolve(true)
  }

  @ReactMethod
  fun addListener(eventName: String) {
  }

  @ReactMethod
  fun removeListeners(count: Int) {
  }

  private fun stopPreviewLoop() {
    previewRunning = false
    val thread = previewThread
    thread?.interrupt()
    if (thread != null && thread != Thread.currentThread()) {
      try {
        thread.join(1800)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
    previewThread = null
  }

  private fun captureFrame(collectionName: String?): WritableNativeMap {
    val safeCollection = safeName(collectionName ?: "collection")
    val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())

    com.intel.realsense.librealsense.RsContext().use { context ->
      context.queryDevices().use { devices: DeviceList ->
        if (devices.deviceCount <= 0) {
          throw IllegalStateException("No Intel RealSense device was detected. Connect the D435i over USB-C/OTG and accept the Android USB permission dialog.")
        }
      }
    }

    synchronized(DepthCameraRuntime.cameraLock) {
      Pipeline().use { pipeline ->
        Config().use { config ->
          config.enableStream(StreamType.DEPTH, -1, 640, 480, StreamFormat.Z16, 30)
          config.enableStream(StreamType.COLOR, -1, 640, 480, StreamFormat.RGB8, 30)

          pipeline.start(config).use { profile: PipelineProfile ->
            profile.getDevice().use { device ->
              DepthCameraRuntime.applyColorExposure(device)
            }
            try {
              repeat(8) {
                pipeline.waitForFrames(5000).use { _: FrameSet -> }
              }

              pipeline.waitForFrames(5000).use { frames: FrameSet ->
                val colorFrame = frames.first(StreamType.COLOR, StreamFormat.RGB8)
                  ?: throw IllegalStateException("RealSense color frame was not available.")
                val depthFrame = frames.first(StreamType.DEPTH, StreamFormat.Z16)
                  ?: throw IllegalStateException("RealSense depth frame was not available.")

                colorFrame.use { color ->
                  depthFrame.use { depth ->
                    return saveCapture(safeCollection, timestamp, color, depth)
                  }
                }
              }
            } finally {
              pipeline.stop()
            }
          }
        }
      }
    }
  }

  private fun streamPreviewFrames(collectionName: String?) {
    val safeCollection = safeName(collectionName ?: "collection")
    val outputDir = File(reactContext.cacheDir, "depth-camera-preview/$safeCollection").apply {
      deleteRecursively()
      mkdirs()
    }

    com.intel.realsense.librealsense.RsContext().use { context ->
      context.queryDevices().use { devices: DeviceList ->
        if (devices.deviceCount <= 0) {
          throw IllegalStateException("No Intel RealSense device was detected. Connect the D435i over USB-C/OTG and accept the Android USB permission dialog.")
        }
      }
    }

    synchronized(DepthCameraRuntime.cameraLock) {
      Pipeline().use { pipeline ->
        Config().use { config ->
          config.enableStream(StreamType.COLOR, -1, 640, 480, StreamFormat.RGB8, 30)

          pipeline.start(config).use { _: PipelineProfile ->
            try {
              repeat(3) {
                if (!previewRunning) return
                pipeline.waitForFrames(1000).use { _: FrameSet -> }
              }

              var frameIndex = 0
              while (previewRunning) {
                pipeline.waitForFrames(1000).use { frames: FrameSet ->
                  val colorFrame = frames.first(StreamType.COLOR, StreamFormat.RGB8)
                    ?: throw IllegalStateException("RealSense color preview frame was not available.")

                  colorFrame.use { color ->
                    val previewFile = File(outputDir, "live-$frameIndex.jpg")
                    val staleFile = File(outputDir, "live-${frameIndex - 120}.jpg")
                    if (staleFile.exists()) staleFile.delete()
                    savePreviewFrame(previewFile, color)
                    emitPreviewFrame(previewFile, frameIndex)
                  }
                }
                frameIndex += 1
                Thread.sleep(80)
              }
            } finally {
              pipeline.stop()
            }
          }
        }
      }
    }
  }

  private fun saveCapture(
    safeCollection: String,
    timestamp: String,
    colorFrame: Frame,
    depthFrame: Frame
  ): WritableNativeMap {
    val color = colorFrame.`as`<VideoFrame>(Extension.VIDEO_FRAME)
    val depth = depthFrame.`as`<DepthFrame>(Extension.DEPTH_FRAME)

    val colorBytes = ByteArray(colorFrame.dataSize)
    colorFrame.getData(colorBytes)

    val colorFile = savePublicBytes(
      safeCollection,
      "color-$timestamp.jpg",
      "image/jpeg",
      rgbJpegBytes(colorBytes, color.width, color.height)
    )

    val depthBytes = ByteArray(depthFrame.dataSize)
    depthFrame.getData(depthBytes)

    val depthRawFile = savePublicBytes(
      safeCollection,
      "depth-$timestamp-z16.raw",
      "application/octet-stream",
      depthBytes
    )

    val depthPreviewFile = savePublicBytes(
      safeCollection,
      "depth-$timestamp-preview.png",
      "image/png",
      depthPreviewBytes(depthBytes, depth.width, depth.height)
    )

    return WritableNativeMap().apply {
      putBoolean("success", true)
      putString("imageUrl", colorFile.uri)
      putString("depthRawUrl", depthRawFile.uri)
      putString("depthPreviewUrl", depthPreviewFile.uri)
      putMap("metadata", WritableNativeMap().apply {
        putString("source", "android-realsense")
        putString("capturedAt", isoNow())
        putString("colorFormat", "RGB8")
        putString("depthFormat", "Z16")
        putInt("colorWidth", color.width)
        putInt("colorHeight", color.height)
        putInt("depthWidth", depth.width)
        putInt("depthHeight", depth.height)
        putDouble("depthUnits", depth.units.toDouble())
        putDouble("centerDistanceMeters", depth.getDistance(depth.width / 2, depth.height / 2).toDouble())
        putString("colorPath", colorFile.displayPath)
        putString("depthRawPath", depthRawFile.displayPath)
        putString("depthPreviewPath", depthPreviewFile.displayPath)
        putString("saveFolder", "Documents/depth_camera_images/$safeCollection")
      })
    }
  }

  private fun savePreviewFrame(output: File, colorFrame: Frame) {
    val color = colorFrame.`as`<VideoFrame>(Extension.VIDEO_FRAME)
    val colorBytes = ByteArray(colorFrame.dataSize)
    colorFrame.getData(colorBytes)
    writeRgbJpeg(colorBytes, color.width, color.height, output)
  }

  private fun emitPreviewFrame(previewFile: File, frameIndex: Int) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("DepthCameraPreviewFrame", WritableNativeMap().apply {
        putBoolean("success", true)
        putString("imageUrl", previewFile.toURI().toString())
        putInt("frameIndex", frameIndex)
      })
  }

  private fun emitPreviewError(message: String) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("DepthCameraPreviewError", WritableNativeMap().apply {
        putBoolean("success", false)
        putString("error", message)
      })
  }

  private fun savePreview(outputDir: File, timestamp: String, colorFrame: Frame): WritableNativeMap {
    val color = colorFrame.`as`<VideoFrame>(Extension.VIDEO_FRAME)
    val colorBytes = ByteArray(colorFrame.dataSize)
    colorFrame.getData(colorBytes)
    val previewFile = File(outputDir, "preview-$timestamp.jpg")
    writeRgbJpeg(colorBytes, color.width, color.height, previewFile)
    return WritableNativeMap().apply {
      putBoolean("success", true)
      putString("imageUrl", previewFile.toURI().toString())
      putMap("metadata", WritableNativeMap().apply {
        putString("source", "android-realsense-preview")
        putString("capturedAt", isoNow())
        putString("colorFormat", "RGB8")
        putInt("colorWidth", color.width)
        putInt("colorHeight", color.height)
        putString("colorPath", previewFile.absolutePath)
      })
    }
  }

  private data class SavedFile(val uri: String, val displayPath: String)

  private fun savePublicBytes(
    safeCollection: String,
    fileName: String,
    mimeType: String,
    bytes: ByteArray
  ): SavedFile {
    val relativePath = "${Environment.DIRECTORY_DOCUMENTS}/depth_camera_images/$safeCollection"

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val uri = reactContext.contentResolver.insert(MediaStore.Files.getContentUri("external"), values)
        ?: throw IllegalStateException("Unable to create file in Documents/depth_camera_images.")

      reactContext.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
        ?: throw IllegalStateException("Unable to write file in Documents/depth_camera_images.")

      values.clear()
      values.put(MediaStore.MediaColumns.IS_PENDING, 0)
      reactContext.contentResolver.update(uri, values, null, null)

      return SavedFile(uri.toString(), "$relativePath/$fileName")
    }

    val outputDir = File(
      Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
      "depth_camera_images/$safeCollection"
    ).apply { mkdirs() }
    val output = File(outputDir, fileName)
    FileOutputStream(output).use { it.write(bytes) }
    return SavedFile(output.toURI().toString(), "Documents/depth_camera_images/$safeCollection/$fileName")
  }

  private fun rgbJpegBytes(rgb: ByteArray, width: Int, height: Int): ByteArray {
    val bitmap = rgbBitmap(rgb, width, height)
    val output = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)
    bitmap.recycle()
    return output.toByteArray()
  }

  private fun depthPreviewBytes(depth: ByteArray, width: Int, height: Int): ByteArray {
    val bitmap = depthPreviewBitmap(depth, width, height)
    val output = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
    bitmap.recycle()
    return output.toByteArray()
  }

  private fun writeRgbJpeg(rgb: ByteArray, width: Int, height: Int, output: File) {
    val bitmap = rgbBitmap(rgb, width, height)
    FileOutputStream(output).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
    bitmap.recycle()
  }

  private fun writeDepthPreview(depth: ByteArray, width: Int, height: Int, output: File) {
    val bitmap = depthPreviewBitmap(depth, width, height)
    FileOutputStream(output).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
  }

  private fun rgbBitmap(rgb: ByteArray, width: Int, height: Int): Bitmap {
    val pixels = IntArray(width * height)
    var source = 0
    for (i in pixels.indices) {
      val r = rgb[source++].toInt() and 0xff
      val g = rgb[source++].toInt() and 0xff
      val b = rgb[source++].toInt() and 0xff
      pixels[i] = -0x1000000 or (r shl 16) or (g shl 8) or b
    }
    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
  }

  private fun depthPreviewBitmap(depth: ByteArray, width: Int, height: Int): Bitmap {
    val pixels = IntArray(width * height)
    val maxPreviewMm = 3000
    var source = 0
    for (i in pixels.indices) {
      val lo = depth[source++].toInt() and 0xff
      val hi = depth[source++].toInt() and 0xff
      val millimeters = (hi shl 8) or lo
      val value = if (millimeters <= 0) {
        0
      } else {
        255 - ((millimeters.coerceAtMost(maxPreviewMm) * 255) / maxPreviewMm)
      }
      pixels[i] = -0x1000000 or (value shl 16) or (value shl 8) or value
    }
    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
  }

  private fun safeName(value: String): String {
    return value.replace(Regex("[^A-Za-z0-9._-]"), "-").ifBlank { "collection" }
  }

  private fun isoNow(): String {
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())
  }

  companion object {
    fun ensureInitialized() = DepthCameraRuntime.ensureInitialized()
  }
}
