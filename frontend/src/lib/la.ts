import { api } from '@/lib/api';
import { env } from '@/config/env';
import { aoReceberTokenLA, iniciarLiveActivity } from '../../modules/live-activity';

/**
 * Inicia a Live Activity de uma run e entrega o push token ao server assim que ele chegar
 * (~1-3s depois). A partir daí é o SERVER que empurra os updates via APNs — a barra viva
 * atualiza no lock screen / Dynamic Island mesmo com o app fechado. No-op no Expo Go /
 * Android. Chame logo depois de criar a run. `titulo` = nome do processo (ex: "Raspando o
 * brechó", "Conectando Instagram").
 */
export async function iniciarLAparaRun(runId: string, titulo: string): Promise<void> {
  try {
    const parar = aoReceberTokenLA((token) => {
      // manda o bundle deste build junto: o server usa como tópico do APNs, então
      // dev (.dev) e preview (.preview) funcionam ao mesmo tempo, cada um no seu.
      api.setLiveActivity(runId, token, env.bundleId).catch(() => { /* best-effort */ });
    });
    setTimeout(parar, 45000);   // para de escutar depois (o token já chegou muito antes)
    await iniciarLiveActivity(titulo, 0);   // total 0 = mostra "começando" até metrificar
  } catch { /* sem LA — segue de boa */ }
}
