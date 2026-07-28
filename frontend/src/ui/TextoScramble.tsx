import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { embaralhar } from '@/i18n';

const DURACAO = 460;
const PASSO = 32;

/**
 * Texto que, quando `ativo`, aplica a transição de embaralhar (a mesma da troca de
 * idioma) SEMPRE que o texto muda — letras embaralham e vão se resolvendo da esquerda
 * pra direita. Usado na CATEGORIA da peça: ao terminar a 1ª palavra do nome (o espaço),
 * a categoria muda e anima; e na troca global de idioma também anima. Se `ativo=false`
 * (ou o texto não mudou), mostra o texto direto, custo zero. Não anima na 1ª montagem.
 */
export function TextoScramble({ text, ativo, style, numberOfLines }:
  { text: string; ativo: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const [render, setRender] = useState(text);
  const prev = useRef(text);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (prev.current === text) return;   // sem mudança → nada
    prev.current = text;
    if (!ativo) { setRender(text); return; }   // idioma PT → sem animação

    if (timerRef.current) clearInterval(timerRef.current);
    const fim = Date.now() + DURACAO;
    const id = setInterval(() => {
      const restante = fim - Date.now();
      if (restante <= 0) { setRender(text); clearInterval(id); if (timerRef.current === id) timerRef.current = null; return; }
      setRender(embaralhar(text, 1 - restante / DURACAO));
    }, PASSO);
    timerRef.current = id;
    return () => clearInterval(id);
  }, [text, ativo]);

  return <Text style={style} numberOfLines={numberOfLines}>{render}</Text>;
}
