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
import sys

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
        exp = c.get("expirationDate") or c.get("expires")
        if exp and not c.get("session"):
            ck["expires"] = int(float(exp))
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
            log.info("🌐 Proxy ativo: %s", config.PROXY.get("server"))
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

    def _get(self, url):
        """GET same-origin pela página logada. Retorna dict JSON ou levanta."""
        res = self.page.evaluate(JS_API_GET, {**self._base(), "url": url})
        if res["status"] != 200:
            raise RuntimeError(f"HTTP {res['status']} em {url} — corpo: {res['text'][:160]}")
        return _parse_json(res["text"])

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
        """
        count = count or config.POSTS_POR_PAGINA
        url = f"https://www.instagram.com/api/v1/feed/user/{user_id}/?count={count}"
        if max_id:
            url += f"&max_id={max_id}"
        data = self._get(url)
        itens = data.get("items", []) or []
        return itens, data.get("next_max_id"), bool(data.get("more_available"))
