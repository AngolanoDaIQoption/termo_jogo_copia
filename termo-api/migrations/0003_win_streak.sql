ALTER TABLE jogadores ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;

ALTER TABLE score_events ADD COLUMN resultado_partida TEXT NOT NULL DEFAULT 'win';
ALTER TABLE score_events ADD COLUMN pontos_efetivos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE score_events ADD COLUMN streak_apos INTEGER NOT NULL DEFAULT 0;

UPDATE score_events SET pontos_efetivos = pontos;

DROP TRIGGER IF EXISTS score_events_after_insert;

CREATE TRIGGER score_events_after_insert
AFTER INSERT ON score_events
BEGIN
    UPDATE score_events
    SET
        pontos_efetivos = CASE
            WHEN NEW.resultado_partida = 'win' THEN
                (NEW.pontos * MIN(COALESCE((SELECT streak FROM jogadores WHERE pin = NEW.pin), 0) + 4, 8) + 2) / 4
            ELSE 0
        END,
        streak_apos = CASE
            WHEN NEW.resultado_partida = 'win' THEN COALESCE((SELECT streak FROM jogadores WHERE pin = NEW.pin), 0) + 1
            ELSE 0
        END
    WHERE event_id = NEW.event_id;

    INSERT INTO jogadores (pin, nome, pontos, avatar, streak, updated_at)
    VALUES (
        NEW.pin,
        NEW.nome,
        (SELECT pontos_efetivos FROM score_events WHERE event_id = NEW.event_id),
        NEW.avatar,
        (SELECT streak_apos FROM score_events WHERE event_id = NEW.event_id),
        CURRENT_TIMESTAMP
    )
    ON CONFLICT(pin) DO UPDATE SET
        pontos = jogadores.pontos + excluded.pontos,
        avatar = excluded.avatar,
        streak = excluded.streak,
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
    WHERE NEW.resultado_partida = 'win' AND NEW.registrar_tempo = 1 AND NEW.tempo_ms > 0;
END;
