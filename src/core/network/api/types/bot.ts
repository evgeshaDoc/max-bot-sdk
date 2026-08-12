import type { UserWithPhoto } from './user';

/** Command displayed by MAX clients for the bot. */
export interface BotCommand {
  name: string;
  description?: string | null;
}

/** Profile returned for the bot identified by the access token. */
export interface BotInfo extends UserWithPhoto {
  commands?: BotCommand[] | null;
}
