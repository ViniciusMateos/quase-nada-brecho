import ExpoModulesCore
import ActivityKit

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")
    Events("onToken")

    // device suporta + usuário deixou ligado?
    Function("disponivel") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // Inicia a Live Activity (pushType .token) e EMITE o push token dela pelo evento
    // "onToken" assim que o iOS o entrega (e a cada rotação). O JS escuta e manda pro
    // server, que passa a empurrar os updates via APNs. Sem corrida de timeout — o
    // token quase sempre chega 1-3s depois de iniciar, mas aqui a gente nunca perde.
    AsyncFunction("start") { (titulo: String, total: Int) -> Bool in
      guard #available(iOS 16.2, *),
            ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
      let attrs = ScrapeActivityAttributes(titulo: titulo)
      // total 0 = ainda não metrificou → o widget mostra só "começando" (sem 0/0 nem 0%)
      let state = ScrapeActivityAttributes.ContentState(
        pct: 0, done: 0, total: max(total, 0), label: "começando")
      do {
        let activity = try Activity.request(
          attributes: attrs,
          content: .init(state: state, staleDate: nil),
          pushType: .token
        )
        Task { [weak self] in
          for await tokenData in activity.pushTokenUpdates {
            let hex = tokenData.map { String(format: "%02x", $0) }.joined()
            self?.sendEvent("onToken", ["token": hex])
          }
        }
        return true
      } catch {
        return false
      }
    }

    // encerra todas as activities do scraper
    AsyncFunction("end") { (promise: Promise) in
      guard #available(iOS 16.2, *) else { promise.resolve(nil); return }
      Task {
        for activity in Activity<ScrapeActivityAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        promise.resolve(nil)
      }
    }
  }
}
