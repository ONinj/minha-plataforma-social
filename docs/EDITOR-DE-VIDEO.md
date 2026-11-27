# Editor de vídeo

Aba **Editor de vídeo** (menu Criar). Não precisa configurar nada.

## Como funciona
1. **Escolha o vídeo**: um que já está em Mídias/Biblioteca ou **Enviar vídeo bruto** (gravado no celular).
2. **Diga o que quer** (ou toque numa sugestão): "reels de 30 s com legenda", "só tirar silêncios e erros"...
3. **Analisar com o Claude**: a plataforma transcreve a fala com o tempo de cada palavra e o Claude olha algumas imagens
   do vídeo, o guia da marca e o calendário. Ele devolve o **plano de edição**: trechos que ficam (tira silêncios,
   "ééé", repetições), legendas nas cores da marca, até 3 textos na tela (gancho e chamada), logo, formato e
   **onde o vídeo entra no planejamento**, com legenda do post, hashtags e data sugerida.
4. Ajuste o que quiser (trechos, cores, posição, tamanho, textos, logo, formato) e clique em **Montar o vídeo**.
5. **Enviar para aprovação**, **Só salvar em Mídias** ou **Baixar**.

## Custos
- Transcrição: centavos por minuto de vídeo. Plano do Claude: poucos créditos por vídeo.
- A montagem acontece no navegador da pessoa: não gasta créditos.

## Limites (primeira versão)
- A montagem é feita **quadro a quadro** (WebCodecs, biblioteca Mediabunny): não perde quadros, respeita a rotação
  do celular e costuma ser mais rápida que o tempo do vídeo. Não feche a aba enquanto monta.
- Sai em **MP4 (H.264)**. Em navegadores sem esse recurso, o editor grava a reprodução (mais lento; pode sair em WebM).
- Sem efeitos e transições elaborados, correção de cor ou músicas da biblioteca do Instagram.
- O logo vem da pasta **Identidade visual** da Biblioteca (o questionário do perfil já salva lá).
- Vídeos de celular em HEVC só abrem em navegadores que tocam HEVC (Chrome e Safari recentes).
