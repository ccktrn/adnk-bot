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
                soundboard_id TEXT,
                yomiage_enabled INTEGER NOT NULL DEFAULT 0,
                yomiage_text_channel_id TEXT,
                yomiage_voice_channel_id TEXT,
                yomiage_speaker_id INTEGER
            )
        `);
        this.ensureColumn('yomiage_enabled', 'INTEGER NOT NULL DEFAULT 0');
        this.ensureColumn('yomiage_text_channel_id', 'TEXT');
        this.ensureColumn('yomiage_voice_channel_id', 'TEXT');
        this.ensureColumn('yomiage_speaker_id', 'INTEGER');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS yomiage_user_settings (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                speaker_id INTEGER,
                PRIMARY KEY (guild_id, user_id)
            )
        `);
    }

    private ensureColumn(name: string, definition: string) {
        const columns = this.db.all('PRAGMA table_info(configs)') as Array<{ name: string }>;
        if (!columns.some(column => column.name === name)) {
            this.db.exec(`ALTER TABLE configs ADD COLUMN ${name} ${definition}`);
        }
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

    public getYomiageConfig(guildId: string): { yomiage_enabled: number, yomiage_text_channel_id: string | null, yomiage_voice_channel_id: string | null, yomiage_speaker_id: number | null } | undefined {
        return this.db.get(`SELECT yomiage_enabled, yomiage_text_channel_id, yomiage_voice_channel_id, yomiage_speaker_id FROM configs WHERE guild_id = @guild_id`, { '@guild_id': guildId });
    }

    public setYomiageConfig(guildId: string, enabled: boolean, textChannelId: string | null, voiceChannelId: string | null, speakerId: number | null) {
        this.db.run(`
            INSERT INTO configs (guild_id, yomiage_enabled, yomiage_text_channel_id, yomiage_voice_channel_id, yomiage_speaker_id)
            VALUES (@guild_id, @enabled, @text_channel_id, @voice_channel_id, @speaker_id)
            ON CONFLICT(guild_id) DO UPDATE SET
              yomiage_enabled = @enabled,
              yomiage_text_channel_id = @text_channel_id,
              yomiage_voice_channel_id = @voice_channel_id,
              yomiage_speaker_id = @speaker_id
        `, { '@guild_id': guildId, '@enabled': enabled ? 1 : 0, '@text_channel_id': textChannelId, '@voice_channel_id': voiceChannelId, '@speaker_id': speakerId });
    }

    public disableYomiageForVoiceChannel(guildId: string, voiceChannelId: string) {
        this.db.run(`UPDATE configs SET yomiage_enabled = 0 WHERE guild_id = @guild_id AND yomiage_voice_channel_id = @voice_channel_id`, { '@guild_id': guildId, '@voice_channel_id': voiceChannelId });
    }
}
