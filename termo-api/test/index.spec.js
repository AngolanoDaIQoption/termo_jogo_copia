import { env, createExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src";

const MASTER_KEY = "test-master-key";

async function salvarEvento(body, key = MASTER_KEY) {
	const request = new Request("https://termo-api.test/salvar", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Master-Key": key,
		},
		body: JSON.stringify(body),
	});
	const response = await worker.fetch(
		request,
		{ DB: env.DB, MASTER_KEY },
		createExecutionContext(),
	);
	return { response, data: await response.json() };
}

describe("POST /salvar idempotent score events", () => {
	beforeEach(async () => {
		await env.DB.batch([
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
			),
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS jogadores (pin TEXT PRIMARY KEY, nome TEXT NOT NULL, pontos INTEGER NOT NULL DEFAULT 0, avatar TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
			),
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, jogador_pin TEXT, nome_display TEXT NOT NULL, tempo_ms INTEGER NOT NULL, avatar TEXT NOT NULL, historico_json TEXT, data_formatada TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (jogador_pin) REFERENCES jogadores(pin) ON DELETE SET NULL)",
			),
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS score_events (event_id TEXT PRIMARY KEY, pin TEXT NOT NULL, nome TEXT NOT NULL, pontos INTEGER NOT NULL CHECK (pontos >= 0 AND pontos <= 100), avatar TEXT NOT NULL, registrar_tempo INTEGER NOT NULL DEFAULT 0, tempo_ms INTEGER NOT NULL DEFAULT 0, historico_json TEXT NOT NULL DEFAULT '[]', data_formatada TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
			),
		]);
		await env.DB.prepare(`
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
			END
		`).run();
		await env.DB.batch([
			env.DB.prepare("DELETE FROM score_events"),
			env.DB.prepare("DELETE FROM partidas"),
			env.DB.prepare("DELETE FROM jogadores"),
			env.DB.prepare("DELETE FROM system_config"),
		]);
	});

	it("does not award points or create a weekly record twice for the same event", async () => {
		const event = {
			eventId: "game-unique-001",
			nome: "JOGADOR",
			pin: "PIN-001",
			tempoMs: 4500,
			avatar: "doge",
			registrarTempo: true,
			pontosGanhos: 20,
			historico: ["GRATO"],
			data: "08/11/2026",
		};

		const first = await salvarEvento(event);
		const retry = await salvarEvento(event);
		const player = await env.DB.prepare(
			"SELECT pontos FROM jogadores WHERE pin = ?",
		)
			.bind(event.pin)
			.first();
		const eventCount = await env.DB.prepare(
			"SELECT COUNT(*) AS total FROM score_events WHERE event_id = ?",
		)
			.bind(event.eventId)
			.first();
		const recordCount = await env.DB.prepare(
			"SELECT COUNT(*) AS total FROM partidas WHERE jogador_pin = ?",
		)
			.bind(event.pin)
			.first();

		expect(first.response.status).toBe(200);
		expect(first.data.duplicado).toBe(false);
		expect(retry.response.status).toBe(200);
		expect(retry.data.duplicado).toBe(true);
		expect(player.pontos).toBe(20);
		expect(eventCount.total).toBe(1);
		expect(recordCount.total).toBe(1);
	});

	it("accumulates points for distinct events from the same player", async () => {
		const baseEvent = {
			nome: "JOGADOR",
			pin: "PIN-002",
			tempoMs: 5000,
			avatar: "doge",
			registrarTempo: false,
			pontosGanhos: 10,
			historico: ["GRATO"],
			data: "08/11/2026",
		};

		await salvarEvento({ ...baseEvent, eventId: "game-unique-002" });
		const second = await salvarEvento({ ...baseEvent, eventId: "game-unique-003" });
		const player = await env.DB.prepare(
			"SELECT pontos FROM jogadores WHERE pin = ?",
		)
			.bind(baseEvent.pin)
			.first();

		expect(second.data.duplicado).toBe(false);
		expect(player.pontos).toBe(20);
	});

	it("rejects malformed event identifiers", async () => {
		const result = await salvarEvento({
			eventId: "not a valid id",
			nome: "JOGADOR",
			pin: "PIN-003",
			pontosGanhos: 10,
		});

		expect(result.response.status).toBe(400);
		expect(result.data.erro).toBe("Identificador de partida inválido.");
	});

	it("requires the master key", async () => {
		const result = await salvarEvento({
			eventId: "game-unique-004",
			nome: "JOGADOR",
			pin: "PIN-004",
			pontosGanhos: 10,
		}, "wrong-key");

		expect(result.response.status).toBe(401);
	});
});
