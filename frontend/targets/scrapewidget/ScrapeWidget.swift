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
    .interpolation(.high)     // downscale de 500px pra ~10-30px com reamostragem suave (sem serrilhar)
    .antialiased(true)
    .renderingMode(.template)
    .aspectRatio(contentMode: .fit)
    .foregroundColor(.white)
    .frame(width: lado, height: lado)
}

// Anel de progresso (a "roda" que preenche conforme o pct), na cor da marca. Enquanto o
// total não foi medido, o arco fica zerado (sem preenchimento falso) — igual à barra antiga.
// `dentro` é o que fica no miolo (a % quando grande, a logo quando pequeno/começando).
struct AnelProgresso<Conteudo: View>: View {
  let state: ScrapeActivityAttributes.ContentState
  let lado: CGFloat
  let traco: CGFloat
  @ViewBuilder let dentro: () -> Conteudo

  // fração preenchida (0…1); só depois de medir o total
  var frac: Double { metrificado(state) ? pctFrac(state.pct) : 0 }

  var body: some View {
    ZStack {
      // trilho. inset by traco/2: o traço fica DENTRO do frame (senão a ponta arredondada
      // extrapola e a ilha compacta corta o anel na direita, encostando no recorte da câmera).
      Circle().inset(by: traco / 2)
        .stroke(Color.white.opacity(0.16), lineWidth: traco)
      if frac >= 1 {
        // anel CHEIO: círculo fechado (sem ponta). No 100% a ponta arredondada do FIM
        // sobrepunha a do INÍCIO no topo e "comia" um pedaço do traço — fechando o círculo some.
        Circle().inset(by: traco / 2)
          .stroke(marca, lineWidth: traco)
      } else if frac > 0 {
        Circle().inset(by: traco / 2)
          .trim(from: 0, to: frac)
          .stroke(marca, style: StrokeStyle(lineWidth: traco, lineCap: .round))
          .rotationEffect(.degrees(-90))
      }
      dentro()
    }
    .frame(width: lado, height: lado)
    .animation(.easeOut(duration: 0.4), value: state.pct)
  }
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
      // ── Lock screen / banner: anel grande com a % no miolo + título e sublabel ──
      HStack(spacing: 14) {
        AnelProgresso(state: context.state, lado: 54, traco: 5) {
          if metrificado(context.state) {
            Text("\(context.state.pct)%")
              .font(.system(size: 15, weight: .heavy))
              .foregroundColor(.white)
              .monospacedDigit()
          } else {
            logoQN(20)
          }
        }
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 7) {
            logoQN(16)
            Text(context.attributes.titulo)
              .font(.headline).foregroundColor(.white).lineLimit(1)
          }
          Text(subLabel(context.state))
            .font(.caption).foregroundColor(.gray).lineLimit(1)
        }
        Spacer()
      }
      .padding()
      .activityBackgroundTint(Color.black.opacity(0.9))
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          AnelProgresso(state: context.state, lado: 40, traco: 4) { logoQN(18) }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if metrificado(context.state) {
            Text("\(context.state.pct)%").font(.title3.bold()).foregroundColor(marca)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 3) {
            Text(context.attributes.titulo)
              .font(.caption.bold()).foregroundColor(.white).lineLimit(1)
            Text(subLabel(context.state))
              .font(.caption).foregroundColor(.gray).lineLimit(1)
          }
        }
      } compactLeading: {
        // a rodinha preenchendo, com a logo no miolo — sempre visível na ilha.
        // frame menor + padding: a ilha compacta é estreita e corta na direita (recorte da câmera).
        AnelProgresso(state: context.state, lado: 19, traco: 2.4) { logoQN(10) }
          .padding(.trailing, 1)
      } compactTrailing: {
        if metrificado(context.state) {
          Text("\(context.state.pct)%").foregroundColor(marca)
        }
      } minimal: {
        AnelProgresso(state: context.state, lado: 25, traco: 2.6) { logoQN(12) }
      }
    }
  }
}
