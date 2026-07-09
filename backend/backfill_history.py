"""
Backfill do histórico a partir do run.log do scraper — converte as raspagens já
rodadas (o bloco de resumo) em registros JSON. Idempotente (não duplica).

Rode UMA vez por ambiente (local e/ou no server):
    python backfill_history.py
"""
import io
import re
from datetime import datetime

import history
import scraper

_TS = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")
# prefixo do log: "2026-07-08 12:03:30  INFO   " → precisa tirar antes de pegar números,
# senão a data (2026, -07, -08…) polui a extração.
_PREFIXO = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s+\w+\s+")


def _nums(linha):
    msg = _PREFIXO.sub("", linha)
    return [int(x) for x in re.findall(r"-?\d+", msg)]


def main():
    log = scraper.worker_dir() / "output" / "run.log"
    if not log.exists():
        print("sem run.log — nada pra importar")
        return
    linhas = io.open(log, encoding="utf-8", errors="replace").read().splitlines()
    existentes = {r.get("id") for r in history.listar(limite=1000000)}
    n = 0
    for i, l in enumerate(linhas):
        low = l.lower()
        if "vendidas:" not in low or ("novas:" not in low):   # linha "novas: N | atualizadas: N | recém-vendidas: N"
            continue
        m = _TS.match(l)
        if not m:
            continue
        ended = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").timestamp()
        rid = f"bf-brecho-{int(ended)}"
        if rid in existentes:
            continue
        nv = _nums(l)                    # [novas, atualizadas, recem_vendidas]
        saldo = {}
        if len(nv) >= 3:
            saldo.update(novas=nv[0], atualizadas=nv[1], recem_vendidas=nv[2])
        # procura a linha "peças: N | vendidas: N | disponíveis: N" logo abaixo
        for j in range(i + 1, min(i + 8, len(linhas))):
            lj = linhas[j].lower()
            if "peças:" in lj and "disponíveis" in lj:
                pv = _nums(linhas[j])
                if len(pv) >= 3:
                    saldo.update(total=pv[0], vendidas=pv[1], disponiveis=pv[2])
                break
        trecho = "\n".join(linhas[max(0, i - 40):i]).lower()
        bloqueio = "bloqueio" in trecho or "⛔" in trecho
        if "erro fatal" in trecho or "erro inesperado" in trecho:
            status = "erro"
        elif "interrompido" in trecho:
            status = "parado"
        else:
            status = "finalizado"
        history.registrar({
            "id": rid, "bot": "brecho", "dry_run": False,
            "started_at": None, "ended_at": ended, "duracao_s": None,
            "status": status, "bloqueio": bloqueio, "saldo": saldo, "backfill": True,
        })
        existentes.add(rid)
        n += 1
    print(f"backfill: {n} raspagens importadas")


if __name__ == "__main__":
    main()
