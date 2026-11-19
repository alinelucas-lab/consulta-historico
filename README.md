# Consulta Histórico

Dashboard de reincidência de alunos por curso e turma — Febracis.

**Link:** https://consulta-historico.vercel.app

## O que faz

A partir de um **curso/turma base**, calcula o percentual e a quantidade de alunos que:

1. **Já fez o curso comparado** (com opção de incluir variações, ex.: CIS, CISFM, CISAS);
2. **Fez outro curso** (diferente do base e do comparado);
3. **Está fazendo pela primeira vez em qualquer curso** da história.

Também permite filtrar a **turma comparada** e ver a lista de alunos classificados em cada faixa.

## Regras de negócio (mesmas do relatório manual)

Fases consideradas:

- `Aprovada`, `Aprovada Parcial`, `Pag. Parcial`, `Mod.Online-Presencial`, `Mod.Presencial-Online`

Tipos de matrícula excluídos:

- `27`, `141`, `135`, `35`, `89`

## Arquitetura

- Next.js (App Router) + TypeScript
- `app/api/consulta/route.ts` → consultas ao Salesforce (credenciais apenas na Vercel, como Secrets)
- `lib/salesforce.ts` → login OAuth com cache de token
- Deploy automático via GitHub → Vercel

## Desenvolvimento local

```bash
npm ci
cp .env.local.example .env.local  # preencher com as credenciais
npm run dev
```

Variáveis necessárias: `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`.
