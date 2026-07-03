"""
Inspetor de posts do brechó — baixa as legendas REAIS pra calibrar o parser.

NÃO age em nada: só LÊ os posts de @brechoquasenadaa e despeja legenda + metadados.
Com isso eu vejo como você escreve (tamanho/marca/medidas/preço) e como marca
"VENDIDA" — e aí escrevo o parser certo.

Uso:
  python inspect_posts.py --import-cookies "C:\\caminho\\cookies.json"   # 1x, loga
  python inspect_posts.py                  # baixa ~3 páginas (36 posts) e mostra
  python inspect_posts.py --paginas 6      # baixa N páginas
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import config
from iglib import IG, carregar_cookies, log


def _data(epoch):
    if not epoch:
        return None
    return datetime.fromtimestamp(int(epoch), tz=timezone.utc).astimezone().strftime("%Y-%m-%d")


def _resumir(item):
    cap = ((item.get("caption") or {}).get("text")) or ""
    tipo = {1: "imagem", 2: "vídeo", 8: "carrossel"}.get(item.get("media_type"), str(item.get("media_type")))
    return {
        "code": item.get("code"),
        "data": _data(item.get("taken_at")),
        "tipo": tipo,
        "likes": item.get("like_count"),
        "comentarios": item.get("comment_count"),
        "legenda": cap,
    }


def modo_importar_cookies(path):
    cookies = carregar_cookies(path)
    log.info("Importando %d cookies de %s…", len(cookies), path)
    with IG() as ig:
        if ig.importar_cookies(cookies):
            log.info("✓ Sessão logada! Agora rode `python inspect_posts.py`.")
        else:
            log.warning("Importou, mas não achei sessionid. Exporte os cookies do instagram.com "
                        "COM uma conta logada.")


def inspecionar(paginas):
    with IG() as ig:
        ig.ir("https://www.instagram.com/")
        if not ig.logado():
            log.error("Sem sessão logada. Rode `--import-cookies <arquivo.json>` primeiro.")
            return
        ig.carregar_tokens()

        info = ig.perfil_info(config.BRECHO_USERNAME)
        log.info("Perfil @%s — id=%s — %s posts — privado=%s",
                 info["username"], info["user_id"], info["posts"], info["is_private"])

        coletados = []
        max_id = None
        for i in range(paginas):
            itens, max_id, mais = ig.feed_pagina(info["user_id"], max_id=max_id)
            coletados.extend(itens)
            log.info("página %d: +%d posts (total %d)%s", i + 1, len(itens), len(coletados),
                     "" if mais else "  [fim do feed]")
            if not mais or not max_id:
                break
            time.sleep(3)

        resumo = [_resumir(it) for it in coletados]
        os.makedirs(config.OUTPUT_DIR, exist_ok=True)
        destino = os.path.join(config.OUTPUT_DIR, "posts_sample.json")
        with open(destino, "w", encoding="utf-8") as f:
            json.dump(resumo, f, ensure_ascii=False, indent=2)
        log.info("✓ %d posts salvos em %s", len(resumo), destino)

        # imprime as primeiras legendas pra calibração rápida
        log.info("──────────── AMOSTRA DE LEGENDAS (primeiros 8 posts) ────────────")
        for r in resumo[:8]:
            log.info("● %s | %s | %s | %s likes", r["code"], r["data"], r["tipo"], r["likes"])
            for linha in (r["legenda"] or "(sem legenda)").splitlines() or ["(sem legenda)"]:
                log.info("    %s", linha)
            log.info("    " + "─" * 40)
        log.info("Me mande o output (ou o output/posts_sample.json) que eu escrevo o parser.")


def main():
    ap = argparse.ArgumentParser(description="inspetor de posts do brechó")
    ap.add_argument("--import-cookies", metavar="FILE", help="importa cookies e loga")
    ap.add_argument("--paginas", type=int, default=3, help="quantas páginas baixar (12 posts cada)")
    a = ap.parse_args()
    if a.import_cookies:
        modo_importar_cookies(a.import_cookies)
        return
    try:
        inspecionar(a.paginas)
    except KeyboardInterrupt:
        log.info("Interrompido.")
    except Exception as e:
        log.error("⛔ erro: %s", e)
        sys.exit(2)


if __name__ == "__main__":
    main()
