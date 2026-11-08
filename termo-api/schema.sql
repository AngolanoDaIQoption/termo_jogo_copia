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

-- 5. Eventos de pontuação: uma linha por vitória para retries idempotentes
CREATE TABLE IF NOT EXISTS score_events (
    event_id TEXT PRIMARY KEY,
    pin TEXT NOT NULL,
    nome TEXT NOT NULL,
    pontos INTEGER NOT NULL CHECK (pontos >= 0 AND pontos <= 100),
    avatar TEXT NOT NULL,
    registrar_tempo INTEGER NOT NULL DEFAULT 0,
    tempo_ms INTEGER NOT NULL DEFAULT 0,
    historico_json TEXT NOT NULL DEFAULT '[]',
    data_formatada TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS score_events_after_insert
AFTER INSERT ON score_events
BEGIN
    INSERT INTO jogadores (pin, nome, pontos, avatar, updated_at)
    VALUES (NEW.pin, NEW.nome, NEW.pontos, NEW.avatar, CURRENT_TIMESTAMP)
    ON CONFLICT(pin) DO UPDATE SET
        nome = NEW.nome,
        pontos = jogadores.pontos + NEW.pontos,
        avatar = NEW.avatar,
        updated_at = CURRENT_TIMESTAMP;

    INSERT INTO partidas (
        jogador_pin,
        nome_display,
        tempo_ms,
        avatar,
        historico_json,
        data_formatada
    )
    SELECT
        NEW.pin,
        NEW.nome,
        NEW.tempo_ms,
        NEW.avatar,
        NEW.historico_json,
        NEW.data_formatada
    WHERE NEW.registrar_tempo = 1 AND NEW.tempo_ms > 0;
END;
