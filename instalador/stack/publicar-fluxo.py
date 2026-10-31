#!/usr/bin/env python3
"""Registra uma versão publicada do fluxo no banco SQLite do n8n.

Algumas versões do n8n importam o fluxo pela linha de comando sem criar a linha de
histórico, e a ativação falha sem ela. Uso: publicar-fluxo.py <database.sqlite> <id do fluxo>
"""
import sqlite3
import sys
import uuid
from datetime import datetime, timezone


def colunas(con, tabela):
    return {linha[1] for linha in con.execute(f'PRAGMA table_info("{tabela}")')}


def publicar(banco, fluxo_id):
    con = sqlite3.connect(banco, timeout=30)
    try:
        achado = con.execute(
            'SELECT name, nodes, connections FROM workflow_entity WHERE id = ?', (fluxo_id,)
        ).fetchone()
        if not achado:
            raise SystemExit(f'fluxo {fluxo_id} não está no banco; a importação falhou?')
        nome, nos, conexoes = achado
        versao = str(uuid.uuid4())
        agora = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]

        # o esquema muda entre versões do n8n: só preenche as colunas que existem
        historico = {
            'versionId': versao, 'workflowId': fluxo_id, 'nodes': nos, 'connections': conexoes,
            'authors': 'instalador', 'name': nome, 'autosaved': 0, 'createdAt': agora, 'updatedAt': agora,
        }
        existentes = colunas(con, 'workflow_history')
        historico = {k: v for k, v in historico.items() if k in existentes}
        nomes = ', '.join(f'"{k}"' for k in historico)
        marcas = ', '.join('?' for _ in historico)
        con.execute(f'INSERT INTO workflow_history ({nomes}) VALUES ({marcas})', list(historico.values()))

        mudancas = {'versionId': versao}
        if 'activeVersionId' in colunas(con, 'workflow_entity'):
            mudancas['activeVersionId'] = versao
        atribuicoes = ', '.join(f'"{k}" = ?' for k in mudancas)
        con.execute(f'UPDATE workflow_entity SET {atribuicoes} WHERE id = ?', [*mudancas.values(), fluxo_id])
        con.commit()
        return versao
    finally:
        con.close()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('uso: publicar-fluxo.py <database.sqlite> <id do fluxo>')
    print(publicar(sys.argv[1], sys.argv[2]))
