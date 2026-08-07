package com.depthcamera.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.widget.ImageView
import com.intel.realsense.librealsense.Config
import com.intel.realsense.librealsense.DeviceList
import com.intel.realsense.librealsense.Extension
import com.intel.realsense.librealsense.FrameSet
import com.intel.realsense.librealsense.Pipeline
import com.intel.realsense.librealsense.PipelineProfile
import com.intel.realsense.librealsense.RsContext
import com.intel.realsense.librealsense.StreamFormat
import com.intel.realsense.librealsense.StreamType
import com.intel.realsense.librealsense.VideoFrame
import java.util.Collections
import java.util.WeakHashMap

class DepthCameraPreviewView(context: Context) : ImageView(context) {
  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile
  private var running = false
  private var attached = false
  private var streamThread: Thread? = null

  init {
    setBackgroundColor(Color.rgb(17, 24, 39))
    scaleType = ScaleType.CENTER_CROP
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = true
    activeViews.add(this)
    startStream()
  }

  override fun onDetachedFromWindow() {
    attached = false
    activeViews.remove(this)
    stopStream()
    super.onDetachedFromWindow()
  }

  fun pauseForCapture() {
    stopStream()
    postDelayed({
      if (attached) startStream()
    }, 1200)
  }

  private fun startStream() {
    if (running) return
    running = true
    streamThread = Thread {
      try {
        streamRgb()
      } catch (_: Throwable) {
        // Keep preview failures quiet in the view; capture still reports errors through the button.
      } finally {
        running = false
      }
    }.apply {
      name = "DepthCameraNativePreview"
      start()
    }
  }

  private fun stopStream() {
    running = false
    val thread = streamThread
    thread?.interrupt()
    if (thread != null && thread != Thread.currentThread()) {
      try {
        thread.join(1800)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
    streamThread = null
  }

  private fun streamRgb() {
    DepthCameraRuntime.ensureInitialized()
    RsContext().use { context ->
      context.queryDevices().use { devices: DeviceList ->
        if (devices.deviceCount <= 0) return
      }
    }

    synchronized(DepthCameraRuntime.cameraLock) {
      Pipeline().use { pipeline ->
        Config().use { config ->
          config.enableStream(StreamType.COLOR, -1, 640, 480, StreamFormat.RGB8, 30)

          pipeline.start(config).use { _: PipelineProfile ->
            try {
              repeat(5) {
                if (!running) return
                pipeline.waitForFrames(1000).use { _: FrameSet -> }
              }

              while (running) {
                pipeline.waitForFrames(1000).use { frames: FrameSet ->
                  val colorFrame = frames.first(StreamType.COLOR, StreamFormat.RGB8) ?: return@use
                  colorFrame.use { frame ->
                    val videoFrame = frame.`as`<VideoFrame>(Extension.VIDEO_FRAME)
                    val bytes = ByteArray(frame.dataSize)
                    frame.getData(bytes)
                    val bitmap = rgbToBitmap(bytes, videoFrame.width, videoFrame.height)
                    mainHandler.post {
                      if (attached) setImageBitmap(bitmap) else bitmap.recycle()
                    }
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

  private fun rgbToBitmap(rgb: ByteArray, width: Int, height: Int): Bitmap {
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

  companion object {
    private val activeViews = Collections.synchronizedSet(
      Collections.newSetFromMap(WeakHashMap<DepthCameraPreviewView, Boolean>())
    )

    fun pauseAllForCapture() {
      val snapshot = synchronized(activeViews) { activeViews.toList() }
      snapshot.forEach { it.pauseForCapture() }
    }
  }
}
