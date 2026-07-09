import Foundation
import ActivityKit

// ⚠️ ESTE ARQUIVO TEM QUE SER IDÊNTICO ao de modules/live-activity/ios/ScrapeActivityAttributes.swift
// (mesmo nome de tipo + mesmos campos do ContentState). O ActivityKit casa a activity
// do app com o widget pelo NOME + shape do tipo — se divergir, o widget não desenha.
struct ScrapeActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var pct: Int
    var done: Int
    var total: Int
    var label: String
  }

  var titulo: String
}
