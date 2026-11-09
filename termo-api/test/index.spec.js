import { env, createExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker, { getSemanaAtual } from "../src";

const MASTER_KEY = "test-master-key";

async function ensureColumn(table, column, definition) {
	const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
	if (!results.some((item) => item.name === column)) {
		await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
	}
}

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

async function salvarTempo(body, key = MASTER_KEY) {
	const request = new Request("https://termo-api.test/tempo", {
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

async function atualizarAvatar(body, key = MASTER_KEY) {
	const request = new Request("https://termo-api.test/perfil/avatar", {
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

async function atualizarNick(body, key = MASTER_KEY) {
	const request = new Request("https://termo-api.test/perfil/nome", {
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
		await env.DB.prepare("DROP TRIGGER IF EXISTS score_events_after_insert").run();
		await env.DB.batch([
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
			),
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS jogadores (pin TEXT PRIMARY KEY, nome TEXT NOT NULL, pontos INTEGER NOT NULL DEFAULT 0, avatar TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
			),
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, jogador_pin TEXT, nome_display TEXT NOT NULL, tempo_ms INTEGER NOT NULL, avatar TEXT NOT NULL, historico_json TEXT, data_formatada TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (jogador_pin) REFERENCES jogadores(pin) ON DELETE SET NULL)",
			),
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS score_events (event_id TEXT PRIMARY KEY, pin TEXT NOT NULL, nome TEXT NOT NULL, pontos INTEGER NOT NULL CHECK (pontos >= 0 AND pontos <= 100), avatar TEXT NOT NULL, registrar_tempo INTEGER NOT NULL DEFAULT 0, tempo_ms INTEGER NOT NULL DEFAULT 0, historico_json TEXT NOT NULL DEFAULT '[]', data_formatada TEXT NOT NULL, resultado_partida TEXT NOT NULL DEFAULT 'win', pontos_efetivos INTEGER NOT NULL DEFAULT 0, streak_apos INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
			),
		]);
		await ensureColumn("jogadores", "streak", "INTEGER NOT NULL DEFAULT 0");
		await ensureColumn("score_events", "resultado_partida", "TEXT NOT NULL DEFAULT 'win'");
		await ensureColumn("score_events", "pontos_efetivos", "INTEGER NOT NULL DEFAULT 0");
		await ensureColumn("score_events", "streak_apos", "INTEGER NOT NULL DEFAULT 0");
		await env.DB.prepare("UPDATE score_events SET pontos_efetivos = pontos WHERE pontos_efetivos = 0 AND resultado_partida = 'win'").run();
		await env.DB.prepare(`
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
					nome = NEW.nome,
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
			"SELECT pontos, streak FROM jogadores WHERE pin = ?",
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
		expect(player.streak).toBe(1);
		expect(retry.data.pontosGanhos).toBe(20);
		expect(eventCount.total).toBe(1);
		expect(recordCount.total).toBe(1);
	});

	it("applies the capped streak multiplier and resets it after a loss", async () => {
		const baseEvent = {
			nome: "JOGADOR",
			pin: "PIN-STREAK",
			tempoMs: 5000,
			avatar: "doge",
			registrarTempo: false,
			pontosGanhos: 40,
			historico: ["GRATO"],
			data: "08/11/2026",
		};

		const results = [];
		for (let streak = 1; streak <= 6; streak++) {
			results.push(await salvarEvento({ ...baseEvent, eventId: `streak-win-${streak}` }));
		}
		const loss = await salvarEvento({
			...baseEvent,
			eventId: "streak-loss",
			tempoMs: 0,
			pontosGanhos: 0,
			resultadoPartida: "loss",
		});
		const nextWin = await salvarEvento({ ...baseEvent, eventId: "streak-after-loss" });
		const player = await env.DB.prepare(
			"SELECT pontos, streak FROM jogadores WHERE pin = 'PIN-STREAK'",
		).first();

		expect(results.map((result) => result.data.pontosGanhos)).toEqual([40, 50, 60, 70, 80, 80]);
		expect(results.map((result) => result.data.streak)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(results[5].data.multiplicador).toBe(2);
		expect(loss.data.streak).toBe(0);
		expect(nextWin.data.streak).toBe(1);
		expect(player.streak).toBe(1);
		expect(player.pontos).toBe(420);
	});

	it("makes a duplicate loss idempotent", async () => {
		await salvarEvento({
			eventId: "streak-before-abandon",
			nome: "JOGADOR",
			pin: "PIN-ABANDON",
			pontosGanhos: 10,
			avatar: "doge",
			registrarTempo: false,
		});
		const abandon = {
			eventId: "streak-abandon",
			nome: "JOGADOR",
			pin: "PIN-ABANDON",
			pontosGanhos: 0,
			avatar: "doge",
			registrarTempo: false,
			resultadoPartida: "abandon",
		};

		const first = await salvarEvento(abandon);
		const retry = await salvarEvento(abandon);
		const player = await env.DB.prepare(
			"SELECT pontos, streak FROM jogadores WHERE pin = 'PIN-ABANDON'",
		).first();

		expect(first.data.duplicado).toBe(false);
		expect(retry.data.duplicado).toBe(true);
		expect(player.pontos).toBe(10);
		expect(player.streak).toBe(0);
	});

	it("routes legacy saves without event IDs through streak scoring", async () => {
		const result = await salvarEvento({
			nome: "JOGADOR",
			pin: "PIN-LEGACY",
			pontosGanhos: 10,
			avatar: "doge",
			registrarTempo: false,
		});
		const player = await env.DB.prepare(
			"SELECT pontos, streak FROM jogadores WHERE pin = 'PIN-LEGACY'",
		).first();

		expect(result.response.status).toBe(200);
		expect(result.data.pontosGanhos).toBe(10);
		expect(player.pontos).toBe(10);
		expect(player.streak).toBe(1);
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
		expect(player.pontos).toBe(23);
		expect(second.data.pontosGanhos).toBe(13);
	});

	it("updates the profile nickname without changing points", async () => {
		await env.DB.prepare(
			"INSERT INTO jogadores (pin, nome, pontos, avatar) VALUES ('PIN-NICK', 'ANTIGO', 120, 'doge')",
		).run();

		const result = await atualizarNick({ pin: "pin-nick", nome: "NOVO NICK!" });
		const player = await env.DB.prepare(
			"SELECT nome, pontos FROM jogadores WHERE pin = 'PIN-NICK'",
		).first();

		expect(result.response.status).toBe(200);
		expect(result.data.nome).toBe("NOVO NICK!");
		expect(player.nome).toBe("NOVO NICK!");
		expect(player.pontos).toBe(120);
	});

	it("rejects a nickname equal to the account PIN", async () => {
		const result = await atualizarNick({ pin: "PIN-NICK", nome: "pin-nick" });

		expect(result.response.status).toBe(400);
		expect(result.data.erro).toBe("PIN ou nick inválido.");
	});

	it("does not restore an outdated nickname when a pending score event arrives", async () => {
		await env.DB.prepare(
			"INSERT INTO jogadores (pin, nome, pontos, avatar) VALUES ('PIN-NICK', 'NICK ATUAL', 120, 'doge')",
		).run();

		const result = await salvarEvento({
			eventId: "pending-old-nickname",
			nome: "NICK ANTIGO",
			pin: "PIN-NICK",
			tempoMs: 5000,
			avatar: "doge",
			registrarTempo: false,
			pontosGanhos: 10,
			historico: ["MEIAS"],
			data: "08/11/2026",
		});
		const player = await env.DB.prepare(
			"SELECT nome, pontos FROM jogadores WHERE pin = 'PIN-NICK'",
		).first();

		expect(result.response.status).toBe(200);
		expect(result.data.nome).toBe("NICK ATUAL");
		expect(player.nome).toBe("NICK ATUAL");
		expect(player.pontos).toBe(130);
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

	it("rejects invalid outcomes and points on non-winning results", async () => {
		const invalidOutcome = await salvarEvento({
			eventId: "invalid-outcome",
			nome: "JOGADOR",
			pin: "PIN-INVALID",
			pontosGanhos: 0,
			resultadoPartida: "draw",
		});
		const pointsOnLoss = await salvarEvento({
			eventId: "points-on-loss",
			nome: "JOGADOR",
			pin: "PIN-INVALID",
			pontosGanhos: 10,
			resultadoPartida: "loss",
		});

		expect(invalidOutcome.response.status).toBe(400);
		expect(pointsOnLoss.response.status).toBe(400);
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

describe("POST /tempo", () => {
	beforeEach(async () => {
		await env.DB.batch([
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
			),
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS jogadores (pin TEXT PRIMARY KEY, nome TEXT NOT NULL, pontos INTEGER NOT NULL DEFAULT 0, avatar TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
			),
			env.DB.prepare(
				"CREATE TABLE IF NOT EXISTS partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, jogador_pin TEXT, nome_display TEXT NOT NULL, tempo_ms INTEGER NOT NULL, avatar TEXT NOT NULL, historico_json TEXT, data_formatada TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (jogador_pin) REFERENCES jogadores(pin) ON DELETE SET NULL)",
			),
			env.DB.prepare("DELETE FROM partidas"),
			env.DB.prepare("DELETE FROM jogadores"),
			env.DB.prepare("DELETE FROM system_config"),
		]);
		await ensureColumn("jogadores", "streak", "INTEGER NOT NULL DEFAULT 0");
	});

	describe("POST /perfil/avatar", () => {
		beforeEach(async () => {
			await env.DB.batch([
				env.DB.prepare(
					"CREATE TABLE IF NOT EXISTS jogadores (pin TEXT PRIMARY KEY, nome TEXT NOT NULL, pontos INTEGER NOT NULL DEFAULT 0, avatar TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
				),
				env.DB.prepare("DELETE FROM jogadores"),
			]);
		});

		it("updates the account avatar without changing its points", async () => {
			await env.DB.prepare(
				"INSERT INTO jogadores (pin, nome, pontos, avatar) VALUES ('PIN-AVATAR', 'JOGADOR', 120, 'doge')",
			).run();

			const result = await atualizarAvatar({ pin: "pin-avatar", avatar: "pikachu" });
			const player = await env.DB.prepare(
				"SELECT pontos, avatar FROM jogadores WHERE pin = 'PIN-AVATAR'",
			).first();

			expect(result.response.status).toBe(200);
			expect(result.data.sucesso).toBe(true);
			expect(player.avatar).toBe("pikachu");
			expect(player.pontos).toBe(120);
		});

		it("returns not found when the account does not exist", async () => {
			const result = await atualizarAvatar({ pin: "UNKNOWN", avatar: "pikachu" });

			expect(result.response.status).toBe(404);
			expect(result.data.erro).toBe("Perfil não encontrado no ranking geral.");
		});
	});

	it("saves a public time ID without PIN or general-score account", async () => {
		const result = await salvarTempo({
			id: "DEV",
			tempoMs: 9340,
			avatar: "doge",
			historico: ["GRATO", "COLEI", "FEITO", "FEIXE", "REFEM"],
			data: "08/11/2026",
		});
		const record = await env.DB.prepare(
			"SELECT jogador_pin, nome_display, tempo_ms FROM partidas ORDER BY id DESC LIMIT 1",
		).first();
		const players = await env.DB.prepare(
			"SELECT COUNT(*) AS total FROM jogadores",
		).first();

		expect(result.response.status).toBe(200);
		expect(result.data.sucesso).toBe(true);
		expect(record.jogador_pin).toBeNull();
		expect(record.nome_display).toBe("DEV");
		expect(record.tempo_ms).toBe(9340);
		expect(players.total).toBe(0);
	});

	it("rejects a time without a valid public ID", async () => {
		const blankId = await salvarTempo({ id: " ", tempoMs: 9000 });
		const unsafeId = await salvarTempo({ id: "<DEV>", tempoMs: 9000 });

		expect(blankId.response.status).toBe(400);
		expect(unsafeId.response.status).toBe(400);
		expect(blankId.data.erro).toBe("ID público ou dados de tempo inválidos.");
	});

	it("starts the week on Sunday at midnight in Sao Paulo", () => {
		expect(getSemanaAtual(new Date("2026-11-08T02:59:59.000Z"))).toBe("2026-11-01");
		expect(getSemanaAtual(new Date("2026-11-08T03:00:00.000Z"))).toBe("2026-11-08");
		expect(getSemanaAtual(new Date("2026-11-15T02:59:59.000Z"))).toBe("2026-11-08");
		expect(getSemanaAtual(new Date("2026-11-15T03:00:00.000Z"))).toBe("2026-11-15");
	});

	it("preserves existing times when initializing the Sunday reset marker", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO partidas (jogador_pin, nome_display, tempo_ms, avatar, data_formatada) VALUES (NULL, 'ATUAL', 5000, 'doge', '08/11/2026')",
			),
			env.DB.prepare(
				"INSERT INTO system_config (key, value) VALUES ('semanaReset', '2026-11-09')",
			),
		]);

		const request = new Request("https://termo-api.test/", {
			headers: { "X-Master-Key": MASTER_KEY },
		});
		const response = await worker.fetch(
			request,
			{ DB: env.DB, MASTER_KEY },
			createExecutionContext(),
		);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.topTempos).toHaveLength(1);
		expect(data.topTempos[0].nome).toBe("ATUAL");
	});

	it("resets weekly times without deleting general-score accounts", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO jogadores (pin, nome, pontos, avatar) VALUES ('PIN-KEEP', 'JOGADOR', 120, 'doge')",
			),
			env.DB.prepare(
				"INSERT INTO partidas (jogador_pin, nome_display, tempo_ms, avatar, data_formatada) VALUES (NULL, 'ANTIGO', 5000, 'doge', '01/01/2000')",
			),
			env.DB.prepare(
				"INSERT INTO system_config (key, value) VALUES ('semanaReset', '2000-01-03')",
			),
			env.DB.prepare(
				"INSERT INTO system_config (key, value) VALUES ('semanaResetDomingo', '2000-01-02')",
			),
		]);

		const request = new Request("https://termo-api.test/", {
			headers: { "X-Master-Key": MASTER_KEY },
		});
		const response = await worker.fetch(
			request,
			{ DB: env.DB, MASTER_KEY },
			createExecutionContext(),
		);
		const data = await response.json();
		const player = await env.DB.prepare(
			"SELECT pontos FROM jogadores WHERE pin = 'PIN-KEEP'",
		).first();

		expect(response.status).toBe(200);
		expect(data.topTempos).toHaveLength(0);
		expect(player.pontos).toBe(120);
	});
});
