import ActivityKit
import WidgetKit
import SwiftUI

// laranja da marca (#FF8234)
let marca = Color(red: 1.0, green: 0.51, blue: 0.204)

func pctFrac(_ p: Int) -> Double { Double(max(0, min(100, p))) / 100.0 }

// só tem métrica de verdade quando o total já foi medido (> 0). Antes disso é "começando".
func metrificado(_ s: ScrapeActivityAttributes.ContentState) -> Bool { s.total > 0 }

func subLabel(_ s: ScrapeActivityAttributes.ContentState) -> String {
  if !metrificado(s) { return s.label.isEmpty ? "começando" : s.label }
  return s.label.isEmpty ? "\(s.done)/\(s.total)" : "\(s.done)/\(s.total) · \(s.label)"
}

// logo branca da marca (Assets.xcassets/qnlogo)
func logoQN(_ lado: CGFloat) -> some View {
  Image("qnlogo")
    .resizable()
    .renderingMode(.template)
    .aspectRatio(contentMode: .fit)
    .foregroundColor(.white)
    .frame(width: lado, height: lado)
}

@main
struct ScrapeWidgetBundle: WidgetBundle {
  var body: some Widget {
    ScrapeLiveActivity()
  }
}

struct ScrapeLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ScrapeActivityAttributes.self) { context in
      // Lock screen / banner
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 8) {
          logoQN(22)
          Text(context.attributes.titulo)
            .font(.headline).foregroundColor(.white)
          Spacer()
          if metrificado(context.state) {
            Text("\(context.state.pct)%")
              .font(.headline.bold()).foregroundColor(marca)
          }
        }
        // barra vazia enquanto ainda não metrificou o total (evita "meio preenchida" falsa)
        ProgressView(value: metrificado(context.state) ? pctFrac(context.state.pct) : 0)
          .tint(marca)
        Text(subLabel(context.state))
          .font(.caption).foregroundColor(.gray)
      }
      .padding()
      .activityBackgroundTint(Color.black.opacity(0.9))
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          logoQN(26)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if metrificado(context.state) {
            Text("\(context.state.pct)%").font(.title3.bold()).foregroundColor(marca)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 4) {
            ProgressView(value: metrificado(context.state) ? pctFrac(context.state.pct) : 0)
              .tint(marca)
            Text(subLabel(context.state)).font(.caption).foregroundColor(.gray)
          }
        }
      } compactLeading: {
        logoQN(18)
      } compactTrailing: {
        if metrificado(context.state) {
          Text("\(context.state.pct)%").foregroundColor(marca)
        }
      } minimal: {
        logoQN(18)
      }
    }
  }
}
