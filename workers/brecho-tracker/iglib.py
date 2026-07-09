"""
Cliente do Instagram web para o brecho-tracker.

Mesma estratégia dos outros workers: dirige um Chrome logado via Playwright e faz
as chamadas de API de dentro da própria página logada (fetch same-origin) — assim
cookies, fingerprint e headers são os do navegador real.

Aqui só precisamos LER (raspar) — nenhuma ação de escrita no Instagram.
"""
import json
import logging
import os
import random
import sys
import time

from playwright.sync_api import sync_playwright

import config


# ───────────────────────────── log ─────────────────────────────
def setup_logger():
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    logger = logging.getLogger("brecho")
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return logger
    fmt = logging.Formatter("%(asctime)s  %(levelname)-5s  %(message)s",
                            datefmt="%Y-%m-%d %H:%M:%S")
    fh = logging.FileHandler(config.LOG_FILE, encoding="utf-8")
    fh.setFormatter(fmt)
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


log = setup_logger()


# ───────────── JS injetado na página logada (GET same-origin) ─────────────
JS_API_GET = r"""
async (p) => {
  const r = await fetch(p.url, { credentials: 'include', headers: {
    'x-ig-app-id': p.appid, 'x-asbd-id': p.asbd, 'x-csrftoken': p.csrf,
    'x-requested-with': 'XMLHttpRequest', 'x-ig-www-claim': p.claim,
  }});
  return { status: r.status, text: await r.text() };
}
"""


def _parse_json(text):
    if text.startswith("for (;;);"):
        text = text[len("for (;;);"):]
    return json.loads(text)


def carregar_cookies(path):
    """Lê um JSON de cookies (ex: extensão Cookie-Editor) → formato Playwright."""
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, dict) and "cookies" in raw:
        raw = raw["cookies"]
    ss_map = {"no_restriction": "None", "unspecified": "Lax", "lax": "Lax",
              "strict": "Strict", "none": "None"}
    out = []
    for c in raw:
        ck = {"name": c["name"], "value": c["value"],
              "domain": c.get("domain") or ".instagram.com", "path": c.get("path", "/"),
              "httpOnly": bool(c.get("httpOnly")), "secure": bool(c.get("secure", True)),
              "sameSite": ss_map.get(str(c.get("sameSite", "")).lower(), "Lax")}
        # IMPORTANTE: o Chromium NÃO grava cookies de sessão (sem expires) no
        # disco do perfil persistente — eles somem quando o browser fecha. Como
        # o sessionid vem do celular marcado session:true, forçamos uma expiração
        # futura pra ele PERSISTIR entre a run de import e a de raspagem.
        exp = c.get("expirationDate") or c.get("expires")
        ck["expires"] = int(float(exp)) if exp else int(time.time()) + 400 * 24 * 3600
        out.append(ck)
    return out


