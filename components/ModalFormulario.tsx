"use client";

import { useState } from "react";

type Campo = {
  nome: string;
  rotulo: string;
  placeholder?: string;
  tipo?: "text" | "email" | "checkbox" | "textarea";
  padrao?: string;
};

/** Janela simples com um formulário (usada para criar contas, perfis, ideias...). */
export default function ModalFormulario({
  titulo,
  descricao,
  campos,
  rotuloSalvar = "Salvar",
  aoSalvar,
  aoFechar,
}: {
  titulo: string;
  descricao?: string;
  campos: Campo[];
  rotuloSalvar?: string;
  aoSalvar: (valores: Record<string, string>) => void;
  aoFechar: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(campos.map((c) => [c.nome, c.padrao ?? ""])),
  );
  const mudar = (nome: string, v: string) => setValores((s) => ({ ...s, [nome]: v }));

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <form
        className="modal"
        style={{ width: "min(480px, 100%)" }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.trim()])));
          aoFechar();
        }}
      >
        <h3>{titulo}</h3>
        {descricao && <p className="ajuda" style={{ marginTop: -4 }}>{descricao}</p>}
        {campos.map((c, i) =>
          c.tipo === "checkbox" ? (
            <label key={c.nome} className="linha" style={{ marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={valores[c.nome] === "sim"} onChange={(e) => mudar(c.nome, e.target.checked ? "sim" : "")} />
              {c.rotulo}
            </label>
          ) : (
            <div key={c.nome} className="campo">
              <label>{c.rotulo}</label>
              {c.tipo === "textarea" ? (
                <textarea rows={4} autoFocus={i === 0} value={valores[c.nome]} placeholder={c.placeholder} onChange={(e) => mudar(c.nome, e.target.value)} />
              ) : (
                <input
                  type={c.tipo ?? "text"}
                  autoFocus={i === 0}
                  value={valores[c.nome]}
                  placeholder={c.placeholder}
                  onChange={(e) => mudar(c.nome, e.target.value)}
                />
              )}
            </div>
          ),
        )}
        <div className="linha" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="botao sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao">
            {rotuloSalvar}
          </button>
        </div>
      </form>
    </div>
  );
}
