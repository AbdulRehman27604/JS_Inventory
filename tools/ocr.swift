import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let image = NSImage(contentsOfFile: path),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    try VNImageRequestHandler(cgImage: cg).perform([request])
    let lines = (request.results ?? []).compactMap { observation -> String? in
        guard let text = observation.topCandidates(1).first?.string else { return nil }
        return text
    }
    let data = try JSONSerialization.data(withJSONObject: ["file": path, "text": lines], options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}
