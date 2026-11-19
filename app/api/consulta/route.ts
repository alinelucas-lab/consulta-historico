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
const escapeLike = (s: string) => esc(s).replace(/%/g, "\\%").replace(/_/g, "\\_");
const lista = (itens: string[]) => itens.map((v) => `'${esc(v)}'`).join(", ");

const REGRAS = `StageName IN (${lista(STAGES)})
  AND Tipo_de_Matricula__c NOT IN (${lista(TIPOS_EXCLUIR)})`;

type Conta = { Id: string };

// Separa valores digitados por vírgula, ponto e vírgula ou quebra de linha.
function parsearLista(valor: string, maiusculas = false): string[] {
  return [
    ...new Set(
      valor
        .split(/[,;\n]/)
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => (maiusculas ? v.toUpperCase() : v))
    ),
  ];
}

// Operadores para turma:
//   253          -> contém 253 (padrão)
//   contem:253   -> contém 253
//   ^2026        -> começa com 2026
//   $01          -> termina com 01
//   =2026 - MMM01 -> exatamente esse nome
function parsearTermoTurma(termo: string): { op: string; valor: string } {
  const t = termo.trim();
  const prefixos: Array<[RegExp, string]> = [
    [/^contem\s*:\s*/i, "contem"],
    [/^inicia\s*:\s*/i, "inicia"],
    [/^termina\s*:\s*/i, "termina"],
    [/^exato\s*:\s*/i, "exato"],
    [/^=\s*/, "exato"],
    [/^\^/, "inicia"],
    [/^\$/, "termina"],
    [/^~/, "contem"],
  ];
  for (const [re, op] of prefixos) {
    if (re.test(t)) return { op, valor: t.replace(re, "").trim() };
  }
  return { op: "contem", valor: t };
}

function condicaoTurma(termo: string): string {
  const { op, valor } = parsearTermoTurma(termo);
  if (!valor) return "1 = 0";
  switch (op) {
    case "exato":
      return `Turma__r.Name = '${esc(valor)}'`;
    case "inicia":
      return `Turma__r.Name LIKE '${escapeLike(valor)}%'`;
    case "termina":
      return `Turma__r.Name LIKE '%${escapeLike(valor)}'`;
    default:
      return `Turma__r.Name LIKE '%${escapeLike(valor)}%'`;
  }
}

function filtroTurma(termos: string[]): string {
  if (!termos.length) return "";
  return ` AND (${termos.map(condicaoTurma).join(" OR ")})`;
}

function filtroCursos(cursos: string[], variacoes: boolean, termosTurma: string[]) {
  const campo = variacoes
    ? `(${cursos.map((c) => `C_digo_do_Curso__c LIKE '${escapeLike(c)}%'`).join(" OR ")})`
    : `C_digo_do_Curso__c IN (${lista(cursos)})`;
  return `${REGRAS} AND ${campo}${filtroTurma(termosTurma)}`;
}

async function carregarTurmas(cursos: string[], variacoes: boolean): Promise<string[]> {
  // Consultas agrupadas não aceitam queryMore no Salesforce: máximo de 2000 por lote.
  const regs = await sfQuery<{ Turma__r?: { Name: string } | null; Name?: string }>(
    `SELECT Turma__r.Name, SUM(QuantidadePessoas__c) total
     FROM Opportunity WHERE ${filtroCursos(cursos, variacoes, [])}
     GROUP BY Turma__r.Name ORDER BY SUM(QuantidadePessoas__c) DESC LIMIT 2000`
  );
  // Em AggregateResult o Salesforce devolve o relacionamento como "Name".
  return [
    ...new Set(
      regs
        .map((r) => r.Turma__r?.Name ?? r.Name)
        .filter(Boolean) as string[]
    ),
  ].sort();
}

async function carregarOpcoes(cursosBase: string[], cursosComp: string[], variacoes: boolean) {
  const [cursosBrutos, turmasBase, turmasComparacao] = await Promise.all([
    sfQuery<{ CodigoCurso__c: string }>(
      `SELECT CodigoCurso__c, COUNT(Id) total FROM Curso__c
       WHERE CodigoCurso__c != null
       GROUP BY CodigoCurso__c ORDER BY COUNT(Id) DESC`
    ),
    cursosBase.length ? carregarTurmas(cursosBase, variacoes) : Promise.resolve([]),
    cursosComp.length ? carregarTurmas(cursosComp, variacoes) : Promise.resolve([]),
  ]);

  const cursos = [...new Set(cursosBrutos.map((r) => r.CodigoCurso__c).filter(Boolean) as string[])].sort();
  return { cursos, turmasBase, turmasComparacao };
}

