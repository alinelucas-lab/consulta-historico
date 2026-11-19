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
};
type Conta = { Id: string; Name: string };

// Aceita "MMM", "MMM, CIS", "CIS; CISFM", etc.
function parsearLista(valor: string): string[] {
  return [
    ...new Set(
      valor
        .split(/[,;\n]/)
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

function filtroCursos(cursos: string[], variacoes: boolean, turmas: string[]) {
  const campo = variacoes
    ? `(${cursos.map((c) => `C_digo_do_Curso__c LIKE '${esc(c)}%'`).join(" OR ")})`
    : `C_digo_do_Curso__c IN (${lista(cursos)})`;
  const filtroTurma = turmas.length ? ` AND Turma__r.Name IN (${lista(turmas)})` : "";
  return `${REGRAS} AND ${campo}${filtroTurma}`;
}

async function carregarOpcoes() {
  const [cursosBrutos, turmasBrutas] = await Promise.all([
    // O campo de código em Opportunity não é agrupável no Salesforce.
    // O objeto Curso__c tem todos os códigos e permite GROUP BY.
    sfQuery<{ CodigoCurso__c: string }>(
      `SELECT CodigoCurso__c, COUNT(Id) total FROM Curso__c
       WHERE CodigoCurso__c != null
       GROUP BY CodigoCurso__c ORDER BY COUNT(Id) DESC`
    ),
    // Consultas agrupadas não aceitam queryMore no Salesforce: máximo de 2000 por lote.
    sfQuery<{ Turma__r?: { Name: string } | null; Name?: string }>(
      `SELECT Turma__r.Name, SUM(QuantidadePessoas__c) total
       FROM Opportunity WHERE ${REGRAS} AND Turma__c != null
       GROUP BY Turma__r.Name ORDER BY SUM(QuantidadePessoas__c) DESC LIMIT 2000`
    ),
  ]);

  const cursos = [...new Set(cursosBrutos.map((r) => r.CodigoCurso__c).filter(Boolean) as string[])].sort();
  // Em AggregateResult o Salesforce devolve o relacionamento como "Name" (não "Turma__r.Name").
  const turmas = [
    ...new Set(
      turmasBrutas
        .map((r) => r.Turma__r?.Name ?? r.Name)
        .filter(Boolean) as string[]
    ),
  ].sort();
  return { cursos, turmas };
}

async function analisar(params: {
  cursosBase: string[];
  turmasBase: string[];
  cursosComp: string[];
  turmasComp: string[];
  variacoes: boolean;
}) {
  const { cursosBase, turmasBase, cursosComp, turmasComp, variacoes } = params;
  const base = filtroCursos(cursosBase, false, turmasBase);
  const comp = filtroCursos(cursosComp, variacoes, turmasComp);

  const [linhas, jaFez, primeira] = await Promise.all([
    sfQuery<Oportunidade>(
      `SELECT AccountId, Account.Name, QuantidadePessoas__c
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
                        WHERE ${REGRAS}
                          AND C_digo_do_Curso__c NOT IN (${lista(cursosBase)}))`
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

  // Garante que as faixas não se sobreponham (ex.: mesmo código na base e na comparação).
  const primeiraIds = new Set(primeira.map((c) => c.Id).filter((id) => !jaFezIds.has(id)));
  const somaPessoas = (ids: Set<string>) =>
    [...ids].reduce((s, id) => s + (pessoasPorConta.get(id) ?? 0), 0);

  const pessoasComparacao = somaPessoas(jaFezIds);
  const pessoasPrimeira = somaPessoas(primeiraIds);
  const contasComparacao = jaFezIds.size;
  const contasPrimeira = primeiraIds.size;

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
    faixa("comparacao", `Já fez ${cursosComp.join(", ")}${variacoes ? " (e variações)" : ""}`, pessoasComparacao, contasComparacao, jaFezIds),
    faixa("outros", "Fez outro curso", pessoasOutros, contasOutros, outrosIds),
    faixa("primeira", "Primeira vez em qualquer curso", pessoasPrimeira, contasPrimeira, primeiraIds),
  ];

  const alunos = [...pessoasPorConta].map(([id, pessoas]) => ({
    id,
    nome: nomePorConta.get(id) ?? "—",
    pessoas,
    faixa: jaFezIds.has(id) ? "comparacao" : primeiraIds.has(id) ? "primeira" : "outros",
  }));

  return {
    filtros: {
      curso: cursosBase.join(", "),
      turma: turmasBase.join(", "),
      comparacao: cursosComp.join(", "),
      turmaComparacao: turmasComp.join(", "),
      variacoes,
    },
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

    const cursosBase = parsearLista(p.get("curso") ?? "");
    const cursosComp = parsearLista(p.get("comparacao") ?? "");
    if (!cursosBase.length || !cursosComp.length) {
      return NextResponse.json({ erro: "Informe o curso base e o curso de comparação." }, { status: 400 });
    }

    const dados = await analisar({
      cursosBase,
      turmasBase: parsearLista(p.get("turma") ?? ""),
      cursosComp,
      turmasComp: parsearLista(p.get("turmaComparacao") ?? ""),
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
