import PaginaTexto from "@/components/PaginaTexto";

export const metadata = { title: "Termos de uso · Galhos" };

const contato = process.env.NEXT_PUBLIC_EMAIL_CONTATO || "o canal de atendimento informado na plataforma";
const empresa = process.env.NEXT_PUBLIC_EMPRESA || "Galhos";

export default function Termos() {
  return (
    <PaginaTexto titulo="Termos de uso">
      <p>Última atualização: novembro de 2026.</p>
      <p>
        Estes termos valem para o uso da plataforma Galhos, oferecida por {empresa}. Ao criar uma conta ou usar a
        plataforma, você concorda com eles e com a <a href="/privacidade">Política de privacidade</a>.
      </p>

      <h3>1. O serviço</h3>
      <p>
        A Galhos ajuda a planejar, criar, organizar e publicar conteúdo para redes sociais com ajuda de inteligência
        artificial (IA). Os textos, imagens e vídeos são gerados por provedores de IA (como Anthropic e fal.ai) a partir dos
        seus pedidos.
      </p>

      <h3>2. Sua conta</h3>
      <ul>
        <li>Você precisa ter 18 anos ou mais e informar um e-mail válido.</li>
        <li>Você é responsável por manter sua senha em segurança e por tudo o que for feito na sua conta.</li>
        <li>O teste grátis é um por pessoa. Contas criadas só para repetir o teste podem ser encerradas.</li>
      </ul>

      <h3>3. Planos, créditos e pagamento</h3>
      <ul>
        <li>
          Cada plano traz uma quantidade de créditos por mês. Cada ação de IA usa créditos conforme o custo real dela, e o valor
          dos vídeos aparece antes de gerar.
        </li>
        <li>
          Créditos não são dinheiro: não podem ser trocados por dinheiro, transferidos para outra conta nem reembolsados,
          salvo o previsto no item 4.
        </li>
        <li>
          Na renovação, parte dos créditos do plano que sobraram passa para o mês seguinte, conforme o limite do seu plano; o
          restante expira. Créditos de recarga não expiram enquanto a conta estiver ativa.
        </li>
        <li>
          A cobrança é mensal e recorrente, feita pelo Asaas (Pix, boleto ou cartão). Se o pagamento atrasar, o uso das IAs fica
          pausado até a regularização.
        </li>
        <li>Os preços podem mudar. Avisaremos com pelo menos 30 dias de antecedência; quem já assina mantém o valor até trocar de plano.</li>
      </ul>

      <h3>4. Cancelamento e direito de arrependimento</h3>
      <ul>
        <li>Você pode cancelar a assinatura a qualquer momento, sem multa, em Plano e créditos. As próximas cobranças param.</li>
        <li>Os créditos que sobraram continuam valendo até acabar.</li>
        <li>
          Na primeira contratação, você pode desistir em até 7 dias, como prevê o artigo 49 do Código de Defesa do
          Consumidor. Peça pelo {contato}.
        </li>
      </ul>

      <h3>5. O que não é permitido</h3>
      <ul>
        <li>Criar ou publicar conteúdo ilegal, de ódio, violento, sexual envolvendo menores, enganoso ou que viole direitos de terceiros.</li>
        <li>Usar marcas, obras ou a imagem e a voz de pessoas sem autorização, ou criar conteúdo que finja ser outra pessoa.</li>
        <li>Enviar spam ou usar a plataforma para fraude.</li>
        <li>Tentar burlar os créditos, os limites dos planos ou a segurança da plataforma, ou acessar dados de outras contas.</li>
      </ul>
      <p>
        Os provedores de IA também têm regras próprias e podem recusar alguns pedidos. Contas que descumprirem estes termos
        podem ser suspensas ou encerradas.
      </p>

      <h3>6. Conteúdo gerado por IA</h3>
      <ul>
        <li>
          A IA pode errar: textos dentro de imagens, detalhes de logos, rostos e produtos podem sair diferentes do esperado.
          Por isso tudo passa pela sua aprovação.
        </li>
        <li>Você é responsável por revisar e pelo que decide publicar.</li>
        <li>
          Você pode usar o conteúdo criado para você e seus clientes, inclusive com fins comerciais, respeitando a lei e as
          regras dos provedores de IA. Não garantimos que um conteúdo seja exclusivo, porque outras pessoas podem gerar algo
          parecido.
        </li>
        <li>O que você envia (fotos, vídeos, manuais) continua sendo seu. Você garante que tem o direito de usar esse material.</li>
      </ul>

      <h3>7. Publicação automática</h3>
      <p>
        A publicação automática depende de serviços de terceiros (como Instagram e Metricool). Mudanças, limites ou falhas
        desses serviços podem atrasar ou impedir publicações. Você pode acompanhar a situação de cada publicação no Calendário.
      </p>

      <h3>8. Disponibilidade e responsabilidade</h3>
      <ul>
        <li>Trabalhamos para manter a plataforma no ar, mas podem acontecer interrupções e manutenções.</li>
        <li>
          Não respondemos por resultados de vendas ou de engajamento, nem por prejuízos causados por conteúdo publicado sem
          revisão. Nossa responsabilidade se limita ao valor pago nos últimos 3 meses, exceto quando a lei determinar outra coisa.
        </li>
      </ul>

      <h3>9. Dados pessoais</h3>
      <p>
        Tratamos os seus dados conforme a Lei Geral de Proteção de Dados (LGPD), como explicado na{" "}
        <a href="/privacidade">Política de privacidade</a>. Para pedir a exclusão dos seus dados, veja{" "}
        <a href="/exclusao-de-dados">Exclusão de dados</a>.
      </p>

      <h3>10. Mudanças nestes termos</h3>
      <p>Podemos atualizar estes termos. Mudanças importantes serão avisadas na plataforma ou por e-mail.</p>

      <h3>11. Contato e foro</h3>
      <p>
        Dúvidas: {contato}. Fica eleito o foro do domicílio do consumidor para resolver qualquer questão sobre estes termos.
      </p>
    </PaginaTexto>
  );
}
