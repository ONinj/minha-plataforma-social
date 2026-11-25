# Central Social

Plataforma para social medias gerenciarem vários perfis com IA num lugar só. Organização: **contas** (a pessoa ou agência, com as próprias chaves e gastos) → **perfis** (cada marca/cliente, com conversas, mídias, aprovações e calendário próprios).

Ferramentas:

- **Central (Gerente):** você conversa só com o Claude. Ele planeja, escreve os prompts, manda o Gemini criar as imagens e o Veo/Seedance gerar os vídeos, revisa o resultado e coloca tudo em **Aprovações**.
- **Claude, Gemini, Veo e Seedance:** uma aba para usar cada IA diretamente.
- **Aprovações:** você aprova, pede ajuste (que volta para o gerente) ou reprova cada peça.
- **Agendamentos:** calendário próprio com o que está *a programar*, *programado*, *postado* ou *cancelado*. Não depende do Metricool.
- **Mídias:** biblioteca com todas as imagens e vídeos (dá para enviar os seus também).
- **Gasto estimado do mês** em reais, no canto da tela, e confirmação antes de gerar qualquer vídeo.

## Como usar

1. Abra a plataforma e vá em **Configurações**.
2. Cole as chaves:
   - **Anthropic (Claude):** console.anthropic.com → API Keys
   - **fal.ai (imagens Nano Banana 2, Veo e Seedance):** fal.ai → Keys
3. Clique em **Testar Claude**.
4. Em **Perfis e redes**, dê nome ao perfil e preencha a descrição (nicho, público, tom de voz, cores).
5. Vá para a **Central** e peça, por exemplo: *"Monte o planejamento de dezembro para o meu Instagram"*.

## Onde ficam os dados

Tudo (chaves, conversas, mídias, agendamentos) fica salvo **no navegador** em que você usa a plataforma (IndexedDB). As chaves só são enviadas para as APIs das próprias empresas, passando pelo servidor da plataforma, que não guarda nada.

- Cada navegador/aparelho tem os próprios dados (o celular não vê o que está no computador).
- Use **Configurações → Baixar backup** de vez em quando.
- Não use em computador compartilhado.

## Rodar no computador

Precisa do Node.js 20 ou mais novo.

```bash
npm install
npm run build
npm start
```

Depois abra http://localhost:3000.

## Colocar na internet (Vercel, grátis para uso pessoal)

1. Entre em vercel.com com a sua conta do GitHub.
2. **Add New → Project**, escolha o repositório `minha-plataforma-social` e clique em **Deploy**. Não precisa configurar nada.
3. A Vercel dá um endereço (ex.: `minha-plataforma-social.vercel.app`). Abra e cadastre as chaves.

Como as chaves ficam no navegador, qualquer pessoa que descobrir o endereço vê só uma plataforma vazia, sem as suas chaves nem os seus dados.

## Estrutura

- `app/api/*`: rotas que repassam os pedidos para o Claude e o fal.ai (imagens, Veo e Seedance).
- `lib/gerente.ts`: o gerente, com as instruções do Claude e as ferramentas que ele usa para acionar as outras IAs.
- `lib/servicos.ts`: chamadas às IAs, geração de imagem/vídeo e acompanhamento dos vídeos.
- `lib/store.tsx` e `lib/db.ts`: estado da plataforma salvo no navegador.
- `components/abas/*`: as telas.
