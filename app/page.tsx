"use client";

import { useCallback, useEffect, useState } from "react";

const COR = {
  primaria: "#0B2A6F",
  destaque: "#F58220",
  fundo: "#EEF1F7",
  ok: "#1E9E5A",
  neutro: "#8A94A6",
  atencao: "#B45309",
  texto: "#1F2937",
  textoSuave: "#5B6577",
};

type Opcoes = { cursos: string[]; turmasBase: string[]; turmasComparacao: string[] };
type Faixa = {
  chave: string;
  titulo: string;
  pessoas: number;
  contas: number;
  pct: number;
};
type Repetido = {
  vendaId: string;
  alunoId: string;
  aluno: string;
  nomeVenda: string;
  curso: string;
  pacote: string;
  tipoMatricula: string;
};
type Dados = {
  modo: "padrao" | "mesmo-curso";
  filtros: { curso: string; turma: string; comparacao: string; turmaComparacao: string; variacoes: boolean };
  total: { pessoas: number; contas: number; repetidos: number };
  repetidos: { contas: number; vendas: number; truncado: boolean; linhas: Repetido[] };
  faixas: Faixa[];
};

const CORES_FAIXA: Record<string, string> = {
  comparacao: COR.primaria,
  outros: COR.destaque,
  primeira: COR.ok,
};

const numero = (n: number) => n.toLocaleString("pt-BR");

function Cartao({
  titulo,
  valor,
  detalhe,
  cor,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  cor: string;
}) {
  return (
    <div
      className="min-w-0 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200"
      style={{ borderTop: `4px solid ${cor}` }}
    >
      <div className="truncate text-[11px] font-semibold uppercase tracking-wide" style={{ color: COR.textoSuave }}>
        {titulo}
      </div>
      <div className="truncate text-2xl font-bold leading-tight" style={{ color: COR.texto }}>
        {valor}
      </div>
      {detalhe && <div className="mt-0.5 truncate text-[11px]" style={{ color: COR.textoSuave }}>{detalhe}</div>}
    </div>
  );
}

