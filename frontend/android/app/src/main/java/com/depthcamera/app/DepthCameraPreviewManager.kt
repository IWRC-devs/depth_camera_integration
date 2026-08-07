package com.depthcamera.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class DepthCameraPreviewManager : SimpleViewManager<DepthCameraPreviewView>() {
  override fun getName(): String = "DepthCameraPreview"

  override fun createViewInstance(reactContext: ThemedReactContext): DepthCameraPreviewView {
    return DepthCameraPreviewView(reactContext)
  }
}
