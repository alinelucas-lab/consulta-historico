import { NextResponse } from "next/server";
import { sfQuery } from "@/lib/salesforce";

// Mesmas regras que você usa hoje nas consultas manuais.
const STAGES = [
  "Aprovada",
  "Aprovada Parcial",
  "Pag. Parcial",
  "Mod.Online-Presencial",
  "Mod.Presencial-Online",
];
const TIPOS_EXCLUIR = ["27", "141", "135", "35", "89"];

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const lista = (itens: string[]) => itens.map((v) => `'${esc(v)}'`).join(", ");

const REGRAS = `StageName IN (${lista(STAGES)})
  AND Tipo_de_Matricula__c NOT IN (${lista(TIPOS_EXCLUIR)})`;

type Oportunidade = {
  AccountId?: string | null;
  Account?: { Name: string } | null;
  QuantidadePessoas__c?: number | null;
  Turma__r?: { Name: string } | null;
  C_digo_do_Curso__c?: string | null;
};
type Conta = { Id: string; Name: string };

function filtroCurso(curso: string, variacoes: boolean, turma?: string) {
  const campo = variacoes
    ? `C_digo_do_Curso__c LIKE '${esc(curso)}%'`
    : `C_digo_do_Curso__c = '${esc(curso)}'`;
  return `${REGRAS} AND ${campo}${turma ? ` AND Turma__r.Name = '${esc(turma)}'` : ""}`;
}

async function carregarOpcoes() {
  const [cursosBrutos, turmasBrutas] = await Promise.all([
    sfQuery<{ C_digo_do_Curso__c: string }>(
      `SELECT C_digo_do_Curso__c FROM Opportunity
       WHERE ${REGRAS} AND C_digo_do_Curso__c != null
       LIMIT 5000`
    ),
    sfQuery<{ Turma__r?: { Name: string } | null }>(
      `SELECT Turma__r.Name FROM Opportunity
       WHERE ${REGRAS} AND Turma__c != null
       LIMIT 5000`
    ),
  ]);

  const cursos = [...new Set(cursosBrutos.map((r) => r.C_digo_do_Curso__c).filter(Boolean))].sort();
  const turmas = [...new Set(turmasBrutas.map((r) => r.Turma__r?.Name).filter(Boolean) as string[])].sort();
  return { cursos, turmas };
}

