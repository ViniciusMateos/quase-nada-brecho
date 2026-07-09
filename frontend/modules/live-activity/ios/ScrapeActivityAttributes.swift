import Foundation
import ActivityKit

// ⚠️ IDÊNTICO ao de targets/scrapewidget/ScrapeActivityAttributes.swift.
// O ActivityKit casa a activity do app com o widget pelo NOME + shape do tipo.
struct ScrapeActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var pct: Int
    var done: Int
    var total: Int
    var label: String
  }

  var titulo: String
}
