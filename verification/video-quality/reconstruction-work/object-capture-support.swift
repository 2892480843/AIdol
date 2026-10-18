import Foundation
import RealityKit

// Only queries hardware support. Does not create a session or read any images.
if #available(macOS 12.0, *) {
    print("{\"photogrammetry_supported\":\(PhotogrammetrySession.isSupported),\"reconstruction_run\":false}")
} else {
    print("{\"photogrammetry_supported\":false,\"reconstruction_run\":false}")
}
