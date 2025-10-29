# Arquivos Candidatos à Exclusão (23/10/2025)

> Documentação preliminar dos arquivos que parecem não ser necessários para o funcionamento atual do app. Valide antes de remover definitivamente.

## 1. Scripts de migração obsoletos

1. `MIGRATION_FIX_STATUS.sql`
   - **Motivo**: Ajustes já consolidados em `data_schema.sql` e na migração incremental `20241023_add_observations_and_attachments.sql`.
   - **Dependências**: Nenhuma chamada automática no build; arquivo solto na raiz.

## 2. Especificações antigas duplicadas

1. `specsversão  01.md`
   - **Motivo**: Conteúdo antigo (iteração inicial) já absorvido em `specs.md` atual.
   - **Dependências**: Nenhuma referência no projeto.

## Observações

- Execute `git check-ignore` ou busque referências antes da exclusão definitiva.
- Após remover, atualize `change_log.md` registrando a limpeza.
