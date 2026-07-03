import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Redimensiona a foto pra no máx 1080px de largura e comprime — deixa o arquivo
// bem menor (upload e carregamento MUITO mais rápidos, principalmente via túnel).
export async function prepararFoto(uri: string): Promise<string> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: 1080 });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri; // se falhar, sobe a original mesmo
  }
}

export function formDaFoto(uri: string): FormData {
  const form = new FormData();
  const nome = (uri.split('/').pop() || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
  form.append('file', { uri, name: nome, type: 'image/jpeg' } as unknown as Blob);
  return form;
}

// resize + form, prontinho pro uploadImagem
export async function fotoParaUpload(uri: string): Promise<FormData> {
  const menor = await prepararFoto(uri);
  return formDaFoto(menor);
}
