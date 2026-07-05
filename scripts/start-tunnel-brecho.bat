@echo off
REM ============================================================
REM  Tunel SSH reverso: faz o servidor Oracle sair pela internet
REM  RESIDENCIAL deste PC (IP de casa), pro Instagram nao pegar
REM  o rate-limit de datacenter. Deixe esta janela ABERTA.
REM  Reconecta sozinho se a conexao cair.
REM ============================================================
setlocal
set KEY=C:\Users\vinim\.ssh\private_oracle_quase_nada_server1.key
set SERVER=ubuntu@147.15.7.119

echo.
echo  Tunel residencial Quase Nada  ^|  proxy no servidor: 127.0.0.1:1080
echo  Servidor: %SERVER%
echo  (Ctrl+C para encerrar)
echo.

:loop
echo [%date% %time%] conectando o tunel...
ssh -N -R 1080 -i "%KEY%" -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 %SERVER%
echo [%date% %time%] tunel caiu. Reconectando em 5s... (Ctrl+C para sair)
REM ping em vez de timeout (timeout falha em janela escondida)
ping -n 6 127.0.0.1 >nul
goto loop
