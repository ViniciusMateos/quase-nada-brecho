"""
brecho-tracker — raspa o brechó @brechoquasenadaa e mantém a planilha dinâmica.

Fluxo:
  1. abre a sessão logada (cookies importados 1x)
  2. raspa o feed inteiro DESCENDO o perfil (scroll) e interceptando as respostas
     graphql que a própria página dispara — sem chamar a API em rajada, então não
     toma rate-limit (ver iglib.raspar_perfil_scroll)
  3. parseia cada post (ignora divulgação); o boundary só DESCARTA as peças
     anteriores ao drop mais antigo ainda disponível (já 100% vendidas) — não
     interrompe a raspagem
  4. reconcilia com a planilha (preserva o manual, atualiza o raspado, retém preço)
     e recalcula os KPIs
  5. salva brecho_tracker.xlsx

Uso:
  python main.py --import-cookies "C:\\...\\cookies.json"   # 1x, loga
  python main.py --dry-run        # raspa e mostra o que MUDARIA, sem gravar a planilha
  python main.py                  # roda pra valer (atualiza a planilha)
  python main.py --full           # ignora o boundary e mantém o feed inteiro
"""
import argparse
import io
import os
import sys
import time

import config
from iglib import IG, carregar_cookies, log
import parser
import planilha

COOKIES_FILE = "imported_cookies.json"

_T_INICIO = time.monotonic()


def _dur_run():
    """Tempo total desta execução, formatado (ex: '3m 12s')."""
    s = int(time.monotonic() - _T_INICIO)
    h, r = divmod(s, 3600)
    m, s = divmod(r, 60)
    return f"{h}h {m}m {s}s" if h else (f"{m}m {s}s" if m else f"{s}s")


def _reinjetar_sessao(ig):
    """Re-injeta os cookies do arquivo no contexto ANTES de navegar. O Chromium
    não grava cookies de sessão no disco do perfil persistente, então não dá pra
    confiar que o sessionid do `--import-cookies` sobreviva até a run de raspagem.
    Re-injetando aqui, toda raspagem começa logada sem depender da persistência."""
    if os.path.exists(COOKIES_FILE):
        try:
            ig.ctx.add_cookies(carregar_cookies(COOKIES_FILE))
            log.info("Sessão re-injetada de %s.", COOKIES_FILE)
        except Exception as e:
            log.warning("Falha re-injetando cookies (%s): %s", COOKIES_FILE, e)


def modo_importar_cookies(path):
    cookies = carregar_cookies(path)
    log.info("Importando %d cookies de %s…", len(cookies), path)
    with IG() as ig:
        if ig.importar_cookies(cookies):
            log.info("Sessão logada! Rode `python main.py --dry-run`.")
        else:
            log.warning("Importou, mas não achei sessionid. Exporte os cookies do instagram.com "
                        "COM uma conta logada.")


def raspar(ig, boundary):
    """Raspa o feed do perfil e devolve as peças parseadas (novo→antigo).

    Desce o perfil SCROLLANDO como humano e intercepta as respostas graphql que a
    própria página dispara (iglib.raspar_perfil_scroll). O IG serve o scroll natural
    sem estrangular, então uma run pega o feed inteiro — sem rate-limit, sem resume,
    sem grinder. O boundary só corta as peças mais antigas que já estão 100% vendidas."""
    info = ig.perfil_info(config.BRECHO_USERNAME)
    log.info("Perfil @%s — id=%s — %s posts — privado=%s",
             info["username"], info["user_id"], info["posts"], info["is_private"])

    if boundary:
        log.info("Boundary ativo: descarto peças anteriores ao drop %s (já vendidas).", boundary)
    else:
        log.info("Sem boundary (--full): raspando o feed inteiro.")

    itens = ig.raspar_perfil_scroll(config.BRECHO_USERNAME, total_alvo=info.get("posts"))
    itens.sort(key=lambda x: x.get("taken_at") or 0, reverse=True)   # novo→antigo

    pecas, promo, cortadas = [], 0, 0
    for it in itens:
        p = parser.parse_post(it)
        if p is None:
            promo += 1
            continue
        if boundary and p["drop"] and p["drop"] < boundary:
            cortadas += 1
            continue
        pecas.append(p)

    log.info("Raspagem: %d posts vistos → %d peças, %d divulgação%s.",
             len(itens), len(pecas), promo,
             f", {cortadas} antes do boundary" if cortadas else "")
    return pecas


