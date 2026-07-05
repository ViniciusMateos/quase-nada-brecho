"""
EXPERIMENTO: raspar o perfil SCROLLANDO (que nem humano) e interceptando as
respostas XHR que a própria página dispara — em vez de chamar a API em rajada.

Objetivo: descobrir (1) qual endpoint o scroll dispara, (2) se bloqueia, (3)
quantos posts únicos dá pra juntar descendo o feed.
"""
import json
import os
import random
import time

import config
from iglib import IG, carregar_cookies, log

COOKIES_FILE = "imported_cookies.json"

captured = {}       # code/pk -> item (formato REST feed/user)
graphql_bodies = []  # amostras cruas de graphql pra inspecionar shape
url_hits = {}        # url base -> contagem


def _registrar_url(url):
    base = url.split("?")[0]
    url_hits[base] = url_hits.get(base, 0) + 1


def _colher_rest(data):
    n = 0
    for it in (data.get("items") or []):
        code = it.get("code") or it.get("pk")
        if code:
            captured[code] = it
            n += 1
    return n


def _colher_graphql(data):
    """Tenta achar edges de mídia no shape graphql e converter pro shape REST-ish."""
    n = 0
    txt = json.dumps(data)
    # heurística: guarda 1 amostra crua pra inspeção
    if len(graphql_bodies) < 2:
        graphql_bodies.append(data)
    # caminhos comuns onde vêm os posts do perfil
    def _walk(o):
        nonlocal n
        if isinstance(o, dict):
            # nó de mídia do graphql moderno
            if o.get("code") and ("image_versions2" in o or "caption" in o):
                captured[o["code"]] = o
                n += 1
            for v in o.values():
                _walk(v)
        elif isinstance(o, list):
            for v in o:
                _walk(v)
    _walk(data)
    return n


def on_response(resp):
    url = resp.url
    if "instagram.com" not in url:
        return
    if not any(k in url for k in ("/api/v1/feed/", "/graphql", "web_profile_info", "timeline")):
        return
    try:
        data = resp.json()
    except Exception:
        return
    _registrar_url(url)
    if "/api/v1/feed/" in url:
        got = _colher_rest(data)
        log.info("XHR REST feed -> +%d (total unico: %d)", got, len(captured))
    elif "graphql" in url:
        got = _colher_graphql(data)
        if got:
            log.info("XHR graphql -> +%d (total unico: %d)", got, len(captured))


def main():
    with IG() as ig:
        if os.path.exists(COOKIES_FILE):
            ig.ctx.add_cookies(carregar_cookies(COOKIES_FILE))
            log.info("Sessao re-injetada.")
        ig.page.on("response", on_response)
        ig.ir(f"https://www.instagram.com/{config.BRECHO_USERNAME}/")
        if not ig.logado():
            log.error("NAO LOGADO — abortando.")
            return
        log.info("Logado. Comecando a scrollar o perfil...")

        estavel = 0
        last = 0
        for i in range(60):
            ig.page.mouse.wheel(0, random.randint(3000, 6000))
            ig.page.wait_for_timeout(int(random.uniform(1800, 3800)))
            n = len(captured)
            if n == last:
                estavel += 1
            else:
                estavel = 0
            last = n
            if i % 3 == 0 or estavel:
                log.info("scroll %d: %d posts unicos (%d scrolls sem novidade)", i + 1, n, estavel)
            if estavel >= 6:
                log.info("Feed estabilizou — provavelmente chegou ao fim.")
                break

        os.makedirs(config.OUTPUT_DIR, exist_ok=True)
        with open(os.path.join(config.OUTPUT_DIR, "scroll_capture.json"), "w", encoding="utf-8") as f:
            json.dump(list(captured.values()), f, ensure_ascii=False)
        if graphql_bodies:
            with open(os.path.join(config.OUTPUT_DIR, "graphql_sample.json"), "w", encoding="utf-8") as f:
                json.dump(graphql_bodies[0], f, ensure_ascii=False)

        log.info("========== FIM ==========")
        log.info("posts unicos capturados: %d", len(captured))
        log.info("endpoints tocados:")
        for u, c in sorted(url_hits.items(), key=lambda x: -x[1]):
            log.info("   %dx  %s", c, u)


if __name__ == "__main__":
    main()
