@echo off
REM ============================================================
REM  Tunel SSH reverso #2 (porta 1081) — canal DEDICADO do
REM  dm-followers. O auto-follow usa o :1080 (start-tunnel-brecho.bat)
REM  e o dm-followers usa este :1081, pra os dois bots NAO disputarem
REM  o mesmo canal SSH (a Opcao A). Reconecta sozinho se cair.
REM ============================================================
setlocal
set KEY=C:\Users\vinim\.ssh\private_oracle_quase_nada_server1.key
set SERVER=ubuntu@147.15.7.119

echo.
echo  Tunel residencial Quase Nada #2  ^|  proxy no servidor: 127.0.0.1:1081
echo  Servidor: %SERVER%
echo  (Ctrl+C para encerrar)
echo.

:loop
echo [%date% %time%] conectando o tunel 1081...
ssh -N -R 1081 -i "%KEY%" -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 %SERVER%
echo [%date% %time%] tunel 1081 caiu. Reconectando em 5s... (Ctrl+C para sair)
ping -n 6 127.0.0.1 >nul
goto loop
