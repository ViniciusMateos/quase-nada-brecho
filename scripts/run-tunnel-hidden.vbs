' Lanca o tunel SSH reverso SEM janela visivel (roda escondido no fundo).
' Usado pela Tarefa Agendada que sobe no logon do Windows.
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run """C:\estudassao\quasenada-softwarehouse\projetos\quase-nada-brecho\scripts\start-tunnel-brecho.bat""", 0, False