def _dump_pecas(pecas):
    """Entrega as peças parseadas (com #p<num>) num JSON pro BACKEND — é o APP que reconcilia
    e é a fonte da verdade (dry: prevê com rollback; normal: aplica). Uma lista só, sempre sync."""
    import json
    itens = [{
        "code": p.get("code"), "drop": p.get("drop"), "item": p.get("item"),
        "nome": p.get("nome"), "tamanho": p.get("tamanho"),
        "largura": p.get("largura"), "comprimento": p.get("comprimento"),
        "circunferencia": p.get("circunferencia"), "condicao": p.get("condicao"),
        "venda": p.get("preco"), "vendida": bool(p.get("vendida")),
        "imagem_url": p.get("imagem_url"), "numero": p.get("numero"),
    } for p in pecas if p.get("code")]
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    with open(os.path.join(config.OUTPUT_DIR, "pecas.json"), "w", encoding="utf-8") as f:
        json.dump(itens, f, ensure_ascii=False)


def run(dry=False, full=False):
    log.info("Iniciando%s%s…", " (DRY-RUN)" if dry else "", " (FULL)" if full else "")
    # a planilha é um ESPELHO do app (o backend reescreve antes de raspar) — usada só pra
    # calcular o boundary (até onde descer o feed). Quem reconcilia/é a verdade é o APP.
    db = planilha.carregar_db()
    if db:
        log.info("App tem %d peças cadastradas.", len(db))
    boundary = None if (full or not db) else planilha.boundary_disponivel(db)

    log.info("Abrindo navegador (Chrome)… isso leva alguns segundos.")
    with IG() as ig:
        _reinjetar_sessao(ig)
        ig.ir("https://www.instagram.com/")
        if not ig.logado():
            log.error("Sem sessão logada. Rode `--import-cookies <arquivo.json>` primeiro.")
            return
        ig.carregar_tokens()
        pecas = raspar(ig, boundary)
        # (sem download de fotos: o app usa o link da CDN direto; a foto de upload local
        #  das peças achadas é trocada pelo link no backend, na reconciliação do import)

    if not pecas:
        log.info("Nenhuma peça nova no feed. Nada a atualizar.")
        _dump_pecas([])
        return

    # Entrega as peças pro APP. O que muda por peça (casada/nova/vendeu) e o resumo vêm do
    # app — IGUAL no dry e no normal; o dry só não grava. Tempo: %s
    _dump_pecas(pecas)
    log.info("Raspagem concluída em %s: %d peças entregues pro app%s.",
             _dur_run(), len(pecas), " (simulação)" if dry else "")


def rematch():
    """Sem raspar: preenche compra/venda faltantes da planilha atual usando a antiga,
    e regrava (mantém fotos/hover, fórmulas, formatação)."""
    db = planilha.carregar_db()
    if not db:
        log.error("Não há brecho_tracker.xlsx ainda. Rode `python main.py` primeiro.")
        return
    antiga = planilha.carregar_planilha_antiga()
    if not antiga:
        log.error("Não achei a planilha antiga (quasenadabrecho.xlsx).")
        return
    n = planilha.backfill_antiga(db, antiga)
    planilha.salvar(db)
    log.info("Rematch: %d valores (compra/venda) preenchidos pela antiga. Planilha atualizada.", n)


def main():
    ap = argparse.ArgumentParser(description="brecho-tracker")
    ap.add_argument("--import-cookies", metavar="FILE", help="importa cookies e loga")
    ap.add_argument("--dry-run", action="store_true", help="raspa e mostra o que mudaria, sem gravar")
    ap.add_argument("--full", action="store_true", help="ignora o boundary e raspa o feed inteiro")
    ap.add_argument("--rematch", action="store_true",
                    help="sem raspar: preenche compra/venda faltantes pela planilha antiga")
    a = ap.parse_args()
    if a.import_cookies:
        modo_importar_cookies(a.import_cookies)
        return
    if a.rematch:
        rematch()
        return
    try:
        run(dry=a.dry_run, full=a.full)
    except KeyboardInterrupt:
        log.info("Interrompido.")
    except Exception as e:
        log.error("erro: %s", e)
        import traceback
        traceback.print_exc()
        sys.exit(2)


if __name__ == "__main__":
    main()
