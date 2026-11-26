import PaginaTexto from "@/components/PaginaTexto";

export const metadata = { title: "Exclusão de dados · Galhos" };

const contato = process.env.NEXT_PUBLIC_EMAIL_CONTATO || "o canal de atendimento informado na plataforma";

export default function ExclusaoDeDados() {
  return (
    <PaginaTexto titulo="Como excluir seus dados">
      <h3>Desconectar o Instagram</h3>
      <ol>
        <li>Entre na Galhos e abra Perfis e redes.</li>
        <li>No cartão “Publicação automática no Instagram”, clique em Desconectar. O token de acesso é apagado na hora.</li>
        <li>
          Se quiser, remova também o acesso pelo próprio Instagram: Configurações → Segurança → Apps e sites → remova a Central
          Social.
        </li>
      </ol>
      <h3>Excluir a conta e todos os dados</h3>
      <p>
        Peça a exclusão por {contato}, usando o mesmo e-mail da sua conta. Em até 30 dias apagamos a conta, os perfis, as
        conversas, os arquivos e as conexões com redes sociais. Os registros de cobrança podem ser mantidos pelo prazo exigido
        por lei.
      </p>
    </PaginaTexto>
  );
}
