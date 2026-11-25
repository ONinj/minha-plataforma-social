// Armazenamento local no navegador (IndexedDB): dados da plataforma e arquivos de mídia.
const NOME_BANCO = "plataforma-social";
const LOJA = "kv";

let bancoPromessa: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!bancoPromessa) {
    bancoPromessa = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOME_BANCO, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return bancoPromessa;
}

async function operar<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest): Promise<T> {
  const banco = await abrir();
  return new Promise((resolve, reject) => {
    const tx = banco.transaction(LOJA, modo);
    const req = fn(tx.objectStore(LOJA));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  ler: <T>(chave: string) => operar<T | undefined>("readonly", (l) => l.get(chave)),
  gravar: (chave: string, valor: unknown) => operar<void>("readwrite", (l) => l.put(valor, chave)),
  apagar: (chave: string) => operar<void>("readwrite", (l) => l.delete(chave)),
};