function Campo({
  label,
  valor,
  opcoes,
  onChange,
  placeholder,
  id,
}: {
  label: string;
  valor: string;
  opcoes: string[];
  onChange: (v: string) => void;
  placeholder: string;
  id: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold" style={{ color: COR.textoSuave }}>
      {label}
      <input
        list={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal"
        style={{ color: COR.texto }}
      />
      <datalist id={id}>
        {opcoes.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

export default function Home() {
  const [opcoes, setOpcoes] = useState<Opcoes>({ cursos: [], turmasBase: [], turmasComparacao: [] });
  const [curso, setCurso] = useState("MMM");
  const [turma, setTurma] = useState("");
  const [comparacao, setComparacao] = useState("CIS");
  const [turmaComparacao, setTurmaComparacao] = useState("");
  const [variacoes, setVariacoes] = useState(true);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [buscaRepetidos, setBuscaRepetidos] = useState("");

  // Sugestões de turma acompanham o curso selecionado.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = new URLSearchParams({
        opcoes: "1",
        curso,
        comparacao,
        variacoes: variacoes ? "1" : "0",
      });
      fetch(`/api/consulta?${q}`)
        .then((r) => r.json())
        .then((o: Opcoes) => setOpcoes(o))
        .catch(() => setErro("Não foi possível carregar as sugestões. Você ainda pode digitar os códigos."));
    }, 400);
    return () => clearTimeout(timer);
  }, [curso, comparacao, variacoes]);

  const analisar = useCallback(async () => {
    if (!curso.trim() || !comparacao.trim()) {
      setErro("Informe o curso base e o curso de comparação.");
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const q = new URLSearchParams({
        curso,
        turma,
        comparacao,
        turmaComparacao,
        variacoes: variacoes ? "1" : "0",
      });
      const r = await fetch(`/api/consulta?${q}`);
      const j = await r.json();
      if (!r.ok || j.erro) throw new Error(j.erro || "Falha ao consultar o Salesforce.");
      setDados(j as Dados);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [curso, turma, comparacao, turmaComparacao, variacoes]);

  // Primeira carga já traz o exemplo MMM x CIS.
  useEffect(() => {
    void analisar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const codigos = (texto: string) =>
    texto.toUpperCase().split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const mesmoCursoUI = codigos(comparacao).some((c) => codigos(curso).includes(c));

  const baseDescricao = turma.trim() ? `turma ${turma.trim()}` : `base do curso ${curso.trim()}`;
  const resumo = dados
    ? dados.modo === "mesmo-curso"
      ? `A ${baseDescricao} tem ${numero(dados.total.pessoas)} alunos matriculados; ${dados.faixas[0]?.pct}% já fez ${comparacao.trim()} em outra turma; e ${dados.faixas[1]?.pct}% está fazendo ${curso.trim()} pela primeira vez.`
      : `A ${baseDescricao} tem ${numero(dados.total.pessoas)} alunos matriculados; ${dados.faixas[0]?.pct}% já fez ${comparacao.trim()}${variacoes ? " (ou variações)" : ""} em algum momento; ${dados.faixas[1]?.pct}% fez outro curso (que não é o da base nem o comparado); e ${dados.faixas[2]?.pct}% estão fazendo pela primeira vez em qualquer curso.`
    : "";

  return (
    <main className="flex flex-col gap-3 p-3" style={{ background: COR.fundo, color: COR.texto, colorScheme: "light" }}>
      <header
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 text-white shadow-sm"
        style={{ background: COR.primaria }}
      >
        <div className="h-9 w-1 rounded" style={{ background: COR.destaque }} />
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">Consulta Histórico</h1>
          <p className="text-xs opacity-80">Reincidência de alunos por curso e turma · Salesforce</p>
        </div>
      </header>

      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Campo id="cursos-base" label="Curso base" valor={curso} opcoes={opcoes.cursos} onChange={setCurso} placeholder="Ex.: MMM" />
          <Campo id="turmas-base" label="Turma base" valor={turma} opcoes={opcoes.turmasBase} onChange={setTurma} placeholder="Ex.: 253 (contém)" />
          <Campo id="cursos-comp" label="Comparar com" valor={comparacao} opcoes={opcoes.cursos} onChange={setComparacao} placeholder="Ex.: CIS" />
          <Campo id="turmas-comp" label="Turma comparada" valor={turmaComparacao} opcoes={opcoes.turmasComparacao} onChange={setTurmaComparacao} placeholder="Ex.: !=253 (diferente)" />
          <div className="flex items-end">
            <button
              onClick={() => void analisar()}
              disabled={carregando}
              className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              style={{ background: COR.destaque }}
            >
              {carregando ? "Consultando..." : "Analisar"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-xs" style={{ color: COR.textoSuave }}>
            <input type="checkbox" checked={variacoes} onChange={(e) => setVariacoes(e.target.checked)} />
            Incluir variações do curso comparado (ex.: CIS, CISFM, CISAS, CISA)
          </label>
          <span className="text-[11px]" style={{ color: COR.textoSuave }}>
            Cursos: digite ou escolha; separe vários por vírgula (ex.: <b>MMM, CIS</b>).
          </span>
          <span className="text-[11px]" style={{ color: COR.textoSuave }}>
            Turmas: <b>253</b> = contém · <b>!=253</b> = diferente · <b>=nome</b> = exato · <b>^2026</b> = começa com · <b>$01</b> = termina com. Várias, separe por vírgula.
          </span>
          {mesmoCursoUI && (
            <span className="text-[11px] font-semibold" style={{ color: COR.primaria }}>
              Mesmo curso na base e na comparação: desmarque “Incluir variações” para considerar somente este curso.
            </span>
          )}
        </div>
      </section>

      {erro && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{erro}</div>
      )}

      {carregando && !dados && (
        <div className="rounded-xl bg-white p-6 text-center text-sm" style={{ color: COR.textoSuave }}>
          Buscando no Salesforce... isso pode levar alguns segundos.
        </div>
      )}

      {dados && !carregando && (
        <>
          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm leading-relaxed" style={{ color: COR.texto }}>
              {resumo}
            </p>
            <p className="mt-2 text-[11px]" style={{ color: COR.textoSuave }}>
              Contagens por aluno (conta). Percentuais calculados sobre o total de pessoas matriculadas na seleção.
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Cartao titulo="Alunos matriculados" valor={numero(dados.total.pessoas)} detalhe="soma de pessoas" cor={COR.primaria} />
            <Cartao titulo="Alunos distintos (ID)" valor={numero(dados.total.contas)} detalhe="IDs diferentes no Salesforce" cor={COR.destaque} />
            <Cartao titulo="Alunos repetidos" valor={numero(dados.total.repetidos)} detalhe="diferença entre os dois totais" cor={COR.atencao} />
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            {dados.faixas.map((f) => (
              <div key={f.chave} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200" style={{ borderTop: `4px solid ${CORES_FAIXA[f.chave]}` }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: COR.textoSuave }}>
                  {f.titulo}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-bold" style={{ color: CORES_FAIXA[f.chave] }}>{f.pct}%</span>
                  <span className="text-sm" style={{ color: COR.texto }}>{numero(f.pessoas)} alunos</span>
                </div>
                <div className="mt-1 text-[11px]" style={{ color: COR.textoSuave }}>
                  {numero(f.contas)} contas · {f.chave === "comparacao" ? (dados.modo === "mesmo-curso" ? "histórico em outra turma" : "histórico no curso comparado") : f.chave === "primeira" ? (dados.modo === "mesmo-curso" ? "nenhuma turma anterior deste curso" : "nenhum curso anterior") : "cursos diferentes dos selecionados"}
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: COR.primaria }}>
              Distribuição dos alunos
            </h2>
            <div className="mt-3 flex h-8 w-full overflow-hidden rounded-lg bg-slate-100">
              {dados.faixas.map((f) => (
                <div
                  key={f.chave}
                  title={`${f.titulo}: ${f.pct}%`}
                  style={{ width: `${f.pct}%`, background: CORES_FAIXA[f.chave] }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-[11px]" style={{ color: COR.texto }}>
              {dados.faixas.map((f) => (
                <span key={f.chave} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CORES_FAIXA[f.chave] }} />
                  {f.titulo} — {f.pct}%
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: COR.primaria }}>
                  Alunos repetidos — detalhamento
                </h2>
                <p className="mt-0.5 text-[11px]" style={{ color: COR.textoSuave }}>
                  {numero(dados.repetidos.contas)} contas com mais de uma vaga ou venda · {numero(dados.repetidos.vendas)} vendas
                </p>
              </div>
              <input
                value={buscaRepetidos}
                onChange={(e) => setBuscaRepetidos(e.target.value)}
                placeholder="Buscar por ID, aluno, curso ou pacote..."
                className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
              />
            </div>

            {dados.repetidos.linhas.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: COR.textoSuave }}>
                Nenhum aluno repetido nesta seleção.
              </p>
            ) : (
              <div className="mt-3 max-h-[420px] overflow-auto">
                <table className="w-full min-w-[1000px] text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase" style={{ color: COR.textoSuave }}>
                    <tr>
                      <th className="px-2 py-2">ID da venda</th>
                      <th className="px-2 py-2">ID do aluno</th>
                      <th className="px-2 py-2">Nome do aluno</th>
                      <th className="px-2 py-2">Nome da venda</th>
                      <th className="px-2 py-2">Curso</th>
                      <th className="px-2 py-2">Pacote do aluno</th>
                      <th className="px-2 py-2">Tipo matrícula</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.repetidos.linhas
                      .filter((r) => {
                        const termo = buscaRepetidos.trim().toLowerCase();
                        if (!termo) return true;
                        return [r.vendaId, r.alunoId, r.aluno, r.nomeVenda, r.curso, r.pacote, r.tipoMatricula]
                          .some((v) => v.toLowerCase().includes(termo));
                      })
                      .map((r) => (
                        <tr key={r.vendaId} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 font-mono text-[10px]">{r.vendaId}</td>
                          <td className="px-2 py-1.5 font-mono text-[10px]">{r.alunoId}</td>
                          <td className="px-2 py-1.5">{r.aluno}</td>
                          <td className="px-2 py-1.5">{r.nomeVenda}</td>
                          <td className="px-2 py-1.5 font-semibold">{r.curso}</td>
                          <td className="px-2 py-1.5">{r.pacote}</td>
                          <td className="px-2 py-1.5">{r.tipoMatricula}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {dados.repetidos.truncado && (
              <p className="mt-2 text-[11px]" style={{ color: COR.atencao }}>
                Exibindo as primeiras 1.000 vendas. Refine os filtros para ver todas.
              </p>
            )}
            <p className="mt-2 text-[11px]" style={{ color: COR.textoSuave }}>
              O card “Alunos repetidos” é a diferença entre a soma de pessoas e a quantidade de IDs distintos. Esta tabela mostra as vendas das contas que aparecem mais de uma vez na seleção — por isso a quantidade de vendas pode não ser igual ao número do card.
            </p>
          </section>

          <p className="pb-2 text-center text-[11px]" style={{ color: COR.textoSuave }}>
            {dados.filtros.comparacao} · base: {dados.filtros.curso}{dados.filtros.turma ? ` / ${dados.filtros.turma}` : ""} · regras: mesmas do relatório manual (fases aprovadas e tipos de matrícula excluídos)
          </p>
        </>
      )}
    </main>
  );
}
