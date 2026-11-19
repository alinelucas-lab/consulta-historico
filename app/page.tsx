"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const COR = {
  primaria: "#0B2A6F",
  destaque: "#F58220",
  fundo: "#EEF1F7",
  ok: "#1E9E5A",
  alerta: "#D64545",
  neutro: "#8A94A6",
  texto: "#1F2937",
  textoSuave: "#5B6577",
};

type Opcoes = { cursos: string[]; turmas: string[] };
type Faixa = {
  chave: string;
  titulo: string;
  pessoas: number;
  contas: number;
  pct: number;
  amostra: string[];
};
type Aluno = { id: string; nome: string; pessoas: number; faixa: string };
type Dados = {
  filtros: { curso: string; turma: string; comparacao: string; turmaComparacao: string; variacoes: boolean };
  total: { pessoas: number; contas: number; matriculas: number };
  faixas: Faixa[];
  alunos: Aluno[];
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

function Select({
  label,
  valor,
  opcoes,
  onChange,
 Placeholder = "Todas",
}: {
  label: string;
  valor: string;
  opcoes: string[];
  onChange: (v: string) => void;
  Placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold" style={{ color: COR.textoSuave }}>
      {label}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal"
        style={{ color: COR.texto }}
      >
        <option value="">{Placeholder}</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export default function Home() {
  const [opcoes, setOpcoes] = useState<Opcoes>({ cursos: [], turmas: [] });
  const [curso, setCurso] = useState("");
  const [turma, setTurma] = useState("");
  const [comparacao, setComparacao] = useState("");
  const [turmaComparacao, setTurmaComparacao] = useState("");
  const [variacoes, setVariacoes] = useState(true);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [faixaTabela, setFaixaTabela] = useState("");

  useEffect(() => {
    fetch("/api/consulta?opcoes=1")
      .then((r) => r.json())
      .then((o: Opcoes) => {
        setOpcoes(o);
        setCurso(o.cursos.includes("MMM") ? "MMM" : (o.cursos[0] ?? ""));
        setComparacao(o.cursos.includes("CIS") ? "CIS" : (o.cursos[1] ?? ""));
      })
      .catch(() => setErro("Não foi possível carregar a lista de cursos."));
  }, []);

  const analisar = useCallback(async () => {
    if (!curso || !comparacao) {
      setErro("Selecione o curso base e o curso de comparação.");
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

  useEffect(() => {
    if (curso && comparacao) void analisar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curso, comparacao]);

  const alunosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.alunos ?? []).filter(
      (a) => (!faixaTabela || a.faixa === faixaTabela) && (!termo || a.nome.toLowerCase().includes(termo))
    );
  }, [dados, busca, faixaTabela]);

  const tituloComparacao = dados?.faixas.find((f) => f.chave === "comparacao")?.titulo ?? comparacao;
  const resumo = dados
    ? `A ${turma ? `turma ${turma}` : `base do curso ${curso}`} tem ${numero(dados.total.pessoas)} alunos matriculados; ${dados.faixas[0]?.pct}% já fez ${comparacao}${variacoes ? " (ou variações)" : ""} em algum momento; ${dados.faixas[1]?.pct}% fez outro curso (que não ${curso} nem ${comparacao}); e ${dados.faixas[2]?.pct}% estão fazendo pela primeira vez em qualquer curso.`
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
          <Select label="Curso base" valor={curso} opcoes={opcoes.cursos} onChange={(v) => { setCurso(v); setTurma(""); }} Placeholder="Selecione" />
          <Select label="Turma base" valor={turma} opcoes={opcoes.turmas} onChange={setTurma} Placeholder="Todas as turmas" />
          <Select label="Comparar com" valor={comparacao} opcoes={opcoes.cursos} onChange={(v) => { setComparacao(v); setTurmaComparacao(""); }} Placeholder="Selecione" />
          <Select label="Turma comparada" valor={turmaComparacao} opcoes={opcoes.turmas} onChange={setTurmaComparacao} Placeholder="Qualquer turma" />
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
        <label className="mt-3 flex items-center gap-2 text-xs" style={{ color: COR.textoSuave }}>
          <input type="checkbox" checked={variacoes} onChange={(e) => setVariacoes(e.target.checked)} />
          Incluir variações do curso comparado (ex.: CIS, CISFM, CISAS, CISA)
        </label>
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
            <Cartao titulo="Alunos distintos" valor={numero(dados.total.contas)} detalhe="contas no Salesforce" cor={COR.destaque} />
            <Cartao titulo="Matrículas" valor={numero(dados.total.matriculas)} detalhe="oportunidades" cor={COR.neutro} />
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
                  {numero(f.contas)} contas · {f.chave === "comparacao" ? "histórico no curso comparado" : f.chave === "primeira" ? "nenhum curso anterior" : "cursos diferentes dos dois selecionados"}
                </div>
                {f.amostra.length > 0 && (
                  <div className="mt-2 line-clamp-2 text-[11px]" style={{ color: COR.textoSuave }}>
                    Ex.: {f.amostra.slice(0, 3).join(", ")}
                  </div>
                )}
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
              <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: COR.primaria }}>
                Alunos ({numero(alunosFiltrados.length)})
              </h2>
              <div className="flex flex-wrap gap-2">
                <select
                  value={faixaTabela}
                  onChange={(e) => setFaixaTabela(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">Todas as situações</option>
                  {dados.faixas.map((f) => (
                    <option key={f.chave} value={f.chave}>{f.titulo}</option>
                  ))}
                </select>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar aluno..."
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                />
              </div>
            </div>
            <div className="mt-3 max-h-[420px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase" style={{ color: COR.textoSuave }}>
                  <tr>
                    <th className="px-2 py-2">Aluno</th>
                    <th className="px-2 py-2">Situação</th>
                    <th className="px-2 py-2 text-right">Pessoas</th>
                  </tr>
                </thead>
                <tbody>
                  {alunosFiltrados.slice(0, 500).map((a) => {
                    const f = dados.faixas.find((x) => x.chave === a.faixa);
                    return (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5">{a.nome}</td>
                        <td className="px-2 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: CORES_FAIXA[a.faixa] }} />
                            {f?.titulo ?? a.faixa}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">{numero(a.pessoas)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {alunosFiltrados.length > 500 && (
              <p className="mt-2 text-[11px]" style={{ color: COR.textoSuave }}>
                Mostrando os primeiros 500 alunos. Use a busca para filtrar.
              </p>
            )}
          </section>

          <p className="pb-2 text-center text-[11px]" style={{ color: COR.textoSuave }}>
            {tituloComparacao} · base: {curso}{turma ? ` / ${turma}` : ""} · regras: mesmas do relatório manual (fases aprovadas e tipos de matrícula excluídos)
          </p>
        </>
      )}
    </main>
  );
}
