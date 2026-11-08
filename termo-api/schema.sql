-- 1. Tabela de Estado do Sistema
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 2. Tabela de Jogadores (Ranking Geral de Pontos)
CREATE TABLE IF NOT EXISTS jogadores (
    pin TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    pontos INTEGER NOT NULL DEFAULT 0,
    avatar TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Partidas/Tempos (Ranking Semanal)
CREATE TABLE IF NOT EXISTS partidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jogador_pin TEXT,
    nome_display TEXT NOT NULL,
    tempo_ms INTEGER NOT NULL,
    avatar TEXT NOT NULL,
    historico_json TEXT,
    data_formatada TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jogador_pin) REFERENCES jogadores(pin) ON DELETE SET NULL
);

-- 4. Índices de Otimização
CREATE INDEX IF NOT EXISTS idx_jogadores_pontos ON jogadores(pontos DESC);
CREATE INDEX IF NOT EXISTS idx_partidas_tempo ON partidas(tempo_ms ASC);