async function analisar(params: {
  cursosBase: string[];
  termosTurmaBase: string[];
  cursosComp: string[];
  termosTurmaComp: string[];
  variacoes: boolean;
}) {
  const { cursosBase, termosTurmaBase, cursosComp, termosTurmaComp, variacoes } = params;
  const base = filtroCursos(cursosBase, false, termosTurmaBase);
  const comp = filtroCursos(cursosComp, variacoes, termosTurmaComp);

  const [linhas, jaFez, primeira] = await Promise.all([
    sfQuery<{ AccountId?: string | null; QuantidadePessoas__c?: number | null }>(
      `SELECT AccountId, QuantidadePessoas__c FROM Opportunity WHERE ${base}`
    ),
    sfQuery<Conta>(
      `SELECT Id FROM Account
       WHERE Id IN (SELECT AccountId FROM Opportunity WHERE ${base})
         AND Id IN (SELECT AccountId FROM Opportunity WHERE ${comp})`
    ),
    sfQuery<Conta>(
      `SELECT Id FROM Account
       WHERE Id IN (SELECT AccountId FROM Opportunity WHERE ${base})
         AND Id NOT IN (SELECT AccountId FROM Opportunity
                        WHERE ${REGRAS}
                          AND C_digo_do_Curso__c NOT IN (${lista(cursosBase)}))`
    ),
  ]);

  const pessoasPorConta = new Map<string, number>();
  for (const l of linhas) {
    if (!l.AccountId) continue;
    pessoasPorConta.set(l.AccountId, (pessoasPorConta.get(l.AccountId) ?? 0) + (l.QuantidadePessoas__c ?? 0));
  }

  const totalPessoas = linhas.reduce((s, l) => s + (l.QuantidadePessoas__c ?? 0), 0);
  const totalContas = pessoasPorConta.size;

  const jaFezIds = new Set(jaFez.map((c) => c.Id));
  // Garante que as faixas não se sobreponham (ex.: mesmo código na base e na comparação).
  const primeiraIds = new Set(primeira.map((c) => c.Id).filter((id) => !jaFezIds.has(id)));

  const somaPessoas = (ids: Set<string>) =>
    [...ids].reduce((s, id) => s + (pessoasPorConta.get(id) ?? 0), 0);

  const pessoasComparacao = somaPessoas(jaFezIds);
  const pessoasPrimeira = somaPessoas(primeiraIds);
  const contasComparacao = jaFezIds.size;
  const contasPrimeira = primeiraIds.size;

  const pessoasOutros = Math.max(0, totalPessoas - pessoasComparacao - pessoasPrimeira);
  const contasOutros = Math.max(0, totalContas - contasComparacao - contasPrimeira);

  const pct = (n: number) => (totalPessoas ? Math.round((n / totalPessoas) * 1000) / 10 : 0);

  const faixa = (chave: string, titulo: string, pessoas: number, contas: number) => ({
    chave,
    titulo,
    pessoas,
    contas,
    pct: pct(pessoas),
  });

  return {
    filtros: {
      curso: cursosBase.join(", "),
      turma: termosTurmaBase.join(", "),
      comparacao: cursosComp.join(", "),
      turmaComparacao: termosTurmaComp.join(", "),
      variacoes,
    },
    total: { pessoas: totalPessoas, contas: totalContas, matriculas: linhas.length },
    faixas: [
      faixa("comparacao", `Já fez ${cursosComp.join(", ")}${variacoes ? " (e variações)" : ""}`, pessoasComparacao, contasComparacao),
      faixa("outros", "Fez outro curso", pessoasOutros, contasOutros),
      faixa("primeira", "Primeira vez em qualquer curso", pessoasPrimeira, contasPrimeira),
    ],
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const p = url.searchParams;
    const variacoes = p.get("variacoes") === "1";

    if (p.get("opcoes") === "1") {
      return NextResponse.json(
        await carregarOpcoes(
          parsearLista(p.get("curso") ?? "", true),
          parsearLista(p.get("comparacao") ?? "", true),
          variacoes
        ),
        { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
      );
    }

    const cursosBase = parsearLista(p.get("curso") ?? "", true);
    const cursosComp = parsearLista(p.get("comparacao") ?? "", true);
    if (!cursosBase.length || !cursosComp.length) {
      return NextResponse.json({ erro: "Informe o curso base e o curso de comparação." }, { status: 400 });
    }

    const dados = await analisar({
      cursosBase,
      termosTurmaBase: parsearLista(p.get("turma") ?? ""),
      cursosComp,
      termosTurmaComp: parsearLista(p.get("turmaComparacao") ?? ""),
      variacoes,
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
