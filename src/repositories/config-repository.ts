import { SQLiteService } from "../lib/sqlite";

export class ConfigRepository {
    private db: SQLiteService;

    constructor() {
        this.db = SQLiteService.getInstance();
        this.initTable();
    }

    private initTable() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS configs (
                guild_id TEXT PRIMARY KEY,
                vc_id TEXT,
                soundboard_id TEXT
            )
        `);
    }

    public getConfig(guildId: string): { guild_id: string, vc_id: string | null, soundboard_id: string | null } | undefined {
        return this.db.get(`SELECT * FROM configs WHERE guild_id = @guild_id`, { '@guild_id': guildId });
    }

    public setVcId(guildId: string, vcId: string | null) {
        this.db.run(`
            INSERT INTO configs (guild_id, vc_id) VALUES (@guild_id, @vc_id)
            ON CONFLICT(guild_id) DO UPDATE SET vc_id = @vc_id
        `, { '@guild_id': guildId, '@vc_id': vcId });
    }

    public setSoundboardId(guildId: string, soundboardId: string | null) {
        this.db.run(`
            INSERT INTO configs (guild_id, soundboard_id) VALUES (@guild_id, @soundboard_id)
            ON CONFLICT(guild_id) DO UPDATE SET soundboard_id = @soundboard_id
        `, { '@guild_id': guildId, '@soundboard_id': soundboardId });
    }
}
