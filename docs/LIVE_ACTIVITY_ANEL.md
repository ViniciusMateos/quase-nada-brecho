# Live Activity com anel de progresso (pra replicar no Bots)

A lógica do LA "com a roda preenchendo" do brechó, pronta pra jogar no `BotsWidget.swift`.
Tudo é **nativo** (SwiftUI no widget target) — muda no `.swift` e **rebuilda** (OTA não pega widget).

---

## 1. O anel (componente reusável, recebe a cor)

No brechó a cor é fixa (`marca`); deixei aqui **parametrizada** (`cor`) pra servir os dois apps.

```swift
struct AnelProgresso<Conteudo: View>: View {
  let frac: Double          // 0…1 — 0 = ainda "começando" (total não medido)
  let cor: Color
  let lado: CGFloat
  let traco: CGFloat
  @ViewBuilder let dentro: () -> Conteudo   // o miolo: a % (quando grande) ou a logo

  var body: some View {
    ZStack {
      // trilho. inset(by: traco/2) = o traço fica DENTRO do frame (senão a ponta
      // arredondada extrapola e a ilha compacta corta o anel na direita).
      Circle().inset(by: traco / 2)
        .stroke(Color.white.opacity(0.16), lineWidth: traco)

      if frac >= 1 {
        // anel CHEIO: círculo FECHADO, sem ponta. No 100% a ponta arredondada do fim
        // sobrepunha a do início no topo e "comia" um pedaço do traço — fechar resolve.
        Circle().inset(by: traco / 2).stroke(cor, lineWidth: traco)
      } else if frac > 0 {
        Circle().inset(by: traco / 2)
          .trim(from: 0, to: frac)
          .stroke(cor, style: StrokeStyle(lineWidth: traco, lineCap: .round))
          .rotationEffect(.degrees(-90))   // começa no topo, enche horário
      }

      dentro()
    }
    .frame(width: lado, height: lado)
    .animation(.easeOut(duration: 0.4), value: frac)   // enche animado a cada update
  }
}
```

## 2. Logo nítida (o fix do "pixelado")

```swift
func logoQN(_ lado: CGFloat) -> some View {
  Image("qnlogo")
    .resizable()
    .interpolation(.high)     // ← reamostragem suave no downscale (mata o serrilhado)
    .antialiased(true)
    .renderingMode(.template) // logo branca (usa só o alpha)
    .aspectRatio(contentMode: .fit)
    .foregroundColor(.white)
    .frame(width: lado, height: lado)
}
```

## 3. Onde usar o anel (tamanhos que ficaram bons)

| Região | Chamada |
|--------|---------|
| **compactLeading** (pílula) | `AnelProgresso(frac: f, cor: c, lado: 19, traco: 2.4) { logoQN(10) }` — frame pequeno, senão a ilha corta na direita (recorte da câmera) |
| **minimal** | `AnelProgresso(frac: f, cor: c, lado: 25, traco: 2.6) { logoQN(12) }` |
| **expandida .leading** | `AnelProgresso(frac: f, cor: c, lado: 40, traco: 4) { logoQN(18) }` |
| **compactTrailing** / expandida .trailing | só o texto `"\(pct)%"` na cor de destaque |
| **lock screen** | anel grande `lado: 54, traco: 5` com a **% no miolo**; do lado, título + sublabel |

Lock screen (o layout que ficou no brechó):

```swift
HStack(spacing: 14) {
  AnelProgresso(frac: f, cor: c, lado: 54, traco: 5) {
    if medido { Text("\(pct)%").font(.system(size: 15, weight: .heavy)).foregroundColor(.white).monospacedDigit() }
    else { logoQN(20) }
  }
  VStack(alignment: .leading, spacing: 3) {
    HStack(spacing: 7) { logoQN(16); Text(titulo).font(.headline).foregroundColor(.white).lineLimit(1) }
    Text(sublabel).font(.caption).foregroundColor(.gray).lineLimit(1)
  }
  Spacer()
}
.padding()
.activityBackgroundTint(Color.black.opacity(0.9))
.activitySystemActionForegroundColor(.white)
```

---

## As 3 pegadinhas (o que quebrava)

1. **Cortava na direita** na ilha compacta → `.inset(by: traco/2)` no Circle (traço dentro do frame) **+** frame menor na compactLeading (a ilha é estreita perto do recorte da câmera).
2. **No 100% "comia" o traço** → a ponta arredondada do fim sobrepõe a do início no topo. Fix: quando `frac >= 1`, desenha `Circle().stroke()` **cheio/fechado** (sem `.trim`, sem ponta).
3. **Logo pixelada** → `.interpolation(.high).antialiased(true)` na `Image` (o downscale de 500px pra ~10-30px sem isso serrilha).

---

## Adaptando pro Bots

O Bots já tem o anel só no `minimal` e sem esses fixes. Pra ficar igual:

- **Cor**: passa `cor: corDestaque(context.state)` (a lógica que vocês já têm — cor do bot quando é um só, rosa/gradiente no conjunto). Onde eu uso `marca`, você usa isso.
- **Frac**: `let f = context.state.medido ? pctFrac(context.state.pct) : 0`.
- **Logo**: adiciona `.interpolation(.high).antialiased(true)` no `logoQN` de vocês (tá pixelando igual).
- **Aplica o anel** em: `compactLeading` (hoje é só logo), `minimal` (troca o Circle atual pelo `AnelProgresso` com os fixes), e a `.leading` da expandida.
- **Lock screen / lista de bots**: mantém a lista por bot que vocês já têm; se quiser, põe um `AnelProgresso` pequeno no cabeçalho no lugar/junto da barra.
- Cuidado com o `ContentState`: no Bots os campos são `pct/medido/quantos/bot/linhas...`; o `frac` sai de `pct/medido`, o resto do layout é seu.

> Resumo: o **AnelProgresso** e o **logoQN com interpolation** são copy-paste; só a **cor** e a **fonte do frac** mudam de app pra app.
