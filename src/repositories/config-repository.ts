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
                yomiage_speaker_id INTEGER,
                yomiage_speed_scale REAL
            )
        `);
        this.ensureColumn('yomiage_enabled', 'INTEGER NOT NULL DEFAULT 0');
        this.ensureColumn('yomiage_text_channel_id', 'TEXT');
        this.ensureColumn('yomiage_voice_channel_id', 'TEXT');
        this.ensureColumn('yomiage_speaker_id', 'INTEGER');
        this.ensureColumn('yomiage_speed_scale', 'REAL');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS yomiage_user_settings (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                speaker_id INTEGER,
                speed_scale REAL,
                PRIMARY KEY (guild_id, user_id)
            )
        `);
        this.ensureUserColumn('speed_scale', 'REAL');
    }

    private ensureColumn(name: string, definition: string) {
        const columns = this.db.all('PRAGMA table_info(configs)') as Array<{ name: string }>;
        if (!columns.some(column => column.name === name)) {
            this.db.exec(`ALTER TABLE configs ADD COLUMN ${name} ${definition}`);
        }
    }
    private ensureUserColumn(name: string, definition: string) {
        const columns = this.db.all('PRAGMA table_info(yomiage_user_settings)') as Array<{ name: string }>;
        if (!columns.some(column => column.name === name)) this.db.exec(`ALTER TABLE yomiage_user_settings ADD COLUMN ${name} ${definition}`);
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

    public getYomiageConfig(guildId: string): { yomiage_enabled: number, yomiage_text_channel_id: string | null, yomiage_voice_channel_id: string | null, yomiage_speaker_id: number | null, yomiage_speed_scale: number | null } | undefined {
        return this.db.get(`SELECT yomiage_enabled, yomiage_text_channel_id, yomiage_voice_channel_id, yomiage_speaker_id, yomiage_speed_scale FROM configs WHERE guild_id = @guild_id`, { '@guild_id': guildId });
    }

    public setYomiageConfig(guildId: string, enabled: boolean, textChannelId: string | null, voiceChannelId: string | null, speakerId: number | null, speedScale: number | null) {
        this.db.run(`
            INSERT INTO configs (guild_id, yomiage_enabled, yomiage_text_channel_id, yomiage_voice_channel_id, yomiage_speaker_id, yomiage_speed_scale)
            VALUES (@guild_id, @enabled, @text_channel_id, @voice_channel_id, @speaker_id, @speed_scale)
            ON CONFLICT(guild_id) DO UPDATE SET
              yomiage_enabled = @enabled,
              yomiage_text_channel_id = @text_channel_id,
              yomiage_voice_channel_id = @voice_channel_id,
              yomiage_speaker_id = @speaker_id,
              yomiage_speed_scale = @speed_scale
        `, { '@guild_id': guildId, '@enabled': enabled ? 1 : 0, '@text_channel_id': textChannelId, '@voice_channel_id': voiceChannelId, '@speaker_id': speakerId, '@speed_scale': speedScale });
    }

    public disableYomiageForVoiceChannel(guildId: string, voiceChannelId: string) {
        this.db.run(`UPDATE configs SET yomiage_enabled = 0 WHERE guild_id = @guild_id AND yomiage_voice_channel_id = @voice_channel_id`, { '@guild_id': guildId, '@voice_channel_id': voiceChannelId });
    }
    public getYomiageUserSettings(guildId: string, userId: string): { speaker_id: number | null, speed_scale: number | null } | undefined {
        return this.db.get(`SELECT speaker_id, speed_scale FROM yomiage_user_settings WHERE guild_id = @guild_id AND user_id = @user_id`, { '@guild_id': guildId, '@user_id': userId });
    }
    public setYomiageUserSettings(guildId: string, userId: string, speakerId: number | null, speedScale: number | null) {
        this.db.run(`INSERT INTO yomiage_user_settings (guild_id, user_id, speaker_id, speed_scale) VALUES (@guild_id, @user_id, @speaker_id, @speed_scale) ON CONFLICT(guild_id, user_id) DO UPDATE SET speaker_id = COALESCE(@speaker_id, speaker_id), speed_scale = COALESCE(@speed_scale, speed_scale)`, { '@guild_id': guildId, '@user_id': userId, '@speaker_id': speakerId, '@speed_scale': speedScale });
    }
    public setYomiageDefaultSpeaker(guildId: string, speakerId: number) {
        this.db.run(`INSERT INTO configs (guild_id, yomiage_speaker_id) VALUES (@guild_id, @speaker_id) ON CONFLICT(guild_id) DO UPDATE SET yomiage_speaker_id = @speaker_id`, { '@guild_id': guildId, '@speaker_id': speakerId });
    }
    public setYomiageDefaultSpeed(guildId: string, speedScale: number) {
        this.db.run(`INSERT INTO configs (guild_id, yomiage_speed_scale) VALUES (@guild_id, @speed_scale) ON CONFLICT(guild_id) DO UPDATE SET yomiage_speed_scale = @speed_scale`, { '@guild_id': guildId, '@speed_scale': speedScale });
    }
}
