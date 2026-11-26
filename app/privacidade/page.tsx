import PaginaTexto from "@/components/PaginaTexto";

export const metadata = { title: "Política de privacidade · Galhos" };

const contato = process.env.NEXT_PUBLIC_EMAIL_CONTATO || "o canal de atendimento informado na plataforma";

export default function Privacidade() {
  return (
    <PaginaTexto titulo="Política de privacidade">
      <p>Última atualização: novembro de 2026.</p>
      <h3>O que é a Galhos</h3>
      <p>
        A Galhos é uma plataforma para planejar, criar e publicar conteúdo em redes sociais com ajuda de inteligência
        artificial. Esta política explica quais dados usamos e por quê.
      </p>
      <h3>Dados que coletamos</h3>
      <ul>
        <li>Dados da conta: e-mail usado no login e nome da conta.</li>
        <li>Conteúdo que você cria ou envia: textos, conversas com a IA, imagens, vídeos, aprovações e calendário.</li>
        <li>Dados de cobrança: nome e CPF/CNPJ, enviados ao processador de pagamentos (Asaas) para emitir as cobranças.</li>
        <li>
          Instagram: quando você conecta uma conta profissional, recebemos o identificador e o nome de usuário da conta e um
          token de acesso, guardado de forma criptografada. Usamos esse acesso somente para publicar os conteúdos que você
          aprovou e agendou, nas datas escolhidas por você.
        </li>
      </ul>
      <h3>Como usamos</h3>
      <ul>
        <li>Para gerar textos, imagens e vídeos pelos provedores de IA (Anthropic e fal.ai), que recebem o conteúdo dos pedidos.</li>
        <li>Para publicar no Instagram o que você agendou.</li>
        <li>Para cobrar o plano e controlar os créditos.</li>
      </ul>
      <p>Não vendemos seus dados e não usamos o acesso ao Instagram para nada além de publicar o que você pediu.</p>
      <h3>Onde ficam</h3>
      <p>Os dados ficam em servidores do Supabase e da Vercel. Os arquivos ficam em armazenamento privado, acessível só pela sua conta.</p>
      <h3>Seus direitos</h3>
      <p>
        Você pode desconectar o Instagram a qualquer momento em Perfis e redes, e pedir a exclusão da sua conta e dos seus dados
        (veja a página <a href="/exclusao-de-dados">Exclusão de dados</a>). Para dúvidas, fale conosco por {contato}.
      </p>
    </PaginaTexto>
  );
}
