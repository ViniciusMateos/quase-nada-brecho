# Proxy residencial via túnel SSH reverso (IP de casa, grátis)

O Instagram estrangula (rate-limit / "Aguarde alguns minutos") requisições vindas do
**IP de datacenter** da Oracle. A solução é fazer o servidor **sair pela internet
residencial do Vinicius** — sem proxy pago, sem IP fixo, sem abrir porta no roteador.

Serve pra **todos os bots que falam com o Instagram**: o scraper do brechó **e** os
bots do `quase-nada-bots` (DM, autolikes). Todos apontam pro mesmo proxy no servidor.

---

## Como funciona

```
  PC de casa (200.148.45.108, residencial)                Servidor Oracle (147.15.7.119, datacenter)
  ────────────────────────────────────────                ───────────────────────────────────────────
  ssh -N -R 1080  ───────(conexão de saída)──────────────▶  cria SOCKS5 em 127.0.0.1:1080
        ▲                                                          │
        │  o tráfego do proxy volta pelo túnel                     │  worker usa proxy 127.0.0.1:1080
        └──────────── e SAI pela internet de casa ◀───────────────┘
                                   │
                                   ▼
                            Instagram vê 200.148.45.108 (residencial) ✅
```

O `ssh -R 1080` (OpenSSH 7.6+) cria um **SOCKS5 no servidor** cujo tráfego é tunelado
de volta e sai pela conexão do PC de casa. Como o PC inicia a conexão (saída), **não
precisa** de IP fixo nem port-forward no roteador.

---

## Passo a passo

### 1. Ligar o túnel (no PC de casa, sempre que for rodar)

Rode isto no PC (Git Bash ou PowerShell) e **deixe a janela aberta**:

```bash
ssh -N -R 1080 \
  -i "C:/Users/vinim/.ssh/private_oracle_quase_nada_server1.key" \
  -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  ubuntu@147.15.7.119
```

Ou use o atalho `scripts/start-tunnel-brecho.bat` (reconecta sozinho se cair).

### 2. Conferir que subiu (do servidor)

```bash
# deve devolver 200.148.45.108 (casa), não 147.15.7.119 (datacenter)
curl -s --socks5-hostname 127.0.0.1:1080 https://api.ipify.org
```

### 3. Apontar o worker pro proxy (já feito no servidor)

Arquivo `workers/brecho-tracker/proxy.json`:

```json
{ "enabled": true, "server": "socks5://127.0.0.1:1080" }
```

Pra **desligar** o proxy (voltar a sair pelo datacenter): `"enabled": false` ou apagar o arquivo.

### 4. Rodar o scraper normalmente

Pelo app (Sincronizar) ou no servidor:

```bash
cd ~/quase_nada_brecho/workers/brecho-tracker
source ~/quase_nada_brecho/venv/bin/activate
python3 main.py --dry-run     # teste (não altera nada)
python3 main.py               # raspagem real
```

---

## Estender pros bots do quase-nada-bots

Os bots de DM/autolikes também devem sair pelo IP de casa. Como o SOCKS `127.0.0.1:1080`
é **compartilhado** no servidor, basta cada worker do `quase-nada-bots` usar o mesmo proxy:

- Se usam Playwright: `proxy={"server": "socks5://127.0.0.1:1080"}`
- Se usam requests/httpx: `proxies={"https": "socks5://127.0.0.1:1080"}` (precisa `pip install "httpx[socks]"` ou `requests[socks]`)

Um túnel só serve todos. Banda somada é baixíssima (JSON + thumbs cacheadas).

---

## Manter de pé pra runs agendadas (cron)

Se o scraper roda por agendamento no servidor, o túnel precisa estar **no ar naquele
horário**. Opções:

- **Sob demanda:** liga o túnel no PC só quando for disparar a raspagem (mais simples).
- **Persistente:** deixa o `start-tunnel-brecho.bat` rodando no PC (reconecta sozinho),
  ou agenda ele no Agendador de Tarefas do Windows pra subir no logon.

> Regra de ouro: **sem túnel no ar, o proxy `1080` não responde** e o worker vai falhar
> a conexão. Nesse caso, ou liga o túnel, ou põe `"enabled": false` no `proxy.json` pra
> sair pelo datacenter (aceitando o rate-limit).