async function analisar(params: {
  curso: string;
  turma: string;
  comparacao: string;
  turmaComparacao: string;
  variacoes: boolean;
}) {
  const { curso, turma, comparacao, turmaComparacao, variacoes } = params;
  const base = filtroCurso(curso, false, turma || undefined);
  const comp = filtroCurso(comparacao, variacoes, turmaComparacao || undefined);

  const [linhas, jaFez, primeira] = await Promise.all([
    sfQuery<Oportunidade>(
      `SELECT AccountId, Account.Name, QuantidadePessoas__c, Turma__r.Name, C_digo_do_Curso__c
       FROM Opportunity WHERE ${base}`
    ),
    sfQuery<Conta>(
      `SELECT Id, Name FROM Account
       WHERE Id IN (SELECT AccountId FROM Opportunity WHERE ${base})
         AND Id IN (SELECT AccountId FROM Opportunity WHERE ${comp})`
    ),
    sfQuery<Conta>(
      `SELECT Id, Name FROM Account
       WHERE Id IN (SELECT AccountId FROM Opportunity WHERE ${base})
         AND Id NOT IN (SELECT AccountId FROM Opportunity
                        WHERE ${REGRAS} AND C_digo_do_Curso__c != '${esc(curso)}')`
    ),
  ]);

  const pessoasPorConta = new Map<string, number>();
  const nomePorConta = new Map<string, string>();
  for (const l of linhas) {
    if (!l.AccountId) continue;
    pessoasPorConta.set(l.AccountId, (pessoasPorConta.get(l.AccountId) ?? 0) + (l.QuantidadePessoas__c ?? 0));
    if (l.Account?.Name) nomePorConta.set(l.AccountId, l.Account.Name);
  }

  const totalPessoas = linhas.reduce((s, l) => s + (l.QuantidadePessoas__c ?? 0), 0);
  const totalContas = pessoasPorConta.size;

  const jaFezIds = new Set(jaFez.map((c) => c.Id));
  jaFez.forEach((c) => nomePorConta.set(c.Id, c.Name));
  primeira.forEach((c) => nomePorConta.set(c.Id, c.Name));

  const primeiraIds = new Set(primeira.map((c) => c.Id));
  const somaPessoas = (ids: Set<string>) =>
    [...ids].reduce((s, id) => s + (pessoasPorConta.get(id) ?? 0), 0);

  const pessoasComparacao = somaPessoas(jaFezIds);
  const pessoasPrimeira = somaPessoas(primeiraIds);
  const contasComparacao = jaFezIds.size;
  const contasPrimeira = primeiraIds.size;

  // "Outros cursos" = quem não caiu nas duas faixas acima.
  const outrosIds = new Set<string>();
  for (const [id, pessoas] of pessoasPorConta) {
    if (pessoas > 0 && !jaFezIds.has(id) && !primeiraIds.has(id)) outrosIds.add(id);
  }
  const pessoasOutros = Math.max(0, totalPessoas - pessoasComparacao - pessoasPrimeira);
  const contasOutros = Math.max(0, totalContas - contasComparacao - contasPrimeira);

  const pct = (n: number) => (totalPessoas ? Math.round((n / totalPessoas) * 1000) / 10 : 0);

  const faixa = (chave: string, titulo: string, pessoas: number, contas: number, ids: Set<string>) => ({
    chave,
    titulo,
    pessoas,
    contas,
    pct: pct(pessoas),
    amostra: [...ids].slice(0, 8).map((id) => nomePorConta.get(id) ?? id),
  });

  const faixas = [
    faixa("comparacao", `Já fez ${comparacao}${variacoes ? " (e variações)" : ""}`, pessoasComparacao, contasComparacao, jaFezIds),
    faixa("outros", "Fez outro curso", pessoasOutros, contasOutros, outrosIds),
    faixa("primeira", "Primeira vez em qualquer curso", pessoasPrimeira, contasPrimeira, primeiraIds),
  ];

  // Linhas para a tabela detalhada, com a classificação de cada aluno.
  const alunos = [...pessoasPorConta].map(([id, pessoas]) => ({
    id,
    nome: nomePorConta.get(id) ?? "—",
    pessoas,
    faixa: jaFezIds.has(id) ? "comparacao" : primeiraIds.has(id) ? "primeira" : "outros",
  }));

  return {
    filtros: { curso, turma, comparacao, turmaComparacao, variacoes },
    total: { pessoas: totalPessoas, contas: totalContas, matriculas: linhas.length },
    faixas,
    alunos,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const p = url.searchParams;

    if (p.get("opcoes") === "1") {
      return NextResponse.json(await carregarOpcoes(), {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
      });
    }

    const curso = (p.get("curso") ?? "").trim();
    const comparacao = (p.get("comparacao") ?? "").trim();
    if (!curso || !comparacao) {
      return NextResponse.json({ erro: "Informe o curso base e o curso de comparação." }, { status: 400 });
    }

    const dados = await analisar({
      curso,
      turma: (p.get("turma") ?? "").trim(),
      comparacao,
      turmaComparacao: (p.get("turmaComparacao") ?? "").trim(),
      variacoes: p.get("variacoes") === "1",
    });

    return NextResponse.json(dados, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300" },
    });
  } catch (e) {
    const erro = e as Error & { digest?: string };
    if (erro.digest !== "NEXT_PRERENDER_INTERRUPTED") {
      console.error("Erro na Consulta Histórico:", erro);
    }
    return NextResponse.json({ erro: erro.message }, { status: 500 });
  }
}