class IG:
    def __init__(self):
        self._pw = None
        self.ctx = None
        self.page = None
        self.tokens = {}

    # ───────────────── ciclo de vida ─────────────────
    def abrir(self):
        self._pw = sync_playwright().start()
        kwargs = dict(
            headless=config.HEADLESS, locale=config.LOCALE, user_agent=config.USER_AGENT,
            viewport={"width": 1280, "height": 820},
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )
        if getattr(config, "PROXY", None):
            kwargs["proxy"] = config.PROXY
            log.info("Proxy ativo: %s", config.PROXY.get("server"))
        if getattr(config, "USAR_CHROME_REAL", False):
            kwargs["channel"] = "chrome"
        try:
            self.ctx = self._pw.chromium.launch_persistent_context(config.USER_DATA_DIR, **kwargs)
        except Exception as e:
            if "channel" in kwargs:
                log.warning("Chrome real não encontrado (%s); usando Chromium do Playwright.", e)
                kwargs.pop("channel")
                self.ctx = self._pw.chromium.launch_persistent_context(config.USER_DATA_DIR, **kwargs)
            else:
                raise
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        return self

    def fechar(self):
        try:
            if self.ctx:
                self.ctx.close()
        finally:
            if self._pw:
                self._pw.stop()

    def __enter__(self):
        return self.abrir()

    def __exit__(self, *a):
        self.fechar()

    # ───────────────── navegação / sessão ─────────────────
    def ir(self, url):
        self.page.goto(url, wait_until="domcontentloaded", timeout=60000)
        self.page.wait_for_timeout(1500)

    def _cookies(self):
        try:
            cks = self.ctx.cookies("https://www.instagram.com")
        except Exception:
            cks = self.ctx.cookies()
        return {c["name"]: c["value"] for c in cks}

    def logado(self):
        return bool(self._cookies().get("sessionid"))

    def importar_cookies(self, cookies):
        self.ctx.add_cookies(cookies)
        self.ir("https://www.instagram.com/")
        return self.logado()

    def carregar_tokens(self):
        ck = self._cookies()
        self.tokens["csrf"] = ck.get("csrftoken")
        self.tokens["claim"] = "0"
        return self.tokens

    def _base(self):
        return {"appid": config.IG_APP_ID, "asbd": config.ASBD_ID,
                "csrf": self.tokens.get("csrf"), "claim": self.tokens.get("claim", "0")}

    def _get(self, url, tentativas=4):
        """GET same-origin pela página logada. Retorna dict JSON ou levanta.

        Hoje só serve o perfil_info (a raspagem vai por raspar_perfil_scroll). O IG
        às vezes estrangula (rate-limit) requisições vindas de IP de datacenter — o
        fetch da página rejeita com 'Failed to fetch' ou devolve 429. Em vez de
        abortar a leitura, espera um pouco (backoff crescente) e tenta de novo."""
        ultimo = None
        for i in range(tentativas):
            transitorio = True                                 # 'Failed to fetch'/rede = transitório
            rate_limited = False
            try:
                res = self.page.evaluate(JS_API_GET, {**self._base(), "url": url})
                if res["status"] == 200:
                    return _parse_json(res["text"])
                corpo = res.get("text", "") or ""
                ultimo = RuntimeError(f"HTTP {res['status']} em {url} — corpo: {corpo[:160]}")
                baixo = corpo.lower()
                # IG estrangula IP de datacenter com 401 "Aguarde alguns minutos" +
                # require_login — NÃO é sessão morta, é rate-limit temporário.
                rate_limited = any(s in baixo for s in (
                    "aguarde", "wait a few", "try again", "please wait", "require_login"))
                transitorio = res["status"] in (429, 500, 502, 503) or rate_limited
            except Exception as e:
                ultimo = e
            if not transitorio:                                # erro definitivo: não adianta insistir
                raise ultimo
            if i < tentativas - 1:
                # rate-limit → esperas longas (config); erro de rede → segundos.
                if rate_limited:
                    esp = config.RATE_LIMIT_ESPERAS
                    espera = esp[min(i, len(esp) - 1)]
                else:
                    espera = 8 * (i + 1)
                log.warning("IG estrangulou (%d/%d): %s — pausa %ds e tento de novo",
                            i + 1, tentativas, str(ultimo)[:90], int(espera))
                self.page.wait_for_timeout(int(espera * 1000))
        raise ultimo

    # ───────────────── operações de leitura ─────────────────
    def perfil_info(self, username):
        """user_id + contagem de posts do perfil."""
        url = (f"https://www.instagram.com/api/v1/users/web_profile_info/"
               f"?username={username}")
        data = self._get(url)
        u = (data.get("data") or {}).get("user") or {}
        if not u.get("id"):
            raise RuntimeError(f"Não achei o user_id de @{username}. Perfil existe? Logado?")
        cnt = ((u.get("edge_owner_to_timeline_media") or {}).get("count"))
        return {"user_id": u["id"], "username": u.get("username", username),
                "full_name": u.get("full_name"), "posts": cnt,
                "is_private": u.get("is_private")}

    def baixar_bytes(self, url):
        """Baixa o conteúdo de uma URL usando a sessão do navegador (cookies/headers
        reais). Retorna bytes ou None. Usado p/ baixar as fotos das peças."""
        try:
            resp = self.ctx.request.get(url, timeout=20000)
            if resp.ok:
                return resp.body()
        except Exception:
            return None
        return None

    def feed_pagina(self, user_id, count=None, max_id=None):
        """Uma página da timeline do usuário (REST feed/user).

        Retorna (itens, next_max_id, more_available).

        ⚠️ LEGADO: chamar /feed/user em rajada faz o IG estrangular com 401
        "Aguarde alguns minutos" depois de ~5 páginas. Preferir raspar_perfil_scroll,
        que desce o perfil como humano e não toma bloqueio. Mantido só por referência.
        """
        count = count or config.POSTS_POR_PAGINA
        url = f"https://www.instagram.com/api/v1/feed/user/{user_id}/?count={count}"
        if max_id:
            url += f"&max_id={max_id}"
        data = self._get(url)
        itens = data.get("items", []) or []
        return itens, data.get("next_max_id"), bool(data.get("more_available"))

    def raspar_perfil_scroll(self, username, max_scrolls=None, estavel_max=None, total_alvo=None):
        """Raspa o feed do perfil SCROLLANDO como humano e interceptando as respostas
        XHR (graphql) que a PRÓPRIA página dispara conforme carrega os posts.

        Por que assim: chamar /feed/user na mão é um padrão de "burst" que o IG
        detecta e estrangula (401 depois de ~5 páginas). Já o scroll natural do
        perfil é servido numa boa — dá pra descer o feed inteiro sem bloqueio. Nós
        só COLHEMOS o que o navegador baixou (mesma ideia do Fiddler, por dentro).

        Os nós do GraphQL têm o mesmo shape do REST (code/caption/image_versions2/
        carousel_media/taken_at), então parser.parse_post consome direto.

        Devolve a lista de itens crus (dedup por code, ordem novo→antigo do feed).
        """
        max_scrolls = max_scrolls or config.SCROLL_MAX
        estavel_max = estavel_max or config.SCROLL_ESTAVEL_MAX
        capturados = {}

        def _colher(o):
            if isinstance(o, dict):
                code = o.get("code")
                # nó de post de topo: tem code + caption (carrossel-filho não tem caption própria)
                if code and ("image_versions2" in o or "caption" in o):
                    capturados.setdefault(code, o)
                for v in o.values():
                    _colher(v)
            elif isinstance(o, list):
                for v in o:
                    _colher(v)

        def _on_response(resp):
            u = resp.url
            if "instagram.com" not in u or "graphql" not in u:
                return
            try:
                _colher(resp.json())
            except Exception:
                pass

        self.page.on("response", _on_response)
        try:
            self.ir(f"https://www.instagram.com/{username}/")
            estavel = ult = 0
            for i in range(max_scrolls):
                self.page.mouse.wheel(0, random.randint(3000, 6000))
                self.page.wait_for_timeout(int(random.uniform(*config.SCROLL_PAUSA_MS)))
                n = len(capturados)
                if n > ult:                        # só loga quando chegou lote novo
                    log.info("+%d posts (total: %d)", n - ult, n)
                    # marker de progresso pro backend/app (linha PURA, sem prefixo de log)
                    if total_alvo:
                        print(f"[progress] {min(n, total_alvo)} {total_alvo} descendo o feed", flush=True)
                    estavel = 0
                else:
                    estavel += 1                   # scroll sem novidade (carregando/fim)
                ult = n
                if estavel >= estavel_max:
                    log.info("Feed estabilizou em %d posts — fim do perfil.", n)
                    break
        finally:
            try:
                self.page.remove_listener("response", _on_response)
            except Exception:
                pass
        return list(capturados.values())
