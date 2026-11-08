CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jogadores (
    pin TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    pontos INTEGER NOT NULL DEFAULT 0,
    avatar TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

CREATE INDEX IF NOT EXISTS idx_jogadores_pontos ON jogadores(pontos DESC);
CREATE INDEX IF NOT EXISTS idx_partidas_tempo ON partidas(tempo_ms ASC);
