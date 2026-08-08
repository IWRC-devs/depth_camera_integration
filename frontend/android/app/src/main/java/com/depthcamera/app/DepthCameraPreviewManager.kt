package com.depthcamera.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class DepthCameraPreviewManager : SimpleViewManager<DepthCameraPreviewView>() {
  override fun getName(): String = "DepthCameraPreview"

  override fun createViewInstance(reactContext: ThemedReactContext): DepthCameraPreviewView {
    return DepthCameraPreviewView(reactContext)
  }

  @ReactProp(name = "mode")
  fun setMode(view: DepthCameraPreviewView, mode: String?) {
    view.setPreviewMode(mode ?: "rgb")
  }
}
